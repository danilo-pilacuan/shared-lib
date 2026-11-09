/**
 * Calculos de dominio (docs/funcionalidades.md 4.3-4.5, 5.2, 5.4).
 * Puros, sin Angular; los componentes no los reimplementan.
 */
import { ErrorValidacion } from './errores';

/** Etapa de trabajo con los campos que alimentan los calculos. */
export interface EtapaCalculable {
  readonly fechaInicio: string; // ISO yyyy-mm-dd
  readonly fechaFin: string; // ISO yyyy-mm-dd
  readonly avance: number; // 0-100
  readonly presupuestoAsignado: number; // >= 0
  readonly presupuestoConsumido: number; // >= 0
}

const MS_POR_DIA = 86_400_000;

/** Verifica que una cadena sea una fecha ISO parseable (Date.parse). */
export function esFechaIso(valor: string): boolean {
  return !Number.isNaN(Date.parse(valor));
}

/** Duracion en dias naturales (fin - inicio); minimo 1 dia para ponderar. */
export function duracionDias(etapa: EtapaCalculable): number {
  const inicio = Date.parse(etapa.fechaInicio);
  const fin = Date.parse(etapa.fechaFin);
  if (Number.isNaN(inicio) || Number.isNaN(fin)) {
    throw new ErrorValidacion('Las fechas de la etapa deben ser fechas validas.');
  }
  if (fin < inicio) {
    throw new ErrorValidacion('La fecha de fin no puede ser anterior a la fecha de inicio.');
  }
  return Math.max(1, Math.round((fin - inicio) / MS_POR_DIA) + 1);
}

/** Valida una etapa de trabajo (4.5): fechas, avance 0-100, montos >= 0. */
export function validarEtapa(etapa: EtapaCalculable): void {
  duracionDias(etapa);
  if (!Number.isFinite(etapa.avance) || etapa.avance < 0 || etapa.avance > 100) {
    throw new ErrorValidacion('El avance de la etapa debe estar entre 0 y 100.');
  }
  if (!Number.isFinite(etapa.presupuestoAsignado) || etapa.presupuestoAsignado < 0) {
    throw new ErrorValidacion('El presupuesto asignado no puede ser negativo.');
  }
  if (!Number.isFinite(etapa.presupuestoConsumido) || etapa.presupuestoConsumido < 0) {
    throw new ErrorValidacion('El presupuesto consumido no puede ser negativo.');
  }
}

/**
 * Avance del proyecto: promedio ponderado por duracion de etapas (4.4).
 * Nunca editable a mano; 0 si no hay etapas.
 */
export function avancePonderado(etapas: readonly EtapaCalculable[]): number {
  if (etapas.length === 0) return 0;
  let sumaPonderada = 0;
  let sumaDuraciones = 0;
  for (const etapa of etapas) {
    validarEtapa(etapa);
    const dias = duracionDias(etapa);
    sumaPonderada += etapa.avance * dias;
    sumaDuraciones += dias;
  }
  return redondear2(sumaPonderada / sumaDuraciones);
}

/** Presupuesto total del proyecto = suma de etapas (5.2). */
export function presupuestoTotal(etapas: readonly EtapaCalculable[]): number {
  let total = 0;
  for (const etapa of etapas) {
    validarEtapa(etapa);
    total += etapa.presupuestoAsignado;
  }
  return redondear2(total);
}

/** Consumo total del proyecto = suma de consumos por etapa (5.3). */
export function consumoTotal(etapas: readonly EtapaCalculable[]): number {
  let total = 0;
  for (const etapa of etapas) {
    validarEtapa(etapa);
    total += etapa.presupuestoConsumido;
  }
  return redondear2(total);
}

/** Desviacion = consumido - asignado; positivo indica sobrecosto (5.4). */
export function desviacionPresupuesto(etapa: EtapaCalculable): number {
  validarEtapa(etapa);
  return redondear2(etapa.presupuestoConsumido - etapa.presupuestoAsignado);
}

/** Indica si el consumo supera lo asignado (alerta visual, 5.5). */
export function presupuestoExcedido(etapa: EtapaCalculable): boolean {
  return desviacionPresupuesto(etapa) > 0;
}

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}
