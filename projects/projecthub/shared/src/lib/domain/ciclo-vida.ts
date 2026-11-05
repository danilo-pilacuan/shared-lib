/**
 * Grafo de transiciones del ciclo de vida (docs/funcionalidades.md 3.1-3.4).
 * Avances: cadena lineal Planteamiento -> ... -> Cierre.
 * Retrocesos permitidos (3.3): solo PoC -> Iniciativa y ValidacionPoC -> PoC.
 */
import { EtapaCicloVida, ETAPAS_CICLO_VIDA } from './catalogos';
import { ErrorTransicionInvalida } from './errores';

const INDICE_ETAPA: Readonly<Record<EtapaCicloVida, number>> = ETAPAS_CICLO_VIDA.reduce(
  (acc, etapa, i) => ({ ...acc, [etapa]: i }),
  {} as Record<EtapaCicloVida, number>,
);

/** Retrocesos acotados: unica excepcion a la cadena lineal. */
const RETROCESOS: Readonly<Partial<Record<EtapaCicloVida, EtapaCicloVida>>> = {
  PoC: 'Iniciativa',
  ValidacionPoC: 'PoC',
};

/** Siguiente etapa del ciclo de vida; null en Cierre (fin de la cadena). */
export function siguienteEtapa(etapa: EtapaCicloVida): EtapaCicloVida | null {
  const i = INDICE_ETAPA[etapa];
  return i < ETAPAS_CICLO_VIDA.length - 1 ? ETAPAS_CICLO_VIDA[i + 1] : null;
}

/** Etapa anterior si es un retroceso permitido (3.3); null si no lo es. */
export function etapaRetrocesoPermitido(etapa: EtapaCicloVida): EtapaCicloVida | null {
  return RETROCESOS[etapa] ?? null;
}

/** Indica si la transicion origen -> destino esta en el grafo (avance o retroceso permitido). */
export function esTransicionValida(
  origen: EtapaCicloVida,
  destino: EtapaCicloVida,
): boolean {
  if (siguienteEtapa(origen) === destino) return true;
  return etapaRetrocesoPermitido(origen) === destino;
}

/**
 * Valida y devuelve la etapa destino. Lanza ErrorTransicionInvalida si la
 * transicion no esta en el grafo; la UI no debe permitir llegar aqui (3.2).
 */
export function validarTransicion(
  origen: EtapaCicloVida,
  destino: EtapaCicloVida,
): EtapaCicloVida {
  if (!esTransicionValida(origen, destino)) {
    throw new ErrorTransicionInvalida(origen, destino);
  }
  return destino;
}

/** Etapas a las que se puede llegar desde la etapa actual (para UI). */
export function transicionesDisponibles(etapa: EtapaCicloVida): EtapaCicloVida[] {
  const destino: EtapaCicloVida[] = [];
  const sig = siguienteEtapa(etapa);
  if (sig) destino.push(sig);
  const retro = etapaRetrocesoPermitido(etapa);
  if (retro) destino.push(retro);
  return destino;
}
