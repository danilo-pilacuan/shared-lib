/**
 * Store de dominio de proyectos (docs/funcionalidades.md 2.x, 3.x, 4.x, 5.x).
 * Toda la logica de negocio vive aqui una sola vez; los componentes no la
 * reimplementan (rulebook AGENTS.md). Estado en memoria con signals (10.1).
 */
import { Injectable, computed, signal } from '@angular/core';
import { Accion, EstadoProyecto, EtapaCicloVida, ETAPAS_CICLO_VIDA } from '../domain/catalogos';
import {
  ErrorDuplicado,
  ErrorEntidadNoEncontrada,
  ErrorEstadoProyecto,
  ErrorValidacion,
} from '../domain/errores';
import { BitacoraEntrada, Entregable, EtapaTrabajo, Proyecto, Usuario } from '../domain/modelos';
import {
  avancePonderado,
  consumoTotal,
  presupuestoExcedido,
  presupuestoTotal,
  validarEtapa,
} from '../domain/calculos';
import { evaluarGate, validarAprobacion } from '../domain/gates';
import { exigirPermiso } from '../domain/matriz-permisos';
import { validarTransicion } from '../domain/ciclo-vida';
import {
  dependientesDe,
  exigirDependenciasCompletas,
  validarDependencias,
} from '../domain/dependencias';
import {
  BITACORA_SEMILLA,
  ENTREGABLES_SEMILLA,
  ETAPAS_SEMILLA,
  PROYECTOS_SEMILLA,
  USUARIOS_SEMILLA,
} from './semilla';

/** Vista de proyecto para portafolio y reportes (2.2, 7.2). */
export interface ProyectoResumen {
  readonly proyecto: Proyecto;
  readonly avance: number;
  readonly presupuestoAsignado: number;
  readonly presupuestoConsumido: number;
  readonly desviacion: number;
  readonly excedido: boolean;
}

let contador = 0;
function nuevoId(prefijo: string): string {
  contador += 1;
  return `${prefijo}-${Date.now().toString(36)}-${contador}`;
}

function indiceEtapa(etapa: EtapaCicloVida): number {
  return ETAPAS_CICLO_VIDA.indexOf(etapa);
}

@Injectable({ providedIn: 'root' })
export class ProjectStore {
  private readonly proyectosSignal = signal<readonly Proyecto[]>(PROYECTOS_SEMILLA);
  private readonly etapasSignal = signal<readonly EtapaTrabajo[]>(ETAPAS_SEMILLA);
  private readonly entregablesSignal = signal<readonly Entregable[]>(ENTREGABLES_SEMILLA);
  private readonly bitacoraSignal = signal<readonly BitacoraEntrada[]>(BITACORA_SEMILLA);

  // ---------- Lecturas ----------

  readonly proyectos = computed(() => this.proyectosSignal());
  readonly etapas = computed(() => this.etapasSignal());
  readonly entregables = computed(() => this.entregablesSignal());
  readonly bitacora = computed(() => this.bitacoraSignal());

  proyectoPorId(id: string): Proyecto | undefined {
    return this.proyectosSignal().find((p) => p.id === id);
  }

  etapasDeProyecto(proyectoId: string): readonly EtapaTrabajo[] {
    return this.etapasSignal().filter((e) => e.proyectoId === proyectoId);
  }

  entregablesDeProyecto(proyectoId: string): readonly Entregable[] {
    return this.entregablesSignal().filter((e) => e.proyectoId === proyectoId);
  }

  /** Bitacora de un proyecto, mas recientes primero (3.5). */
  bitacoraDeProyecto(proyectoId: string): readonly BitacoraEntrada[] {
    return this.bitacoraSignal()
      .filter((b) => b.proyectoId === proyectoId)
      .slice()
      .reverse();
  }

  /** Resumen calculado del portafolio (2.2); el avance nunca se edita (4.4). */
  resumen(proyectoId: string): ProyectoResumen | undefined {
    const proyecto = this.proyectoPorId(proyectoId);
    if (!proyecto) return undefined;
    const etapas = this.etapasDeProyecto(proyectoId);
    const asignado = presupuestoTotal(etapas);
    const consumido = consumoTotal(etapas);
    return {
      proyecto,
      avance: avancePonderado(etapas),
      presupuestoAsignado: asignado,
      presupuestoConsumido: consumido,
      desviacion: Math.round((consumido - asignado) * 100) / 100,
      excedido: etapas.some(presupuestoExcedido),
    };
  }

  resumenes(): readonly ProyectoResumen[] {
    return this.proyectosSignal()
      .map((p) => this.resumen(p.id))
      .filter((r): r is ProyectoResumen => r !== undefined);
  }

  /** Gate de la etapa actual del proyecto (principio rector del rulebook). */
  gateActual(proyectoId: string) {
    const proyecto = this.exigirProyecto(proyectoId);
    return evaluarGate(proyecto.etapa, this.entregablesDeProyecto(proyectoId));
  }

  // ---------- Proyectos ----------

  /** Crea un proyecto (2.1): nombre unico, nace en Planteamiento, Activo. */
  crearProyecto(
    datos: Pick<
      Proyecto,
      'nombre' | 'descripcion' | 'patrocinadorId' | 'presupuestoEstimado' | 'fechaObjetivo'
    >,
    actor: Usuario,
  ): Proyecto {
    this.exigirActorValido(actor);
    exigirPermiso('Planteamiento', 'editarProyecto', actor.roles);
    const nombre = datos.nombre.trim();
    if (!nombre) {
      throw new ErrorValidacion('El nombre del proyecto es obligatorio.');
    }
    if (this.existeNombre(nombre)) {
      throw new ErrorDuplicado('proyecto', 'nombre', nombre);
    }
    if (!Number.isFinite(datos.presupuestoEstimado) || datos.presupuestoEstimado < 0) {
      throw new ErrorValidacion('El presupuesto estimado no puede ser negativo.');
    }
    const proyecto: Proyecto = {
      id: nuevoId('p'),
      nombre,
      descripcion: datos.descripcion,
      patrocinadorId: datos.patrocinadorId,
      presupuestoEstimado: datos.presupuestoEstimado,
      fechaObjetivo: datos.fechaObjetivo,
      etapa: 'Planteamiento',
      estado: 'Activo',
    };
    this.proyectosSignal.update((lista) => [...lista, proyecto]);
    this.registrarBitacora({
      proyectoId: proyecto.id,
      autorId: actor.id,
      tipo: 'cambio',
      comentario: 'Proyecto creado en etapa Planteamiento.',
    });
    return proyecto;
  }

  /** Edita nombre/descripcion/fecha objetivo (2.5); nombre unico. */
  editarProyecto(
    proyectoId: string,
    cambios: Partial<Pick<Proyecto, 'nombre' | 'descripcion' | 'fechaObjetivo'>>,
    actor: Usuario,
  ): void {
    const proyecto = this.exigirProyecto(proyectoId);
    this.exigirActorValido(actor);
    this.exigirEstadoEditable(proyecto.estado, 'editar el proyecto');
    exigirPermiso(proyecto.etapa, 'editarProyecto', actor.roles);
    if (cambios.nombre !== undefined) {
      const nombre = cambios.nombre.trim();
      if (!nombre) {
        throw new ErrorValidacion('El nombre del proyecto es obligatorio.');
      }
      if (this.existeNombre(nombre, proyectoId)) {
        throw new ErrorDuplicado('proyecto', 'nombre', nombre);
      }
    }
    this.proyectosSignal.update((lista) =>
      lista.map((p) => (p.id === proyectoId ? { ...p, ...cambios } : p)),
    );
    this.registrarBitacora({
      proyectoId,
      autorId: actor.id,
      tipo: 'cambio',
      comentario: 'Proyecto editado.',
    });
  }

  /** Cancela el proyecto (2.6): solo Admin/Sponsor, nunca desde Cierre. */
  cancelarProyecto(proyectoId: string, actor: Usuario, comentario?: string): void {
    const proyecto = this.exigirProyecto(proyectoId);
    this.exigirActorValido(actor);
    if (proyecto.estado === 'Cerrado') {
      throw new ErrorEstadoProyecto('Un proyecto cerrado es de solo lectura.');
    }
    if (proyecto.etapa === 'Cierre') {
      throw new ErrorEstadoProyecto(
        'No se puede cancelar un proyecto en etapa Cierre; use cerrar proyecto.',
      );
    }
    exigirPermiso(proyecto.etapa, 'cancelarProyecto', actor.roles);
    this.proyectosSignal.update((lista) =>
      lista.map((p) => (p.id === proyectoId ? { ...p, estado: 'Cancelado' as const } : p)),
    );
    this.registrarBitacora({
      proyectoId,
      autorId: actor.id,
      tipo: 'cambio',
      comentario: comentario ?? 'Proyecto cancelado.',
    });
  }

  /** Cierra el proyecto (2.7): solo desde etapa Cierre; queda de solo lectura. */
  cerrarProyecto(proyectoId: string, actor: Usuario, comentario?: string): void {
    const proyecto = this.exigirProyecto(proyectoId);
    this.exigirActorValido(actor);
    if (proyecto.etapa !== 'Cierre') {
      throw new ErrorEstadoProyecto('Solo se puede cerrar un proyecto en etapa Cierre.');
    }
    if (proyecto.estado === 'Cerrado') {
      throw new ErrorEstadoProyecto('El proyecto ya esta cerrado.');
    }
    exigirPermiso('Cierre', 'cerrarProyecto', actor.roles);
    this.proyectosSignal.update((lista) =>
      lista.map((p) => (p.id === proyectoId ? { ...p, estado: 'Cerrado' as const } : p)),
    );
    this.registrarBitacora({
      proyectoId,
      autorId: actor.id,
      tipo: 'cambio',
      comentario: comentario ?? 'Proyecto cerrado.',
    });
  }

  /**
   * Transicion de etapa (3.2-3.4): valida grafo, permiso segun matriz, estado
   * del proyecto y gate de entregables; registra en bitacora.
   */
  transicionar(
    proyectoId: string,
    destino: EtapaCicloVida,
    actor: Usuario,
    comentario?: string,
  ): void {
    const proyecto = this.exigirProyecto(proyectoId);
    this.exigirActorValido(actor);
    if (proyecto.estado !== 'Activo') {
      throw new ErrorEstadoProyecto(
        `Un proyecto ${proyecto.estado.toLowerCase()} no admite transiciones.`,
      );
    }
    validarTransicion(proyecto.etapa, destino);
    const accion: Accion =
      indiceEtapa(destino) < indiceEtapa(proyecto.etapa) ? 'retrocederEtapa' : 'avanzarEtapa';
    exigirPermiso(proyecto.etapa, accion, actor.roles);
    const gate = evaluarGate(proyecto.etapa, this.entregablesDeProyecto(proyectoId));
    if (!gate.abierto) {
      throw new ErrorValidacion(
        `El gate de "${proyecto.etapa}" esta cerrado: faltan ${gate.faltantes.length} entregable(s) y hay ${gate.pendientesAprobacion.length} sin aprobar.`,
      );
    }
    this.proyectosSignal.update((lista) =>
      lista.map((p) => (p.id === proyectoId ? { ...p, etapa: destino } : p)),
    );
    this.bitacoraSignal.update((lista) => [
      ...lista,
      {
        id: nuevoId('b'),
        proyectoId,
        autorId: actor.id,
        fecha: new Date().toISOString(),
        tipo: 'transicion',
        etapaOrigen: proyecto.etapa,
        etapaDestino: destino,
        comentario: comentario ?? null,
      },
    ]);
  }

  // ---------- Etapas de trabajo ----------

  /** Crea una etapa de trabajo (4.1) con validaciones 4.5. */
  crearEtapa(datos: Omit<EtapaTrabajo, 'id' | 'presupuestoConsumido'>, actor: Usuario): EtapaTrabajo {
    const proyecto = this.exigirProyecto(datos.proyectoId);
    this.exigirActorValido(actor);
    this.exigirEstadoEditable(proyecto.estado, 'crear etapas');
    exigirPermiso(proyecto.etapa, 'editarEtapaTrabajo', actor.roles);
    const etapa: EtapaTrabajo = { ...datos, id: nuevoId('e'), presupuestoConsumido: 0 };
    validarEtapa(etapa);
    this.exigirResponsableActivo(etapa.responsableId);
    validarDependencias(
      etapa.id,
      etapa.proyectoId,
      [...this.etapasDeProyecto(etapa.proyectoId), etapa],
    );
    this.etapasSignal.update((lista) => [...lista, etapa]);
    this.registrarBitacora({
      proyectoId: proyecto.id,
      autorId: actor.id,
      tipo: 'cambio',
      comentario: `Etapa de trabajo "${etapa.nombre}" creada.`,
    });
    return etapa;
  }

  /** Edita una etapa (4.2) mientras el proyecto lo permita. */
  editarEtapa(etapaId: string, cambios: Partial<EtapaTrabajo>, actor: Usuario): void {
    const etapa = this.exigirEtapa(etapaId);
    const proyecto = this.exigirProyecto(etapa.proyectoId);
    this.exigirActorValido(actor);
    this.exigirEstadoEditable(proyecto.estado, 'editar etapas');
    exigirPermiso(proyecto.etapa, 'editarEtapaTrabajo', actor.roles);
    const candidata: EtapaTrabajo = { ...etapa, ...cambios };
    validarEtapa(candidata);
    if (cambios.responsableId !== undefined) {
      this.exigirResponsableActivo(cambios.responsableId);
    }
    validarDependencias(
      etapaId,
      etapa.proyectoId,
      this.etapasDeProyecto(etapa.proyectoId).map((e) => (e.id === etapaId ? candidata : e)),
    );
    exigirDependenciasCompletas(candidata, candidata.avance, this.etapasDeProyecto(etapa.proyectoId));
    this.etapasSignal.update((lista) => lista.map((e) => (e.id === etapaId ? candidata : e)));
  }

  /** Elimina una etapa; la confirmacion previa es responsabilidad de la UI (4.2). */
  eliminarEtapa(etapaId: string, actor: Usuario): void {
    const etapa = this.exigirEtapa(etapaId);
    const proyecto = this.exigirProyecto(etapa.proyectoId);
    this.exigirActorValido(actor);
    this.exigirEstadoEditable(proyecto.estado, 'eliminar etapas');
    exigirPermiso(proyecto.etapa, 'editarEtapaTrabajo', actor.roles);
    const dependientes = dependientesDe(etapaId, this.etapasSignal());
    if (dependientes.length > 0) {
      throw new ErrorValidacion(
        `No se puede eliminar "${etapa.nombre}": ${dependientes.length} etapa(s) dependen de ella.`,
      );
    }
    this.etapasSignal.update((lista) => lista.filter((e) => e.id !== etapaId));
  }

  /** Registra avance de una etapa (4.3); 0-100. */
  registrarAvance(etapaId: string, avance: number, actor: Usuario): void {
    const etapa = this.exigirEtapa(etapaId);
    const proyecto = this.exigirProyecto(etapa.proyectoId);
    this.exigirActorValido(actor);
    this.exigirEstadoEditable(proyecto.estado, 'registrar avance');
    exigirPermiso(proyecto.etapa, 'editarEtapaTrabajo', actor.roles);
    const candidata: EtapaTrabajo = { ...etapa, avance };
    validarEtapa(candidata);
    exigirDependenciasCompletas(etapa, avance, this.etapasDeProyecto(etapa.proyectoId));
    this.etapasSignal.update((lista) => lista.map((e) => (e.id === etapaId ? candidata : e)));
  }

  /** Registra consumo acumulado de una etapa (5.3). */
  registrarConsumo(etapaId: string, consumo: number, actor: Usuario): void {
    const etapa = this.exigirEtapa(etapaId);
    const proyecto = this.exigirProyecto(etapa.proyectoId);
    this.exigirActorValido(actor);
    this.exigirEstadoEditable(proyecto.estado, 'registrar consumo');
    exigirPermiso(proyecto.etapa, 'registrarConsumo', actor.roles);
    if (!Number.isFinite(consumo) || consumo < 0) {
      throw new ErrorValidacion('El consumo no puede ser negativo.');
    }
    this.etapasSignal.update((lista) =>
      lista.map((e) => (e.id === etapaId ? { ...e, presupuestoConsumido: consumo } : e)),
    );
  }

  // ---------- Entregables y gate ----------

  /** Carga un entregable (documento de etapa) en el proyecto. */
  crearEntregable(
    datos: Omit<Entregable, 'id' | 'aprobadoPorId' | 'aprobadoEn'>,
    actor: Usuario,
  ): Entregable {
    const proyecto = this.exigirProyecto(datos.proyectoId);
    this.exigirActorValido(actor);
    this.exigirEstadoEditable(proyecto.estado, 'cargar entregables');
    const entregable: Entregable = {
      ...datos,
      id: nuevoId('ent'),
      aprobadoPorId: null,
      aprobadoEn: null,
    };
    this.entregablesSignal.update((lista) => [...lista, entregable]);
    this.registrarBitacora({
      proyectoId: proyecto.id,
      autorId: actor.id,
      tipo: 'cambio',
      comentario: `Entregable "${entregable.nombre}" cargado (v${entregable.version}).`,
    });
    return entregable;
  }

  /** Aprueba un entregable: autor != aprobador; bitacora de aprobacion. */
  aprobarEntregable(entregableId: string, actor: Usuario): void {
    const entregable = this.exigirEntregable(entregableId);
    const proyecto = this.exigirProyecto(entregable.proyectoId);
    this.exigirActorValido(actor);
    this.exigirEstadoEditable(proyecto.estado, 'aprobar entregables');
    exigirPermiso(entregable.etapa, 'aprobarEntregable', actor.roles);
    validarAprobacion(entregable, actor.id);
    this.entregablesSignal.update((lista) =>
      lista.map((e) =>
        e.id === entregableId
          ? { ...e, aprobadoPorId: actor.id, aprobadoEn: new Date().toISOString() }
          : e,
      ),
    );
    this.registrarBitacora({
      proyectoId: proyecto.id,
      autorId: actor.id,
      tipo: 'aprobacion',
      comentario: `Entregable "${entregable.nombre}" aprobado (v${entregable.version}).`,
    });
  }

  // ---------- Helpers ----------

  private existeNombre(nombre: string, exceptoId?: string): boolean {
    const normalizado = nombre.toLowerCase();
    return this.proyectosSignal().some(
      (p) => p.id !== exceptoId && p.nombre.toLowerCase() === normalizado,
    );
  }

  private exigirProyecto(proyectoId: string): Proyecto {
    const proyecto = this.proyectoPorId(proyectoId);
    if (!proyecto) {
      throw new ErrorEntidadNoEncontrada('Proyecto', proyectoId);
    }
    return proyecto;
  }

  private exigirEtapa(etapaId: string): EtapaTrabajo {
    const etapa = this.etapasSignal().find((e) => e.id === etapaId);
    if (!etapa) {
      throw new ErrorEntidadNoEncontrada('Etapa de trabajo', etapaId);
    }
    return etapa;
  }

  private exigirEntregable(entregableId: string): Entregable {
    const entregable = this.entregablesSignal().find((e) => e.id === entregableId);
    if (!entregable) {
      throw new ErrorEntidadNoEncontrada('Entregable', entregableId);
    }
    return entregable;
  }

  private exigirActorValido(actor: Usuario): void {
    if (!actor.activo) {
      throw new ErrorValidacion('Un usuario inactivo no puede ejecutar acciones (1.8).');
    }
  }

  private exigirEstadoEditable(estado: EstadoProyecto, operacion: string): void {
    if (estado === 'Cerrado') {
      throw new ErrorEstadoProyecto('Un proyecto cerrado es de solo lectura.');
    }
    if (estado === 'Cancelado' && operacion !== 'registrar consumo') {
      throw new ErrorEstadoProyecto('Un proyecto cancelado no admite esta operacion.');
    }
  }

  private exigirResponsableActivo(responsableId: string): void {
    const responsable = USUARIOS_SEMILLA.find((u) => u.id === responsableId);
    if (!responsable) {
      throw new ErrorEntidadNoEncontrada('Usuario', responsableId);
    }
    if (!responsable.activo) {
      throw new ErrorValidacion('El responsable debe ser un usuario activo (1.8).');
    }
  }

  private registrarBitacora(entrada: {
    proyectoId: string;
    autorId: string;
    tipo: BitacoraEntrada['tipo'];
    comentario: string | null;
  }): void {
    const entradaCompleta: BitacoraEntrada = {
      id: nuevoId('b'),
      fecha: new Date().toISOString(),
      etapaOrigen: null,
      etapaDestino: null,
      ...entrada,
    };
    this.bitacoraSignal.update((lista) => [...lista, entradaCompleta]);
  }
}
