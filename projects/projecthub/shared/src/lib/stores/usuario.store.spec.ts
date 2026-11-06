/**
 * Tests del UsuarioStore (docs/funcionalidades.md 1.1, 1.3, 1.4, 1.8 y casos
 * limite del rulebook: correo duplicado, formato invalido, sin roles, actor
 * no Admin, usuario inactivo como actor).
 */
import { describe, expect, it } from 'vitest';
import { ErrorDuplicado, ErrorPermisoDenegado, ErrorValidacion } from '../domain/errores';
import { Usuario } from '../domain/modelos';
import { USUARIOS_SEMILLA } from './semilla';
import { UsuarioStore } from './usuario.store';

const ADMIN = USUARIOS_SEMILLA[0]; // Admin
const PM = USUARIOS_SEMILLA[2]; // ProjectManager
const INACTIVO = USUARIOS_SEMILLA[6]; // Sponsor inactivo

function store(): UsuarioStore {
  return new UsuarioStore();
}

describe('UsuarioStore - catalogo', () => {
  it('expone la semilla completa y los activos por separado', () => {
    const s = store();
    expect(s.usuarios().length).toBe(USUARIOS_SEMILLA.length);
    expect(s.usuariosActivos().some((u) => u.id === 'u-inactivo')).toBe(false);
    expect(s.usuarioPorId('u-pm')?.nombre).toBe('Paula Manager');
  });
});

describe('UsuarioStore - creacion', () => {
  it('crea un usuario con roles multiples (1.4)', () => {
    const s = store();
    const creado = s.crearUsuario(
      {
        nombre: 'Nora Nueva',
        correo: 'nora@projecthub.local',
        roles: ['Analista', 'Stakeholder'],
        activo: true,
      },
      ADMIN,
    );
    expect(creado.activo).toBe(true);
    expect(creado.roles).toEqual(['Analista', 'Stakeholder']);
    expect(s.usuarioPorId(creado.id)).toBeDefined();
  });

  it('rechaza correo duplicado (1.1)', () => {
    const s = store();
    expect(() =>
      s.crearUsuario(
        {
          nombre: 'Duplicado',
          correo: 'paula@projecthub.local',
          roles: ['Analista'],
          activo: true,
        },
        ADMIN,
      ),
    ).toThrowError(ErrorDuplicado);
  });

  it('rechaza correo con formato invalido (1.1)', () => {
    const s = store();
    expect(() =>
      s.crearUsuario(
        { nombre: 'Malo', correo: 'sin-arroba', roles: ['Analista'], activo: true },
        ADMIN,
      ),
    ).toThrowError(ErrorValidacion);
  });

  it('rechaza nombre vacio y lista de roles vacia (1.4)', () => {
    const s = store();
    expect(() =>
      s.crearUsuario({ nombre: '   ', correo: 'a@b.co', roles: ['Analista'], activo: true }, ADMIN),
    ).toThrowError(/nombre/);
    expect(() =>
      s.crearUsuario({ nombre: 'Sin rol', correo: 'b@b.co', roles: [], activo: true }, ADMIN),
    ).toThrowError(/rol/);
  });

  it('rechaza rol desconocido', () => {
    const s = store();
    expect(() =>
      s.crearUsuario(
        {
          nombre: 'Raro',
          correo: 'raro@projecthub.local',
          roles: ['Superheroe' as never],
          activo: true,
        },
        ADMIN,
      ),
    ).toThrowError(/Rol desconocido/);
  });

  it('solo Admin crea usuarios (1.5)', () => {
    const s = store();
    expect(() =>
      s.crearUsuario(
        { nombre: 'X', correo: 'x@projecthub.local', roles: ['Analista'], activo: true },
        PM,
      ),
    ).toThrowError(ErrorPermisoDenegado);
  });

  it('rechaza actor inexistente o inactivo (1.8)', () => {
    const s = store();
    const fantasma: Usuario = {
      id: 'u-fantasma',
      nombre: 'Fantasma',
      correo: 'f@projecthub.local',
      roles: ['Admin'],
      activo: true,
    };
    expect(() =>
      s.crearUsuario(
        { nombre: 'X', correo: 'x@projecthub.local', roles: ['Analista'], activo: true },
        fantasma,
      ),
    ).toThrowError(/sesion activa/);
    expect(() =>
      s.crearUsuario(
        { nombre: 'X', correo: 'x@projecthub.local', roles: ['Analista'], activo: true },
        INACTIVO,
      ),
    ).toThrowError(/sesion activa/);
  });
});

describe('UsuarioStore - edicion y desactivacion', () => {
  it('edita nombre, correo y roles', () => {
    const s = store();
    s.editarUsuario('u-analista', { nombre: 'Andres Renovado', roles: ['Analista', 'Admin'] }, ADMIN);
    const editado = s.usuarioPorId('u-analista');
    expect(editado?.nombre).toBe('Andres Renovado');
    expect(editado?.roles).toEqual(['Analista', 'Admin']);
  });

  it('permite conservar el correo propio al editar (unicidad excluye al propio id)', () => {
    const s = store();
    expect(() =>
      s.editarUsuario('u-analista', { correo: 'andres@projecthub.local' }, ADMIN),
    ).not.toThrow();
    expect(s.usuarioPorId('u-analista')?.correo).toBe('andres@projecthub.local');
  });

  it('rechaza editar con correo de otro usuario', () => {
    const s = store();
    expect(() =>
      s.editarUsuario('u-analista', { correo: 'sofia@projecthub.local' }, ADMIN),
    ).toThrowError(ErrorDuplicado);
  });

  it('desactiva sin borrar (1.3) y el usuario deja de estar activo (1.8)', () => {
    const s = store();
    s.desactivarUsuario('u-stakeholder', ADMIN);
    const desactivado = s.usuarioPorId('u-stakeholder');
    expect(desactivado?.activo).toBe(false);
    expect(s.usuarioPorId('u-stakeholder')).toBeDefined();
    expect(s.usuariosActivos().some((u) => u.id === 'u-stakeholder')).toBe(false);
  });

  it('rechaza editar un usuario inexistente', () => {
    const s = store();
    expect(() => s.editarUsuario('u-nadie', { nombre: 'Nadie' }, ADMIN)).toThrowError(
      /no existe/,
    );
  });

  it('solo Admin edita o desactiva (1.5)', () => {
    const s = store();
    expect(() => s.editarUsuario('u-pm', { nombre: 'Hack' }, PM)).toThrowError(
      ErrorPermisoDenegado,
    );
    expect(() => s.desactivarUsuario('u-pm', PM)).toThrowError(ErrorPermisoDenegado);
  });
});
