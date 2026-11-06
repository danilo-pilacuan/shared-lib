/**
 * Reglas de dependencias entre etapas de trabajo (docs/funcionalidades.md 6.5).
 * Una etapa puede declarar prerequisitos: etapas del mismo proyecto que deben
 * estar al 100% antes de que la dependiente registre avance mayor que cero.
 * Reglas puras; el store y el backend las invocan antes de mutar.
 */
import { ErrorValidacion } from './errores';
import { EtapaTrabajo } from './modelos';

/** Arista de dependencia para dibujar en el Gantt: prerequisito -> dependiente. */
export interface DependenciaGantt {
  readonly prerequisitoId: string;
  readonly dependienteId: string;
}

/** Ids de prerequisitos declarados de una etapa (array vacio si no declara). */
export function prerequisitosDe(etapa: EtapaTrabajo): readonly string[] {
  return etapa.dependencias ?? [];
}

/** Etapas que dependen de la etapa dada (para bloquear su eliminacion). */
export function dependientesDe(
  etapaId: string,
  todasLasEtapas: readonly EtapaTrabajo[],
): readonly EtapaTrabajo[] {
  return todasLasEtapas.filter((e) => prerequisitosDe(e).includes(etapaId));
}

/**
 * Valida las dependencias de una etapa: sin auto-dependencia, sin duplicados,
 * solo etapas existentes del mismo proyecto y sin ciclos en el grafo completo.
 * `todasLasEtapasDelProyecto` debe incluir la etapa candidata ya actualizada.
 */
export function validarDependencias(
  etapaId: string,
  proyectoId: string,
  todasLasEtapasDelProyecto: readonly EtapaTrabajo[],
): void {
  const etapa = todasLasEtapasDelProyecto.find((e) => e.id === etapaId);
  if (!etapa) {
    throw new ErrorValidacion(`La etapa "${etapaId}" no pertenece al proyecto indicado.`);
  }
  const prerequisitos = prerequisitosDe(etapa);
  const vistas = new Set<string>();
  for (const prerequisito of prerequisitos) {
    if (prerequisito === etapaId) {
      throw new ErrorValidacion('Una etapa no puede depender de si misma.');
    }
    if (vistas.has(prerequisito)) {
      throw new ErrorValidacion(`La etapa declara el prerequisito "${prerequisito}" mas de una vez.`);
    }
    vistas.add(prerequisito);
    const existe = todasLasEtapasDelProyecto.find((e) => e.id === prerequisito);
    if (!existe) {
      throw new ErrorValidacion(
        `El prerequisito "${prerequisito}" no existe o no pertenece al proyecto.`,
      );
    }
    if (existe.proyectoId !== proyectoId) {
      throw new ErrorValidacion(
        'Las dependencias solo se permiten entre etapas del mismo proyecto.',
      );
    }
  }
  if (tieneCiclo(etapaId, todasLasEtapasDelProyecto)) {
    throw new ErrorValidacion('Las dependencias forman un ciclo entre etapas.');
  }
}

/** DFS con grafo dirigido prerequisito -> dependiente; ciclo si revisita la raiz. */
export function tieneCiclo(
  etapaId: string,
  todasLasEtapasDelProyecto: readonly EtapaTrabajo[],
): boolean {
  const aristas = new Map<string, readonly string[]>();
  for (const etapa of todasLasEtapasDelProyecto) {
    for (const prerequisito of prerequisitosDe(etapa)) {
      aristas.set(prerequisito, [...(aristas.get(prerequisito) ?? []), etapa.id]);
    }
  }
  const visitados = new Set<string>();
  const pila: string[] = [etapaId];
  while (pila.length > 0) {
    const actual = pila[pila.length - 1];
    if (!visitados.has(actual)) {
      visitados.add(actual);
      for (const siguiente of aristas.get(actual) ?? []) {
        if (siguiente === etapaId || pila.includes(siguiente)) {
          return true;
        }
        if (!visitados.has(siguiente)) {
          pila.push(siguiente);
        }
      }
    } else {
      pila.pop();
    }
  }
  return false;
}

/**
 * Exige que todos los prerequisitos de la etapa esten al 100% antes de
 * registrar avance mayor que cero (6.5). Con avance 0 no exige nada.
 */
export function exigirDependenciasCompletas(
  etapa: EtapaTrabajo,
  avanceNuevo: number,
  todasLasEtapasDelProyecto: readonly EtapaTrabajo[],
): void {
  if (avanceNuevo <= 0) {
    return;
  }
  for (const prerequisitoId of prerequisitosDe(etapa)) {
    const prerequisito = todasLasEtapasDelProyecto.find((e) => e.id === prerequisitoId);
    if (!prerequisito) {
      continue; // ya validado al declarar; defensively ignora ids huerfos.
    }
    if (prerequisito.avance < 100) {
      throw new ErrorValidacion(
        `No se puede registrar avance en "${etapa.nombre}": su prerequisito "${prerequisito.nombre}" tiene ${prerequisito.avance}% y requiere 100%.`,
      );
    }
  }
}

/** Aristas prerequisito -> dependiente de un conjunto de etapas, para el Gantt. */
export function dependenciasGantt(
  todasLasEtapas: readonly EtapaTrabajo[],
): readonly DependenciaGantt[] {
  const aristas: DependenciaGantt[] = [];
  for (const etapa of todasLasEtapas) {
    for (const prerequisitoId of prerequisitosDe(etapa)) {
      if (todasLasEtapas.some((e) => e.id === prerequisitoId)) {
        aristas.push({ prerequisitoId, dependienteId: etapa.id });
      }
    }
  }
  return aristas;
}
