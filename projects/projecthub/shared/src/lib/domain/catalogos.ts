/**
 * Estados del proyecto (docs/funcionalidades.md 3.6).
 * Distinto de la etapa: un proyecto esta en una etapa y ademas tiene un estado.
 */
export type EstadoProyecto = 'Activo' | 'Cancelado' | 'Cerrado';

/**
 * Etapas del ciclo de vida (docs/funcionalidades.md 3.1).
 * "Iniciativa" es una etapa, no una entidad separada.
 */
export const ETAPAS_CICLO_VIDA = [
  'Planteamiento',
  'Iniciativa',
  'PoC',
  'ValidacionPoC',
  'Planeacion',
  'Contratos',
  'Ejecucion',
  'Operacion',
  'Cierre',
] as const;

export type EtapaCicloVida = (typeof ETAPAS_CICLO_VIDA)[number];

/** Etiqueta en espanol para UI (los identificadores quedan en ASCII). */
export const ETIQUETA_ETAPA: Readonly<Record<EtapaCicloVida, string>> = {
  Planteamiento: 'Planteamiento',
  Iniciativa: 'Iniciativa',
  PoC: 'Prueba de concepto',
  ValidacionPoC: 'Validacion de PoC',
  Planeacion: 'Planeacion',
  Contratos: 'Contratos',
  Ejecucion: 'Ejecucion',
  Operacion: 'Operacion',
  Cierre: 'Cierre',
};

/** Etiquetas en espanol para UI. */
export const ETIQUETA_ESTADO: Readonly<Record<EstadoProyecto, string>> = {
  Activo: 'Activo',
  Cancelado: 'Cancelado',
  Cerrado: 'Cerrado',
};

/** Roles del sistema (docs/funcionalidades.md 1.2). */
export const ROLES = [
  'Admin',
  'Sponsor',
  'ProjectManager',
  'Analista',
  'Stakeholder',
] as const;

export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Readonly<Record<Rol, string>> = {
  Admin: 'Admin',
  Sponsor: 'Sponsor',
  ProjectManager: 'Project Manager',
  Analista: 'Analista',
  Stakeholder: 'Stakeholder',
};

/** Tipos de registro de la bitacora (docs/funcionalidades.md 3.5). */
export const TIPOS_BITACORA = ['transicion', 'aprobacion', 'cambio'] as const;

export type TipoBitacora = (typeof TIPOS_BITACORA)[number];

/** Etiqueta en espanol para UI (los identificadores quedan en ASCII). */
export const ETIQUETA_TIPO_BITACORA: Readonly<Record<TipoBitacora, string>> = {
  transicion: 'Transicion',
  aprobacion: 'Aprobacion',
  cambio: 'Cambio',
};

/**
 * Tipos de relacion entre documentos (16.1, ideas del dueno: grafo tipo
 * obsidian de acuerdos, adendas y relaciones). Valores = contrato JSON con
 * el backend Go; son etiquetas de arista del grafo de busqueda.
 */
export const TIPOS_RELACION = ['derivaDe', 'modifica', 'anula', 'relacionado', 'aclara'] as const;

export type TipoRelacion = (typeof TIPOS_RELACION)[number];

/** Etiqueta en espanol para UI. */
export const ETIQUETA_TIPO_RELACION: Readonly<Record<TipoRelacion, string>> = {
  derivaDe: 'Deriva de',
  modifica: 'Modifica (adenda)',
  anula: 'Anula',
  relacionado: 'Relacionado con',
  aclara: 'Aclara',
};

/** Acciones gobernadas por la matriz de responsabilidades (1.5). */
export const ACCIONES = [
  'verProyecto',
  'editarProyecto',
  'avanzarEtapa',
  'retrocederEtapa',
  'aprobarEntregable',
  'editarEtapaTrabajo',
  'editarPresupuesto',
  'registrarConsumo',
  'cancelarProyecto',
  'cerrarProyecto',
] as const;

export type Accion = (typeof ACCIONES)[number];
