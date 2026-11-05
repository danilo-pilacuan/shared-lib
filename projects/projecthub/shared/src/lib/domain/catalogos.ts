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
