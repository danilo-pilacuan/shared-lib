import { describe, expect, it } from 'vitest';
import {
  EtapaCalculable,
  avancePonderado,
  consumoTotal,
  desviacionPresupuesto,
  duracionDias,
  presupuestoExcedido,
  presupuestoTotal,
  validarEtapa,
} from './calculos';
import { ErrorValidacion } from './errores';

function etapa(parcial: Partial<EtapaCalculable>): EtapaCalculable {
  return {
    fechaInicio: '2026-01-01',
    fechaFin: '2026-01-10',
    avance: 0,
    presupuestoAsignado: 0,
    presupuestoConsumido: 0,
    ...parcial,
  };
}

describe('calculos de dominio', () => {
  describe('duracionDias', () => {
    it('cuenta dias naturales incluyendo extremos', () => {
      expect(duracionDias(etapa({}))).toBe(10);
      expect(duracionDias(etapa({ fechaFin: '2026-01-01' }))).toBe(1);
    });

    it('rechaza fechas invertidas (4.5)', () => {
      expect(() =>
        duracionDias(etapa({ fechaInicio: '2026-02-01', fechaFin: '2026-01-01' })),
      ).toThrowError(ErrorValidacion);
    });

    it('rechaza fechas invalidas', () => {
      expect(() => duracionDias(etapa({ fechaInicio: 'no-es-fecha' }))).toThrowError(
        ErrorValidacion,
      );
    });
  });

  describe('validarEtapa', () => {
    it('rechaza avance fuera de 0-100 (4.3)', () => {
      expect(() => validarEtapa(etapa({ avance: -1 }))).toThrowError(ErrorValidacion);
      expect(() => validarEtapa(etapa({ avance: 101 }))).toThrowError(ErrorValidacion);
      expect(() => validarEtapa(etapa({ avance: 100 }))).not.toThrow();
      expect(() => validarEtapa(etapa({ avance: 0 }))).not.toThrow();
    });

    it('rechaza montos negativos (4.5)', () => {
      expect(() => validarEtapa(etapa({ presupuestoAsignado: -0.01 }))).toThrowError(
        ErrorValidacion,
      );
      expect(() => validarEtapa(etapa({ presupuestoConsumido: -1 }))).toThrowError(
        ErrorValidacion,
      );
    });

    it('rechaza fechas invertidas', () => {
      expect(() =>
        validarEtapa(etapa({ fechaInicio: '2026-03-01', fechaFin: '2026-01-01' })),
      ).toThrowError(ErrorValidacion);
    });
  });

  describe('avancePonderado', () => {
    it('pondera por duracion de etapas (4.4)', () => {
      const etapas = [
        etapa({ fechaInicio: '2026-01-01', fechaFin: '2026-01-10', avance: 100 }), // 10 dias
        etapa({ fechaInicio: '2026-01-11', fechaFin: '2026-01-20', avance: 0 }), // 10 dias
      ];
      expect(avancePonderado(etapas)).toBe(50);
    });

    it('la etapa mas larga pesa mas', () => {
      const etapas = [
        etapa({ fechaInicio: '2026-01-01', fechaFin: '2026-01-30', avance: 0 }), // 30 dias
        etapa({ fechaInicio: '2026-02-01', fechaFin: '2026-02-01', avance: 100 }), // 1 dia
      ];
      const esperado = (0 * 30 + 100 * 1) / 31;
      expect(avancePonderado(etapas)).toBeCloseTo(esperado, 2);
    });

    it('devuelve 0 sin etapas', () => {
      expect(avancePonderado([])).toBe(0);
    });

    it('propaga la validacion de etapas invalidas', () => {
      expect(() => avancePonderado([etapa({ avance: 150 })])).toThrowError(ErrorValidacion);
    });
  });

  describe('presupuesto', () => {
    it('suma asignado y consumo por etapa (5.2, 5.3)', () => {
      const etapas = [
        etapa({ presupuestoAsignado: 1000.5, presupuestoConsumido: 250 }),
        etapa({ presupuestoAsignado: 2000, presupuestoConsumido: 1750.25 }),
      ];
      expect(presupuestoTotal(etapas)).toBe(3000.5);
      expect(consumoTotal(etapas)).toBe(2000.25);
    });

    it('desviacion positiva indica sobrecosto (5.4)', () => {
      expect(desviacionPresupuesto(etapa({ presupuestoAsignado: 100, presupuestoConsumido: 150 }))).toBe(50);
      expect(desviacionPresupuesto(etapa({ presupuestoAsignado: 100, presupuestoConsumido: 80 }))).toBe(-20);
      expect(desviacionPresupuesto(etapa({ presupuestoAsignado: 100, presupuestoConsumido: 100 }))).toBe(0);
    });

    it('alerta de exceso solo cuando el consumo supera el asignado (5.5)', () => {
      expect(presupuestoExcedido(etapa({ presupuestoAsignado: 100, presupuestoConsumido: 100.01 }))).toBe(true);
      expect(presupuestoExcedido(etapa({ presupuestoAsignado: 100, presupuestoConsumido: 100 }))).toBe(false);
    });

    it('rechaza montos negativos en los calculos', () => {
      expect(() => presupuestoTotal([etapa({ presupuestoAsignado: -5 })])).toThrowError(
        ErrorValidacion,
      );
    });
  });
});
