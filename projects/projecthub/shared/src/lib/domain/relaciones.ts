/**
 * Reglas de relaciones entre documentos (16.1, ideas del dueno: grafo tipo
 * obsidian de acuerdos, adendas y relaciones). Espejo de las validaciones
 * del backend Go (internal/domain/relaciones.go): el frontend valida con las
 * mismas reglas antes de enviar, y el servidor revalida.
 */
import { TIPOS_RELACION, TipoRelacion } from './catalogos';
import { Entregable, RelacionDocumento } from './modelos';

export const NOTA_RELACION_MAX = 500;

export function esTipoRelacionValido(tipo: string): tipo is TipoRelacion {
  return (TIPOS_RELACION as readonly string[]).includes(tipo);
}

/** Mensaje de validacion o null si la relacion es valida. */
export function validarRelacion(
  relacion: { origenId: string; destinoId: string; tipo: TipoRelacion; nota?: string | null },
  existentes: readonly RelacionDocumento[],
  entregablesDelProyecto: readonly Entregable[],
): string | null {
  if (!esTipoRelacionValido(relacion.tipo)) {
    return `El tipo de relacion "${relacion.tipo}" no es valido.`;
  }
  if (relacion.origenId === relacion.destinoId) {
    return 'Un documento no puede relacionarse consigo mismo.';
  }
  const nota = (relacion.nota ?? '').trim();
  if (nota.length > NOTA_RELACION_MAX) {
    return `La nota de la relacion no puede exceder ${NOTA_RELACION_MAX} caracteres.`;
  }
  const existeDoc = (id: string): boolean => entregablesDelProyecto.some((e) => e.id === id);
  if (!existeDoc(relacion.origenId)) {
    return `El entregable (origen de la relacion) "${relacion.origenId}" no existe.`;
  }
  if (!existeDoc(relacion.destinoId)) {
    return `El entregable (destino de la relacion) "${relacion.destinoId}" no existe.`;
  }
  for (const previa of existentes) {
    const mismoPar =
      (previa.origenId === relacion.origenId && previa.destinoId === relacion.destinoId) ||
      (previa.origenId === relacion.destinoId && previa.destinoId === relacion.origenId);
    if (mismoPar) {
      return 'Ya existe una relacion entre esos dos documentos.';
    }
  }
  return null;
}

/** Vecino de un documento en el grafo, con direccion del enlace. */
export interface VecinoRelacion {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoRelacion;
  readonly direccion: 'saliente' | 'entrante';
  readonly relacionId: string;
}

/** Conexiones directas de un documento (ambas direcciones). */
export function vecinosDe(
  documentoId: string,
  entregables: readonly Entregable[],
  relaciones: readonly RelacionDocumento[],
): VecinoRelacion[] {
  const nombreDe = (id: string): string => entregables.find((e) => e.id === id)?.nombre ?? id;
  const salida: VecinoRelacion[] = [];
  for (const r of relaciones) {
    if (r.origenId === documentoId) {
      salida.push({ id: r.destinoId, nombre: nombreDe(r.destinoId), tipo: r.tipo, direccion: 'saliente', relacionId: r.id });
    } else if (r.destinoId === documentoId) {
      salida.push({ id: r.origenId, nombre: nombreDe(r.origenId), tipo: r.tipo, direccion: 'entrante', relacionId: r.id });
    }
  }
  return salida;
}

/**
 * Camino mas corto (BFS dirigido) entre dos documentos para la trazabilidad
 * (p. ej. "esta adenda deriva de que acuerdo"). null si no hay camino.
 */
export function caminoEntre(
  origenId: string,
  destinoId: string,
  relaciones: readonly RelacionDocumento[],
): string[] | null {
  if (origenId === destinoId) {
    return [origenId];
  }
  const adyacencia = new Map<string, string[]>();
  for (const r of relaciones) {
    const lista = adyacencia.get(r.origenId) ?? [];
    lista.push(r.destinoId);
    adyacencia.set(r.origenId, lista);
  }
  const visitados = new Set<string>([origenId]);
  const cola: string[][] = [[origenId]];
  while (cola.length > 0) {
    const camino = cola.shift()!;
    const actual = camino[camino.length - 1];
    for (const siguiente of adyacencia.get(actual) ?? []) {
      if (siguiente === destinoId) {
        return [...camino, siguiente];
      }
      if (!visitados.has(siguiente)) {
        visitados.add(siguiente);
        cola.push([...camino, siguiente]);
      }
    }
  }
  return null;
}
