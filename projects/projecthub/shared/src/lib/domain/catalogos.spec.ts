import { describe, expect, it } from 'vitest';
import {
  BitacoraEntrada,
  ETIQUETA_TIPO_BITACORA,
  ETIQUETA_ETAPA,
  ETIQUETA_ESTADO,
  ETIQUETA_ROL,
  TIPOS_BITACORA,
} from './index';

describe('catalogos de bitacora', () => {
  it('define los tres tipos de registro de la bitacora (3.5)', () => {
    expect([...TIPOS_BITACORA]).toEqual(['transicion', 'aprobacion', 'cambio']);
  });

  it('da etiqueta en espanol a cada tipo y a ninguna clave desconocida', () => {
    for (const tipo of TIPOS_BITACORA) {
      expect(ETIQUETA_TIPO_BITACORA[tipo]).toBeTruthy();
    }
    expect(Object.keys(ETIQUETA_TIPO_BITACORA).length).toBe(TIPOS_BITACORA.length);
  });

  it('tipa BitacoraEntrada.tipo con el catalogo compartido', () => {
    const entrada: BitacoraEntrada = {
      id: 'b-x',
      proyectoId: 'p1',
      autorId: 'u-admin',
      fecha: '2026-08-20T10:00:00.000Z',
      tipo: 'cambio',
      etapaOrigen: null,
      etapaDestino: null,
      comentario: null,
    };
    expect(ETIQUETA_TIPO_BITACORA[entrada.tipo]).toBe('Cambio');
  });

  it('mantiene la coherencia del resto de catalogos de etiquetas', () => {
    expect(Object.keys(ETIQUETA_ETAPA).length).toBe(9);
    expect(Object.keys(ETIQUETA_ESTADO).length).toBe(3);
    expect(Object.keys(ETIQUETA_ROL).length).toBe(5);
  });
});
