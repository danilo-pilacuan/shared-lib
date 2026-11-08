/**
 * Gate de etapa (docs/funcionalidades.md 3.4 y principio rector del rulebook):
 * no se avanza de etapa sin los entregables obligatorios aprobados. Es
 * funcionalidad de primera clase, no un adorno.
 */
import { EtapaCicloVida, Rol } from './catalogos';
import { ErrorValidacion } from './errores';
import { Entregable } from './modelos';

/** Documentos obligatorios por etapa; sin ellos el gate no abre. */
export const ENTREGABLES_OBLIGATORIOS: Readonly<Record<EtapaCicloVida, readonly string[]>> = {
  Planteamiento: ['Acta de planteamiento'],
  Iniciativa: ['Documento de iniciativa'],
  PoC: ['Plan de prueba de concepto'],
  ValidacionPoC: ['Informe de validacion de PoC'],
  Planeacion: ['Plan de proyecto'],
  Contratos: ['Contrato o acta de compromisos'],
  Ejecucion: ['Acta de avance de ejecucion'],
  Operacion: ['Acta de operacion'],
  Cierre: ['Acta de cierre'],
};

/** Roles cuya aprobacion se exige para abrir el gate (matriz 1.5). */
export const APROBADORES_REQUERIDOS: readonly Rol[] = ['Admin', 'Sponsor'];

/** Estado del gate de una etapa: que falta y si esta abierto. */
export interface EstadoGate {
  readonly etapa: EtapaCicloVida;
  readonly entregables: readonly Entregable[];
  /** Nombres obligatorios ya aprobados. */
  readonly aprobados: readonly string[];
  /** Nombres obligatorios sin entregable cargado. */
  readonly faltantes: readonly string[];
  /** Nombres obligatorios con entregable aun sin aprobacion. */
  readonly pendientesAprobacion: readonly string[];
  readonly abierto: boolean;
}

/**
 * Evalua el gate de la etapa origen con los entregables del proyecto:
 * para avanzar desde `etapa`, sus documentos obligatorios deben existir y
 * estar aprobados.
 */
export function evaluarGate(
  etapa: EtapaCicloVida,
  entregables: readonly Entregable[],
): EstadoGate {
  const obligatorios = ENTREGABLES_OBLIGATORIOS[etapa];
  const deEtapa = entregables.filter((e) => e.etapa === etapa);
  const obligatoriosDeEtapa = deEtapa.filter((e) =>
    obligatorios.includes(e.nombre),
  );
  const aprobados = obligatoriosDeEtapa
    .filter((e) => e.aprobadoPorId !== null)
    .map((e) => e.nombre);
  const faltantes = obligatorios.filter(
    (nombre) => !deEtapa.some((e) => e.nombre === nombre),
  );
  const pendientesAprobacion = deEtapa
    .filter((e) => obligatorios.includes(e.nombre) && e.aprobadoPorId === null)
    .map((e) => e.nombre);
  return {
    etapa,
    entregables: deEtapa,
    aprobados,
    faltantes,
    pendientesAprobacion,
    abierto: faltantes.length === 0 && pendientesAprobacion.length === 0,
  };
}

/**
 * Valida la aprobacion de un entregable (caso limite del rulebook): el autor
 * no puede aprobar su propio documento y un entregable ya aprobado no se
 * reaprueba. Lanza ErrorValidacion.
 */
export function validarAprobacion(entregable: Entregable, aprobadorId: string): void {
  if (entregable.aprobadoPorId !== null) {
    throw new ErrorValidacion(
      `El entregable "${entregable.nombre}" ya fue aprobado y no admite otra aprobacion.`,
    );
  }
  if (entregable.creadoPorId === aprobadorId) {
    throw new ErrorValidacion(
      'El autor de un entregable no puede aprobar su propio documento.',
    );
  }
}
