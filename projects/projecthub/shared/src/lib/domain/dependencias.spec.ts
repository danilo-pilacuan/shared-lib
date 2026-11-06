import { describe, expect, it } from 'vitest';
import {
  dependenciasGantt,
  dependientesDe,
  exigirDependenciasCompletas,
  prerequisitosDe,
  tieneCiclo,
  validarDependencias,
} from './dependencias';
import { ErrorValidacion } from './errores';
import type { EtapaTrabajo } from './modelos';

function etapa(parcial: Partial<EtapaTrabajo>): EtapaTrabajo {
  return {
    id: 'x1',
    proyectoId: 'p1',
    nombre: 'Etapa x',
    fechaInicio: '2026-01-01',
    fechaFin: '2026-01-31',
    responsableId: 'u1',
    presupuestoAsignado: 1000,
    presupuestoConsumido: 0,
    avance: 0,
    ...parcial,
  };
}

const BASE = [etapa({ id: 'a' }), etapa({ id: 'b' })] as const;

describe('prerequisitosDe', () => {
  it('devuelve vacio cuando la etapa no declara dependencias', () => {
    expect(prerequisitosDe(etapa({}))).toEqual([]);
  });

  it('devuelve los ids declarados', () => {
    expect(prerequisitosDe(etapa({ id: 'b', dependencias: ['a'] }))).toEqual(['a']);
  });
});

describe('validarDependencias', () => {
  it('acepta prerequisitos validos del mismo proyecto', () => {
    const etapas = [etapa({ id: 'a', avance: 100 }), etapa({ id: 'b', dependencias: ['a'] })];
    expect(() => validarDependencias('b', 'p1', etapas)).not.toThrow();
  });

  it('rechaza auto-dependencia', () => {
    const etapas = [etapa({ id: 'a', dependencias: ['a'] })];
    expect(() => validarDependencias('a', 'p1', etapas)).toThrow(ErrorValidacion);
  });

  it('rechaza prerequisito duplicado', () => {
    const etapas = [etapa({ id: 'a' }), etapa({ id: 'b', dependencias: ['a', 'a'] })];
    expect(() => validarDependencias('b', 'p1', etapas)).toThrow(/mas de una vez/);
  });

  it('rechaza prerequisito inexistente', () => {
    const etapas = [etapa({ id: 'b', dependencias: ['fantasma'] })];
    expect(() => validarDependencias('b', 'p1', etapas)).toThrow(/no existe/);
  });

  it('rechaza prerequisito de otro proyecto', () => {
    const etapas = [
      etapa({ id: 'a', proyectoId: 'p2' }),
      etapa({ id: 'b', dependencias: ['a'] }),
    ];
    expect(() => validarDependencias('b', 'p1', etapas)).toThrow(/mismo proyecto/);
  });

  it('rechaza ciclo directo a -> b -> a', () => {
    const etapas = [
      etapa({ id: 'a', dependencias: ['b'] }),
      etapa({ id: 'b', dependencias: ['a'] }),
    ];
    expect(() => validarDependencias('a', 'p1', etapas)).toThrow(/ciclo/);
  });

  it('rechaza ciclo indirecto a -> b -> c -> a', () => {
    const etapas = [
      etapa({ id: 'a', dependencias: ['c'] }),
      etapa({ id: 'b', dependencias: ['a'] }),
      etapa({ id: 'c', dependencias: ['b'] }),
    ];
    expect(() => validarDependencias('a', 'p1', etapas)).toThrow(/ciclo/);
  });

  it('acepta cadena sin ciclo a -> b -> c', () => {
    const etapas = [
      etapa({ id: 'a', avance: 100 }),
      etapa({ id: 'b', dependencias: ['a'], avance: 100 }),
      etapa({ id: 'c', dependencias: ['b'] }),
    ];
    expect(() => validarDependencias('c', 'p1', etapas)).not.toThrow();
  });
});

describe('tieneCiclo', () => {
  it('false sin aristas', () => {
    expect(tieneCiclo('a', BASE)).toBe(false);
  });

  it('true en ciclo de dos nodos', () => {
    const etapas = [
      etapa({ id: 'a', dependencias: ['b'] }),
      etapa({ id: 'b', dependencias: ['a'] }),
    ];
    expect(tieneCiclo('a', etapas)).toBe(true);
  });
});

describe('exigirDependenciasCompletas', () => {
  it('permite avance 0 aunque el prerequisito este incompleto', () => {
    const etapas = [etapa({ id: 'a', avance: 10 }), etapa({ id: 'b', dependencias: ['a'] })];
    const b = etapas[1];
    expect(() => exigirDependenciasCompletas(b, 0, etapas)).not.toThrow();
  });

  it('bloquea avance mayor que cero con prerequisito incompleto', () => {
    const etapas = [etapa({ id: 'a', avance: 99 }), etapa({ id: 'b', dependencias: ['a'] })];
    const b = etapas[1];
    expect(() => exigirDependenciasCompletas(b, 1, etapas)).toThrow(/100%/);
  });

  it('permite avance cuando el prerequisito esta al 100', () => {
    const etapas = [etapa({ id: 'a', avance: 100 }), etapa({ id: 'b', dependencias: ['a'] })];
    const b = etapas[1];
    expect(() => exigirDependenciasCompletas(b, 50, etapas)).not.toThrow();
  });

  it('evalua todos los prerequisitos declarados', () => {
    const etapas = [
      etapa({ id: 'a', avance: 100 }),
      etapa({ id: 'c', nombre: 'Etapa C', avance: 40 }),
      etapa({ id: 'b', dependencias: ['a', 'c'] }),
    ];
    const b = etapas[2];
    expect(() => exigirDependenciasCompletas(b, 10, etapas)).toThrow(/Etapa C/);
  });
});

describe('dependientesDe', () => {
  it('lista las etapas que dependen de la etapa dada', () => {
    const etapas = [
      etapa({ id: 'a' }),
      etapa({ id: 'b', dependencias: ['a'] }),
      etapa({ id: 'c', dependencias: ['a'] }),
    ];
    expect(dependientesDe('a', etapas).map((e) => e.id)).toEqual(['b', 'c']);
    expect(dependientesDe('c', etapas)).toEqual([]);
  });
});

describe('dependenciasGantt', () => {
  it('devuelve aristas prerequisito -> dependiente e ignora huerfas', () => {
    const etapas = [
      etapa({ id: 'a' }),
      etapa({ id: 'b', dependencias: ['a', 'fantasma'] }),
      etapa({ id: 'c', proyectoId: 'p2', dependencias: ['a'] }),
    ];
    expect(dependenciasGantt(etapas)).toEqual([
      { prerequisitoId: 'a', dependienteId: 'b' },
      { prerequisitoId: 'a', dependienteId: 'c' },
    ]);
  });
});
