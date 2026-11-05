import { describe, expect, it } from 'vitest';
import { ACCIONES, ETAPAS_CICLO_VIDA, ROLES } from './catalogos';
import { exigirPermiso, rolesPermitidos, tienePermiso } from './matriz-permisos';
import { ErrorPermisoDenegado } from './errores';

describe('matriz de responsabilidades', () => {
  it('define todas las acciones en todas las etapas', () => {
    for (const etapa of ETAPAS_CICLO_VIDA) {
      for (const accion of ACCIONES) {
        expect(Array.isArray(rolesPermitidos(etapa, accion))).toBe(true);
      }
    }
  });

  it('verProyecto esta habilitado para todos los roles en todas las etapas', () => {
    for (const etapa of ETAPAS_CICLO_VIDA) {
      for (const rol of ROLES) {
        expect(tienePermiso(etapa, 'verProyecto', [rol])).toBe(true);
      }
    }
  });

  it('cancelarProyecto es solo Admin/Sponsor y nunca en Cierre (2.6)', () => {
    for (const etapa of ETAPAS_CICLO_VIDA) {
      const permitidos = rolesPermitidos(etapa, 'cancelarProyecto');
      if (etapa === 'Cierre') {
        expect(permitidos).toEqual([]);
      } else {
        expect(permitidos).toEqual(['Admin', 'Sponsor']);
      }
    }
    expect(tienePermiso('Ejecucion', 'cancelarProyecto', ['Analista'])).toBe(false);
    expect(tienePermiso('Ejecucion', 'cancelarProyecto', ['ProjectManager'])).toBe(false);
  });

  it('cerrarProyecto es solo Admin/Sponsor y solo desde Cierre (2.7)', () => {
    for (const etapa of ETAPAS_CICLO_VIDA) {
      const permitidos = rolesPermitidos(etapa, 'cerrarProyecto');
      if (etapa === 'Cierre') {
        expect(permitidos).toEqual(['Admin', 'Sponsor']);
      } else {
        expect(permitidos).toEqual([]);
      }
    }
  });

  it('registrarConsumo solo en Ejecucion/Operacion y sin Stakeholder', () => {
    for (const etapa of ETAPAS_CICLO_VIDA) {
      const permitidos = rolesPermitidos(etapa, 'registrarConsumo');
      if (etapa === 'Ejecucion' || etapa === 'Operacion') {
        expect(permitidos).toEqual(['Admin', 'Sponsor', 'ProjectManager']);
      } else {
        expect(permitidos).toEqual([]);
      }
    }
  });

  it('acepta usuarios con varios roles si alguno habilita (1.4)', () => {
    expect(tienePermiso('Ejecucion', 'registrarConsumo', ['Stakeholder', 'ProjectManager'])).toBe(
      true,
    );
    expect(tienePermiso('Ejecucion', 'registrarConsumo', ['Stakeholder', 'Analista'])).toBe(false);
  });

  it('exigirPermiso lanza ErrorPermisoDenegado con mensaje en espanol', () => {
    expect(() => exigirPermiso('Ejecucion', 'cancelarProyecto', ['Analista'])).toThrowError(
      ErrorPermisoDenegado,
    );
    try {
      exigirPermiso('Ejecucion', 'cancelarProyecto', ['Analista']);
      expect.unreachable('debia lanzar');
    } catch (e) {
      const err = e as ErrorPermisoDenegado;
      expect(err.codigo).toBe('PERMISO_DENEGADO');
      expect(err.message).toContain('cancelarProyecto');
      expect(err.message).toContain('Ejecucion');
      expect(err.message).toContain('Admin');
    }
  });

  it('exigirPermiso no lanza cuando el rol habilita', () => {
    expect(() => exigirPermiso('Ejecucion', 'cancelarProyecto', ['Sponsor'])).not.toThrow();
  });
});
