import { describe, expect, it } from 'vitest';
import { ETAPAS_CICLO_VIDA } from './catalogos';
import { Entregable } from './modelos';
import {
  APROBADORES_REQUERIDOS,
  ENTREGABLES_OBLIGATORIOS,
  evaluarGate,
  validarAprobacion,
} from './gates';
import { ErrorValidacion } from './errores';

function entregable(sobre: Partial<Entregable> & { nombre: string }): Entregable {
  return {
    id: `ent-${sobre.nombre}`,
    proyectoId: 'p1',
    etapa: 'Planteamiento',
    version: 1,
    aprobadoPorId: null,
    aprobadoEn: null,
    creadoPorId: 'u-autor',
    ...sobre,
  };
}

describe('entregables obligatorios', () => {
  it('define al menos un entregable obligatorio en cada etapa', () => {
    for (const etapa of ETAPAS_CICLO_VIDA) {
      expect(ENTREGABLES_OBLIGATORIOS[etapa].length).toBeGreaterThan(0);
    }
  });

  it('exige aprobadores Admin/Sponsor (matriz 1.5)', () => {
    expect(APROBADORES_REQUERIDOS).toEqual(['Admin', 'Sponsor']);
  });
});

describe('evaluarGate', () => {
  it('gate cerrado sin entregables', () => {
    const gate = evaluarGate('Planteamiento', []);
    expect(gate.abierto).toBe(false);
    expect(gate.faltantes).toEqual(['Acta de planteamiento']);
  });

  it('gate cerrado con entregable cargado pero sin aprobar', () => {
    const gate = evaluarGate('Planteamiento', [
      entregable({ nombre: 'Acta de planteamiento' }),
    ]);
    expect(gate.faltantes).toEqual([]);
    expect(gate.pendientesAprobacion).toEqual(['Acta de planteamiento']);
    expect(gate.abierto).toBe(false);
  });

  it('gate abierto con todos los obligatorios aprobados', () => {
    const gate = evaluarGate('Planteamiento', [
      entregable({
        nombre: 'Acta de planteamiento',
        aprobadoPorId: 'u-sponsor',
        aprobadoEn: '2026-11-05T10:00:00Z',
      }),
    ]);
    expect(gate.abierto).toBe(true);
  });

  it('ignora entregables de otras etapas', () => {
    const gate = evaluarGate('Iniciativa', [
      entregable({
        nombre: 'Acta de planteamiento',
        etapa: 'Planteamiento',
        aprobadoPorId: 'u-sponsor',
      }),
    ]);
    expect(gate.abierto).toBe(false);
    expect(gate.faltantes).toEqual(['Documento de iniciativa']);
  });

  it('entregable no obligatorio no bloquea el gate', () => {
    const gate = evaluarGate('Planteamiento', [
      entregable({
        nombre: 'Acta de planteamiento',
        aprobadoPorId: 'u-sponsor',
      }),
      entregable({ nombre: 'Anexo opcional' }),
    ]);
    expect(gate.abierto).toBe(true);
  });
});

describe('validarAprobacion', () => {
  const base = entregable({ nombre: 'Acta de planteamiento' });

  it('el autor no puede aprobar su propio documento (caso limite)', () => {
    expect(() => validarAprobacion(base, 'u-autor')).toThrowError(ErrorValidacion);
    try {
      validarAprobacion(base, 'u-autor');
      expect.unreachable('debia lanzar');
    } catch (e) {
      expect((e as Error).message).toContain('no puede aprobar su propio documento');
    }
  });

  it('un entregable ya aprobado no se reaprueba', () => {
    const aprobado: Entregable = {
      ...base,
      aprobadoPorId: 'u-admin',
      aprobadoEn: '2026-11-05T10:00:00Z',
    };
    expect(() => validarAprobacion(aprobado, 'u-sponsor')).toThrowError(ErrorValidacion);
  });

  it('un aprobador distinto del autor puede aprobar', () => {
    expect(() => validarAprobacion(base, 'u-sponsor')).not.toThrow();
  });
});
