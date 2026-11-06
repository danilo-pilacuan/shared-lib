/**
 * Tests del ProjectStore (docs/funcionalidades.md 2.x-5.x y casos limite del
 * rulebook: nombre duplicado, cancelar en Cierre, gate cerrado, autor que se
 * autoaprueba, consumo en etapa no permitida, responsable inactivo).
 */
import { describe, expect, it } from 'vitest';
import {
  ErrorDuplicado,
  ErrorEntidadNoEncontrada,
  ErrorEstadoProyecto,
  ErrorPermisoDenegado,
  ErrorTransicionInvalida,
  ErrorValidacion,
} from '../domain/errores';
import { USUARIOS_SEMILLA } from './semilla';
import { ProjectStore } from './project.store';

const ADMIN = USUARIOS_SEMILLA[0]; // Admin
const SPONSOR = USUARIOS_SEMILLA[1]; // Sponsor
const PM = USUARIOS_SEMILLA[2]; // ProjectManager
const ANALISTA = USUARIOS_SEMILLA[3]; // Analista
const STAKEHOLDER = USUARIOS_SEMILLA[4]; // Stakeholder
const DOBLE = USUARIOS_SEMILLA[5]; // PM + Analista
const INACTIVO = USUARIOS_SEMILLA[6]; // Sponsor inactivo

function store(): ProjectStore {
  return new ProjectStore();
}

describe('ProjectStore - creacion de proyectos', () => {
  it('crea un proyecto en Planteamiento y Activo, y registra bitacora', () => {
    const s = store();
    const antes = s.bitacora().length;
    const proyecto = s.crearProyecto(
      {
        nombre: 'Nuevo portal',
        descripcion: 'desc',
        patrocinadorId: SPONSOR.id,
        presupuestoEstimado: 1000,
        fechaObjetivo: '2027-12-31',
      },
      ADMIN,
    );
    expect(proyecto.etapa).toBe('Planteamiento');
    expect(proyecto.estado).toBe('Activo');
    expect(s.bitacora().length).toBe(antes + 1);
  });

  it('rechaza nombre duplicado (2.1)', () => {
    const s = store();
    expect(() =>
      s.crearProyecto(
        {
          nombre: 'Portal de pagos',
          descripcion: '',
          patrocinadorId: SPONSOR.id,
          presupuestoEstimado: 1,
          fechaObjetivo: '2027-12-31',
        },
        ADMIN,
      ),
    ).toThrow(ErrorDuplicado);
  });

  it('rechaza nombre duplicado sin distinguir mayusculas', () => {
    const s = store();
    expect(() =>
      s.crearProyecto(
        {
          nombre: 'portal de PAGOS',
          descripcion: '',
          patrocinadorId: SPONSOR.id,
          presupuestoEstimado: 1,
          fechaObjetivo: '2027-12-31',
        },
        ADMIN,
      ),
    ).toThrow(ErrorDuplicado);
  });

  it('rechaza presupuesto estimado negativo', () => {
    const s = store();
    expect(() =>
      s.crearProyecto(
        {
          nombre: 'Presupuesto malo',
          descripcion: '',
          patrocinadorId: SPONSOR.id,
          presupuestoEstimado: -5,
          fechaObjetivo: '2027-12-31',
        },
        ADMIN,
      ),
    ).toThrow(ErrorValidacion);
  });

  it('rechaza acciones de un usuario inactivo (1.8)', () => {
    const s = store();
    expect(() =>
      s.crearProyecto(
        {
          nombre: 'Proyecto de inactivo',
          descripcion: '',
          patrocinadorId: SPONSOR.id,
          presupuestoEstimado: 1,
          fechaObjetivo: '2027-12-31',
        },
        INACTIVO,
      ),
    ).toThrow(ErrorValidacion);
  });

  it('rechaza crear sin permiso de edicion en la etapa', () => {
    const s = store();
    expect(() =>
      s.crearProyecto(
        {
          nombre: 'Proyecto de stakeholder',
          descripcion: '',
          patrocinadorId: SPONSOR.id,
          presupuestoEstimado: 1,
          fechaObjetivo: '2027-12-31',
        },
        STAKEHOLDER,
      ),
    ).toThrow(ErrorPermisoDenegado);
  });
});

describe('ProjectStore - edicion y estados', () => {
  it('edita nombre y descripcion', () => {
    const s = store();
    s.editarProyecto('p2', { nombre: 'DWH corporativo', descripcion: 'nueva' }, ADMIN);
    expect(s.proyectoPorId('p2')?.nombre).toBe('DWH corporativo');
  });

  it('rechaza renombrar a un nombre ya usado por otro proyecto', () => {
    const s = store();
    expect(() => s.editarProyecto('p2', { nombre: 'Portal de pagos' }, ADMIN)).toThrow(
      ErrorDuplicado,
    );
  });

  it('no permite editar un proyecto cerrado (2.7)', () => {
    const s = store();
    s.cerrarProyecto('p4', ADMIN);
    expect(() => s.editarProyecto('p4', { descripcion: 'x' }, ADMIN)).toThrow(
      ErrorEstadoProyecto,
    );
  });

  it('no permite cancelar un proyecto en etapa Cierre (2.6)', () => {
    const s = store();
    expect(() => s.cancelarProyecto('p4', ADMIN)).toThrow(ErrorEstadoProyecto);
  });

  it('cancela un proyecto activo con rol de gobernanza', () => {
    const s = store();
    s.cancelarProyecto('p2', SPONSOR, 'sin presupuesto');
    expect(s.proyectoPorId('p2')?.estado).toBe('Cancelado');
  });

  it('rechaza cancelar sin permiso (Stakeholder)', () => {
    const s = store();
    expect(() => s.cancelarProyecto('p2', STAKEHOLDER)).toThrow(ErrorPermisoDenegado);
  });

  it('solo se puede cerrar desde etapa Cierre (2.7)', () => {
    const s = store();
    expect(() => s.cerrarProyecto('p2', ADMIN)).toThrow(ErrorEstadoProyecto);
  });

  it('un proyecto cancelado no admite transiciones (3.4)', () => {
    const s = store();
    expect(() => s.transicionar('p6', 'Operacion', ADMIN)).toThrow(ErrorEstadoProyecto);
  });
});

describe('ProjectStore - transiciones y gate', () => {
  it('rechaza una transicion fuera del grafo (3.2)', () => {
    const s = store();
    expect(() => s.transicionar('p1', 'Planteamiento', ADMIN)).toThrow(
      ErrorTransicionInvalida,
    );
  });

  it('rechaza avanzar sin permiso (PM en Ejecucion)', () => {
    const s = store();
    expect(() => s.transicionar('p1', 'Operacion', PM)).toThrow(ErrorPermisoDenegado);
  });

  it('rechaza avanzar con el gate cerrado: entregable sin aprobar', () => {
    const s = store();
    // p1 esta en Ejecucion y su acta (ent-7) esta pendiente de aprobacion.
    expect(() => s.transicionar('p1', 'Operacion', ADMIN)).toThrow(ErrorValidacion);
  });

  it('abre el gate al aprobar el entregable y avanza registrando bitacora', () => {
    const s = store();
    s.aprobarEntregable('ent-7', ADMIN);
    const antes = s.bitacoraDeProyecto('p1').length;
    s.transicionar('p1', 'Operacion', ADMIN, 'acta aprobada');
    expect(s.proyectoPorId('p1')?.etapa).toBe('Operacion');
    const bitacora = s.bitacoraDeProyecto('p1');
    expect(bitacora.length).toBe(antes + 1);
    expect(bitacora[0].tipo).toBe('transicion');
    expect(bitacora[0].etapaOrigen).toBe('Ejecucion');
    expect(bitacora[0].etapaDestino).toBe('Operacion');
  });

  it('permite el retroceso PoC -> Iniciativa (3.3)', () => {
    const s = store();
    // p3 esta en PoC con su gate cerrado (ent-10 sin aprobar): se aprueba primero.
    s.aprobarEntregable('ent-10', SPONSOR);
    s.transicionar('p3', 'Iniciativa', ADMIN);
    expect(s.proyectoPorId('p3')?.etapa).toBe('Iniciativa');
  });

  it('rechaza retroceder donde el grafo no lo permite (Ejecucion -> Contratos)', () => {
    const s = store();
    expect(() => s.transicionar('p1', 'Contratos', ADMIN)).toThrow(ErrorTransicionInvalida);
  });
});

describe('ProjectStore - etapas de trabajo', () => {
  it('crea una etapa valida en proyecto en Ejecucion', () => {
    const s = store();
    const antes = s.etapasDeProyecto('p1').length;
    const etapa = s.crearEtapa(
      {
        proyectoId: 'p1',
        nombre: 'Modulo de reportes',
        fechaInicio: '2027-01-01',
        fechaFin: '2027-03-31',
        responsableId: PM.id,
        presupuestoAsignado: 20000,
        avance: 0,
      },
      ADMIN,
    );
    expect(etapa.presupuestoConsumido).toBe(0);
    expect(s.etapasDeProyecto('p1').length).toBe(antes + 1);
  });

  it('rechaza fechas invertidas (4.5)', () => {
    const s = store();
    expect(() =>
      s.crearEtapa(
        {
          proyectoId: 'p1',
          nombre: 'Fechas malas',
          fechaInicio: '2027-03-31',
          fechaFin: '2027-01-01',
          responsableId: PM.id,
          presupuestoAsignado: 1,
          avance: 0,
        },
        ADMIN,
      ),
    ).toThrow(ErrorValidacion);
  });

  it('rechaza avance fuera de 0-100 (4.5)', () => {
    const s = store();
    expect(() =>
      s.crearEtapa(
        {
          proyectoId: 'p1',
          nombre: 'Avance malo',
          fechaInicio: '2027-01-01',
          fechaFin: '2027-03-31',
          responsableId: PM.id,
          presupuestoAsignado: 1,
          avance: 150,
        },
        ADMIN,
      ),
    ).toThrow(ErrorValidacion);
  });

  it('rechaza presupuesto de etapa negativo (4.5)', () => {
    const s = store();
    expect(() =>
      s.crearEtapa(
        {
          proyectoId: 'p1',
          nombre: 'Monto negativo',
          fechaInicio: '2027-01-01',
          fechaFin: '2027-03-31',
          responsableId: PM.id,
          presupuestoAsignado: -1,
          avance: 0,
        },
        ADMIN,
      ),
    ).toThrow(ErrorValidacion);
  });

  it('rechaza un responsable inactivo (1.8)', () => {
    const s = store();
    expect(() =>
      s.crearEtapa(
        {
          proyectoId: 'p1',
          nombre: 'Responsable inactivo',
          fechaInicio: '2027-01-01',
          fechaFin: '2027-03-31',
          responsableId: INACTIVO.id,
          presupuestoAsignado: 1,
          avance: 0,
        },
        ADMIN,
      ),
    ).toThrow(ErrorValidacion);
  });

  it('rechaza crear etapas en un proyecto cancelado', () => {
    const s = store();
    expect(() =>
      s.crearEtapa(
        {
          proyectoId: 'p6',
          nombre: 'Etapa en cancelado',
          fechaInicio: '2027-01-01',
          fechaFin: '2027-03-31',
          responsableId: PM.id,
          presupuestoAsignado: 1,
          avance: 0,
        },
        ADMIN,
      ),
    ).toThrow(ErrorEstadoProyecto);
  });

  it('rechaza crear etapas sin permiso (Analista)', () => {
    const s = store();
    expect(() =>
      s.crearEtapa(
        {
          proyectoId: 'p1',
          nombre: 'Etapa de analista',
          fechaInicio: '2027-01-01',
          fechaFin: '2027-03-31',
          responsableId: ANALISTA.id,
          presupuestoAsignado: 1,
          avance: 0,
        },
        ANALISTA,
      ),
    ).toThrow(ErrorPermisoDenegado);
  });

  it('elimina una etapa con permiso', () => {
    const s = store();
    const antes = s.etapas().length;
    s.eliminarEtapa('e3', ADMIN);
    expect(s.etapas().length).toBe(antes - 1);
  });

  it('rechaza eliminar una etapa inexistente', () => {
    const s = store();
    expect(() => s.eliminarEtapa('no-existe', ADMIN)).toThrow(ErrorEntidadNoEncontrada);
  });
});

describe('ProjectStore - avance y consumo', () => {
  it('registra avance valido (4.3)', () => {
    const s = store();
    s.registrarAvance('e2', 60, DOBLE);
    expect(s.etapasDeProyecto('p1').find((e) => e.id === 'e2')?.avance).toBe(60);
  });

  it('rechaza avance fuera de rango al registrarlo', () => {
    const s = store();
    expect(() => s.registrarAvance('e2', -10, DOBLE)).toThrow(ErrorValidacion);
  });

  it('registra consumo en Ejecucion con rol habilitado (5.3)', () => {
    const s = store();
    s.registrarConsumo('e2', 45000, PM);
    expect(s.etapasDeProyecto('p1').find((e) => e.id === 'e2')?.presupuestoConsumido).toBe(
      45000,
    );
  });

  it('rechaza consumo negativo', () => {
    const s = store();
    expect(() => s.registrarConsumo('e2', -1, PM)).toThrow(ErrorValidacion);
  });

  it('rechaza consumo en una etapa sin permiso de consumo (PoC)', () => {
    const s = store();
    // p3 esta en PoC: la matriz no permite registrarConsumo ahi.
    expect(() => s.registrarConsumo('e4', 100, ADMIN)).toThrow(ErrorPermisoDenegado);
  });
});

describe('ProjectStore - entregables y aprobaciones', () => {
  it('carga un entregable nuevo', () => {
    const s = store();
    const antes = s.entregablesDeProyecto('p1').length;
    const entregable = s.crearEntregable(
      {
        proyectoId: 'p1',
        etapa: 'Ejecucion',
        nombre: 'Acta de avance de ejecucion',
        version: 2,
        creadoPorId: PM.id,
      },
      ADMIN,
    );
    expect(entregable.aprobadoPorId).toBeNull();
    expect(s.entregablesDeProyecto('p1').length).toBe(antes + 1);
  });

  it('el autor no puede aprobar su propio entregable (gate)', () => {
    const s = store();
    // Admin tiene permiso de aprobacion; si el entregable es suyo, el gate lo bloquea.
    const propio = s.crearEntregable(
      {
        proyectoId: 'p1',
        etapa: 'Ejecucion',
        nombre: 'Acta de avance de ejecucion',
        version: 2,
        creadoPorId: ADMIN.id,
      },
      ADMIN,
    );
    expect(() => s.aprobarEntregable(propio.id, ADMIN)).toThrow(ErrorValidacion);
  });

  it('rechaza aprobar sin rol de gobernanza', () => {
    const s = store();
    expect(() => s.aprobarEntregable('ent-7', PM)).toThrow(ErrorPermisoDenegado);
  });

  it('aprueba con Admin y no permite reaprobar', () => {
    const s = store();
    s.aprobarEntregable('ent-7', ADMIN);
    const aprobado = s.entregables().find((e) => e.id === 'ent-7');
    expect(aprobado?.aprobadoPorId).toBe(ADMIN.id);
    expect(aprobado?.aprobadoEn).not.toBeNull();
    expect(() => s.aprobarEntregable('ent-7', SPONSOR)).toThrow(ErrorValidacion);
  });

  it('registra la aprobacion en bitacora con tipo aprobacion', () => {
    const s = store();
    s.aprobarEntregable('ent-7', ADMIN);
    const ultima = s.bitacoraDeProyecto('p1')[0];
    expect(ultima.tipo).toBe('aprobacion');
  });
});

describe('ProjectStore - resumen del portafolio', () => {
  it('calcula avance ponderado, presupuesto y desviacion (2.2, 4.4, 5.2-5.4)', () => {
    const s = store();
    const resumen = s.resumen('p1');
    expect(resumen).toBeDefined();
    // e1: 100% x 30d, e2: 55% x 76d, e3: 20% x 120d -> 9580/226 = 42.39
    expect(resumen?.avance).toBe(42.39);
    expect(resumen?.presupuestoAsignado).toBe(150000);
    expect(resumen?.presupuestoConsumido).toBe(81500);
    expect(resumen?.desviacion).toBe(-68500);
    expect(resumen?.excedido).toBe(false);
  });

  it('marca excedido cuando una etapa consume mas de lo asignado', () => {
    const s = store();
    s.registrarConsumo('e3', 51000, PM);
    expect(s.resumen('p1')?.excedido).toBe(true);
  });

  it('devuelve undefined para un proyecto inexistente', () => {
    const s = store();
    expect(s.resumen('no-existe')).toBeUndefined();
  });

  it('gateActual refleja el estado del gate de la etapa actual', () => {
    const s = store();
    const gate = s.gateActual('p1');
    expect(gate.abierto).toBe(false);
    expect(gate.pendientesAprobacion).toContain('Acta de avance de ejecucion');
  });
});
