/**
 * Matriz de responsabilidades (docs/funcionalidades.md 1.5): que acciones puede
 * hacer cada rol en cada etapa del ciclo de vida. Configuracion editable en
 * fases posteriores; aqui vive la definicion por defecto y su consulta.
 */
import { Accion, EtapaCicloVida, Rol } from './catalogos';
import { ErrorPermisoDenegado } from './errores';

type Matriz = Readonly<Record<EtapaCicloVida, Readonly<Record<Accion, readonly Rol[]>>>>;

/** Acciones visibles para cualquier rol autenticado en cualquier etapa. */
const TODOS_LOS_ROLES: readonly Rol[] = [
  'Admin',
  'Sponsor',
  'ProjectManager',
  'Analista',
  'Stakeholder',
];

const SOLO_GOBERNANZA: readonly Rol[] = ['Admin', 'Sponsor'];
const GOBERNANZA_Y_PM: readonly Rol[] = ['Admin', 'Sponsor', 'ProjectManager'];

/** Matriz por defecto. Etapas tempranas: mas roles; ejecucion: mas restrictivo. */
const MATRIZ: Matriz = {
  Planteamiento: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: GOBERNANZA_Y_PM,
    avanzarEtapa: GOBERNANZA_Y_PM,
    retrocederEtapa: [],
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: GOBERNANZA_Y_PM,
    editarPresupuesto: GOBERNANZA_Y_PM,
    registrarConsumo: [],
    cancelarProyecto: SOLO_GOBERNANZA,
    cerrarProyecto: [],
  },
  Iniciativa: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: GOBERNANZA_Y_PM,
    avanzarEtapa: GOBERNANZA_Y_PM,
    retrocederEtapa: [],
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: GOBERNANZA_Y_PM,
    editarPresupuesto: GOBERNANZA_Y_PM,
    registrarConsumo: [],
    cancelarProyecto: SOLO_GOBERNANZA,
    cerrarProyecto: [],
  },
  PoC: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: GOBERNANZA_Y_PM,
    avanzarEtapa: SOLO_GOBERNANZA,
    retrocederEtapa: SOLO_GOBERNANZA,
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: GOBERNANZA_Y_PM,
    editarPresupuesto: GOBERNANZA_Y_PM,
    registrarConsumo: [],
    cancelarProyecto: SOLO_GOBERNANZA,
    cerrarProyecto: [],
  },
  ValidacionPoC: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: GOBERNANZA_Y_PM,
    avanzarEtapa: SOLO_GOBERNANZA,
    retrocederEtapa: SOLO_GOBERNANZA,
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: GOBERNANZA_Y_PM,
    editarPresupuesto: GOBERNANZA_Y_PM,
    registrarConsumo: [],
    cancelarProyecto: SOLO_GOBERNANZA,
    cerrarProyecto: [],
  },
  Planeacion: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: GOBERNANZA_Y_PM,
    avanzarEtapa: SOLO_GOBERNANZA,
    retrocederEtapa: [],
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: GOBERNANZA_Y_PM,
    editarPresupuesto: GOBERNANZA_Y_PM,
    registrarConsumo: [],
    cancelarProyecto: SOLO_GOBERNANZA,
    cerrarProyecto: [],
  },
  Contratos: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: SOLO_GOBERNANZA,
    avanzarEtapa: SOLO_GOBERNANZA,
    retrocederEtapa: [],
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: SOLO_GOBERNANZA,
    editarPresupuesto: SOLO_GOBERNANZA,
    registrarConsumo: [],
    cancelarProyecto: SOLO_GOBERNANZA,
    cerrarProyecto: [],
  },
  Ejecucion: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: GOBERNANZA_Y_PM,
    avanzarEtapa: SOLO_GOBERNANZA,
    retrocederEtapa: [],
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: GOBERNANZA_Y_PM,
    editarPresupuesto: SOLO_GOBERNANZA,
    registrarConsumo: GOBERNANZA_Y_PM,
    cancelarProyecto: SOLO_GOBERNANZA,
    cerrarProyecto: [],
  },
  Operacion: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: GOBERNANZA_Y_PM,
    avanzarEtapa: SOLO_GOBERNANZA,
    retrocederEtapa: [],
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: GOBERNANZA_Y_PM,
    editarPresupuesto: SOLO_GOBERNANZA,
    registrarConsumo: GOBERNANZA_Y_PM,
    cancelarProyecto: SOLO_GOBERNANZA,
    cerrarProyecto: [],
  },
  Cierre: {
    verProyecto: TODOS_LOS_ROLES,
    editarProyecto: [],
    avanzarEtapa: [],
    retrocederEtapa: [],
    aprobarEntregable: SOLO_GOBERNANZA,
    editarEtapaTrabajo: [],
    editarPresupuesto: [],
    registrarConsumo: [],
    cancelarProyecto: [],
    cerrarProyecto: SOLO_GOBERNANZA,
  },
};

/** Roles habilitados para una accion en una etapa (consulta pura, sin lanzar). */
export function rolesPermitidos(etapa: EtapaCicloVida, accion: Accion): readonly Rol[] {
  return MATRIZ[etapa][accion];
}

/** Indica si alguno de los roles del usuario habilita la accion en la etapa. */
export function tienePermiso(
  etapa: EtapaCicloVida,
  accion: Accion,
  roles: readonly Rol[],
): boolean {
  const permitidos = MATRIZ[etapa][accion];
  return roles.some((r) => permitidos.includes(r));
}

/**
 * Valida el permiso y lanza ErrorPermisoDenegado si ningun rol del usuario lo
 * habilita; la UI oculta la accion antes de llegar aqui (1.7).
 */
export function exigirPermiso(
  etapa: EtapaCicloVida,
  accion: Accion,
  roles: readonly Rol[],
): void {
  if (!tienePermiso(etapa, accion, roles)) {
    throw new ErrorPermisoDenegado(accion, etapa, MATRIZ[etapa][accion]);
  }
}
