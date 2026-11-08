/**
 * Modelos de dominio (docs/funcionalidades.md 1.1, 2.1, 3.5, 4.1, 9.1).
 * Interfaces puras; el store los materializa con signals en fase posterior.
 */
import { Accion, EstadoProyecto, EtapaCicloVida, Rol, TipoBitacora } from './catalogos';

export interface Usuario {
  readonly id: string;
  readonly nombre: string;
  /** Unico y con formato valido (1.1); la validacion de formato vive en el store/servicio. */
  readonly correo: string;
  readonly roles: readonly Rol[];
  /** Inactivo: no puede ser usuario activo ni responsable (1.8). */
  readonly activo: boolean;
}

export interface EtapaTrabajo {
  readonly id: string;
  readonly proyectoId: string;
  readonly nombre: string;
  readonly fechaInicio: string; // ISO yyyy-mm-dd
  readonly fechaFin: string; // ISO yyyy-mm-dd
  readonly responsableId: string;
  readonly presupuestoAsignado: number;
  readonly presupuestoConsumido: number;
  /** 0-100; el avance del proyecto se calcula, nunca se edita (4.3-4.4). */
  readonly avance: number;
  /** Ids de etapas prerequisito del mismo proyecto; deben estar 100% para avance > 0 (6.5). */
  readonly dependencias?: readonly string[];
}

export interface Proyecto {
  readonly id: string;
  /** Unico (2.1). */
  readonly nombre: string;
  readonly descripcion: string;
  readonly patrocinadorId: string;
  readonly presupuestoEstimado: number;
  readonly fechaObjetivo: string; // ISO yyyy-mm-dd
  readonly etapa: EtapaCicloVida;
  readonly estado: EstadoProyecto;
}

/** Documento obligatorio de una etapa, con version y aprobacion (3.5). */
export interface Entregable {
  readonly id: string;
  readonly proyectoId: string;
  readonly etapa: EtapaCicloVida;
  readonly nombre: string;
  readonly version: number;
  /** Quien aprobo; null mientras este pendiente. */
  readonly aprobadoPorId: string | null;
  readonly aprobadoEn: string | null; // ISO datetime
  /** Autor del documento; no puede aprobarlo el mismo (gate). */
  readonly creadoPorId: string;
}

/** Registro inmutable y con autor de transiciones y aprobaciones (3.5). */
export interface BitacoraEntrada {
  readonly id: string;
  readonly proyectoId: string;
  readonly autorId: string;
  readonly fecha: string; // ISO datetime
  readonly tipo: TipoBitacora;
  /** Etapa origen -> destino en transiciones; null en otros tipos. */
  readonly etapaOrigen: EtapaCicloVida | null;
  readonly etapaDestino: EtapaCicloVida | null;
  readonly comentario: string | null;
}

/** Accion permitida o denegada para un rol concreto en una etapa (1.5). */
export interface PermisoMatriz {
  readonly etapa: EtapaCicloVida;
  readonly accion: Accion;
  readonly roles: readonly Rol[];
}
