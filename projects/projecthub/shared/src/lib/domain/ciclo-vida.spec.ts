import { describe, expect, it } from 'vitest';
import {
  ETAPAS_CICLO_VIDA,
  EtapaCicloVida,
  esTransicionValida,
  etapaRetrocesoPermitido,
  siguienteEtapa,
  transicionesDisponibles,
  validarTransicion,
} from './index';
import { ErrorTransicionInvalida } from './errores';

describe('grafo del ciclo de vida', () => {
  it('avanza linealmente por las 9 etapas', () => {
    for (let i = 0; i < ETAPAS_CICLO_VIDA.length - 1; i++) {
      expect(siguienteEtapa(ETAPAS_CICLO_VIDA[i])).toBe(ETAPAS_CICLO_VIDA[i + 1]);
      expect(esTransicionValida(ETAPAS_CICLO_VIDA[i], ETAPAS_CICLO_VIDA[i + 1])).toBe(true);
    }
  });

  it('Cierre no tiene etapa siguiente', () => {
    expect(siguienteEtapa('Cierre')).toBeNull();
  });

  it('solo permite los retrocesos PoC->Iniciativa y ValidacionPoC->PoC (3.3)', () => {
    expect(etapaRetrocesoPermitido('PoC')).toBe('Iniciativa');
    expect(etapaRetrocesoPermitido('ValidacionPoC')).toBe('PoC');
    for (const etapa of ETAPAS_CICLO_VIDA) {
      if (etapa !== 'PoC' && etapa !== 'ValidacionPoC') {
        expect(etapaRetrocesoPermitido(etapa)).toBeNull();
      }
    }
  });

  it('rechaza saltos de mas de una etapa hacia adelante', () => {
    expect(esTransicionValida('Planteamiento', 'PoC')).toBe(false);
    expect(esTransicionValida('Iniciativa', 'Planeacion')).toBe(false);
  });

  it('rechaza retrocesos no acotados (3.3)', () => {
    expect(esTransicionValida('Ejecucion', 'Planeacion')).toBe(false);
    expect(esTransicionValida('Planeacion', 'PoC')).toBe(false);
    expect(esTransicionValida('Operacion', 'Ejecucion')).toBe(false);
    expect(esTransicionValida('Cierre', 'Operacion')).toBe(false);
  });

  it('rechaza la misma etapa como destino', () => {
    for (const etapa of ETAPAS_CICLO_VIDA) {
      expect(esTransicionValida(etapa, etapa)).toBe(false);
    }
  });

  it('validarTransicion devuelve el destino en transiciones validas', () => {
    expect(validarTransicion('Planteamiento', 'Iniciativa')).toBe('Iniciativa');
    expect(validarTransicion('PoC', 'Iniciativa')).toBe('Iniciativa');
    expect(validarTransicion('ValidacionPoC', 'PoC')).toBe('PoC');
  });

  it('validarTransicion lanza ErrorTransicionInvalida con mensaje en espanol', () => {
    expect(() => validarTransicion('Ejecucion', 'Planeacion')).toThrowError(
      ErrorTransicionInvalida,
    );
    try {
      validarTransicion('Ejecucion', 'Planeacion');
      expect.unreachable('debia lanzar');
    } catch (e) {
      const err = e as ErrorTransicionInvalida;
      expect(err.codigo).toBe('TRANSICION_INVALIDA');
      expect(err.message).toContain('Ejecucion');
      expect(err.message).toContain('Planeacion');
    }
  });

  it('transicionesDisponibles expone avance y retroceso permitido', () => {
    expect(transicionesDisponibles('Planteamiento')).toEqual<EtapaCicloVida[]>(['Iniciativa']);
    expect(transicionesDisponibles('PoC')).toEqual<EtapaCicloVida[]>([
      'ValidacionPoC',
      'Iniciativa',
    ]);
    expect(transicionesDisponibles('ValidacionPoC')).toEqual<EtapaCicloVida[]>([
      'Planeacion',
      'PoC',
    ]);
    expect(transicionesDisponibles('Cierre')).toEqual<EtapaCicloVida[]>([]);
  });
});
