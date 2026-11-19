/**
 * Reglas de relaciones entre documentos (16.1): espejo de las validaciones
 * del backend Go. Casos limite: tipo invalido, autoenlace, par duplicado en
 * ambas direcciones, documentos fantasma, nota > 500 y camino dirigido.
 */
import { describe, expect, it } from 'vitest';
import { Entregable, RelacionDocumento } from './modelos';
import { caminoEntre, validarRelacion, vecinosDe } from './relaciones';

function entregable(id: string, aprobado = false): Entregable {
  const e: Entregable = {
    id,
    proyectoId: 'p1',
    etapa: 'Planteamiento',
    nombre: 'Documento ' + id,
    version: 1,
    aprobadoPorId: aprobado ? 'u-admin' : null,
    aprobadoEn: aprobado ? '2026-11-19T00:00:00Z' : null,
    creadoPorId: 'u-pm',
  };
  return e;
}

function relacion(id: string, origen: string, destino: string, tipo: RelacionDocumento['tipo']): RelacionDocumento {
  return {
    id,
    proyectoId: 'p1',
    origenId: origen,
    destinoId: destino,
    tipo,
    creadoPorId: 'u-pm',
    creadoEn: '2026-11-19T00:00:00Z',
    nota: null,
  };
}

const DOCS = [entregable('ent-1', true), entregable('ent-2'), entregable('ent-3', true)];

describe('validarRelacion (16.1)', () => {
  it('acepta un enlace valido del catalogo', () => {
    expect(
      validarRelacion({ origenId: 'ent-2', destinoId: 'ent-1', tipo: 'modifica' }, [], DOCS),
    ).toBeNull();
  });

  it('rechaza tipo inventado', () => {
    expect(
      validarRelacion({ origenId: 'ent-2', destinoId: 'ent-1', tipo: 'inventado' as never }, [], DOCS),
    ).toContain('no es valido');
  });

  it('rechaza autoenlace', () => {
    expect(
      validarRelacion({ origenId: 'ent-1', destinoId: 'ent-1', tipo: 'relacionado' }, [], DOCS),
    ).toContain('consigo mismo');
  });

  it('rechaza par duplicado en ambas direcciones', () => {
    const existentes = [relacion('rel-1', 'ent-1', 'ent-2', 'derivaDe')];
    expect(
      validarRelacion({ origenId: 'ent-1', destinoId: 'ent-2', tipo: 'modifica' }, existentes, DOCS),
    ).toContain('Ya existe');
    expect(
      validarRelacion({ origenId: 'ent-2', destinoId: 'ent-1', tipo: 'modifica' }, existentes, DOCS),
    ).toContain('Ya existe');
  });

  it('rechaza documentos fantasma', () => {
    expect(
      validarRelacion({ origenId: 'ent-1', destinoId: 'fantasma', tipo: 'modifica' }, [], DOCS),
    ).toContain('no existe');
    expect(
      validarRelacion({ origenId: 'fantasma', destinoId: 'ent-1', tipo: 'modifica' }, [], DOCS),
    ).toContain('no existe');
  });

  it('rechaza nota mayor a 500 caracteres', () => {
    const nota = 'a'.repeat(501);
    expect(
      validarRelacion({ origenId: 'ent-1', destinoId: 'ent-2', tipo: 'aclara', nota }, [], DOCS),
    ).toContain('500');
    const notaLimite = 'a'.repeat(500);
    expect(
      validarRelacion({ origenId: 'ent-1', destinoId: 'ent-2', tipo: 'aclara', nota: notaLimite }, [], DOCS),
    ).toBeNull();
  });
});

describe('vecinosDe y caminoEntre (16.1)', () => {
  const relaciones = [relacion('rel-1', 'ent-2', 'ent-1', 'modifica'), relacion('rel-2', 'ent-1', 'ent-3', 'derivaDe')];

  it('vecinosDe reporta ambas direcciones con etiqueta', () => {
    const vecinos = vecinosDe('ent-1', DOCS, relaciones);
    expect(vecinos.map((v) => `${v.id}:${v.direccion}`).sort()).toEqual(['ent-2:entrante', 'ent-3:saliente']);
  });

  it('caminoEntre encuentra la traza dirigida', () => {
    expect(caminoEntre('ent-2', 'ent-3', relaciones)).toEqual(['ent-2', 'ent-1', 'ent-3']);
    expect(caminoEntre('ent-3', 'ent-2', relaciones)).toBeNull();
    expect(caminoEntre('ent-1', 'ent-1', relaciones)).toEqual(['ent-1']);
  });
});
