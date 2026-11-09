/**
 * Store de usuarios (docs/funcionalidades.md 1.1, 1.3, 1.4, 1.8).
 * CRUD administrativo del catalogo de usuarios: crear, editar y desactivar
 * (sin borrar, para conservar el historial). Solo Admin administra usuarios.
 * El catalogo se carga del backend (13.3); sin sesion es semilla de
 * referencia de solo lectura (1.6).
 */
import { Injectable, computed, signal } from '@angular/core';
import { ROLES, Rol } from '../domain/catalogos';
import { ErrorDuplicado, ErrorPermisoDenegado, ErrorValidacion } from '../domain/errores';
import { Usuario } from '../domain/modelos';
import { USUARIOS_SEMILLA } from './semilla';

/** Datos de alta/edicion de un usuario; el id lo asigna el store. */
export interface DatosUsuario {
  readonly nombre: string;
  readonly correo: string;
  readonly roles: readonly Rol[];
  readonly activo: boolean;
}

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let contador = 0;
function nuevoId(): string {
  contador += 1;
  return `u-${Date.now().toString(36)}-${contador}`;
}

@Injectable({ providedIn: 'root' })
export class UsuarioStore {
  private readonly usuariosSignal = signal<readonly Usuario[]>(USUARIOS_SEMILLA);

  /** Reemplaza el catalogo con datos del backend (13.3); no lanza. */
  cargarDesdeBackend(usuarios: readonly Usuario[]): void {
    this.usuariosSignal.set(usuarios);
  }

  /** Catalogo completo, incluidos inactivos (el historial no se borra). */
  readonly usuarios = computed(() => this.usuariosSignal());

  /** Usuarios activos: unicos candidatos a sesion o responsabilidad (1.8). */
  readonly usuariosActivos = computed(() => this.usuariosSignal().filter((u) => u.activo));

  usuarioPorId(id: string): Usuario | undefined {
    return this.usuariosSignal().find((u) => u.id === id);
  }

  /** Crea un usuario (1.3). Exige actor Admin y datos validos. */
  crearUsuario(datos: DatosUsuario, actor: Usuario): Usuario {
    this.exigirAdmin(actor);
    const nombre = this.validarNombre(datos.nombre);
    const correo = this.validarCorreo(datos.correo);
    const roles = this.validarRoles(datos.roles);
    const usuario: Usuario = {
      id: nuevoId(),
      nombre,
      correo,
      roles,
      activo: datos.activo,
    };
    this.usuariosSignal.update((lista) => [...lista, usuario]);
    return usuario;
  }

  /** Edita nombre, correo, roles o estado (1.3, 1.4). Exige actor Admin. */
  editarUsuario(
    usuarioId: string,
    cambios: Partial<DatosUsuario>,
    actor: Usuario,
  ): void {
    this.exigirAdmin(actor);
    const actual = this.usuarioPorId(usuarioId);
    if (!actual) {
      throw new ErrorValidacion(`El usuario "${usuarioId}" no existe.`);
    }
    let nombre = actual.nombre;
    if (cambios.nombre !== undefined) {
      nombre = this.validarNombre(cambios.nombre);
    }
    let correo = actual.correo;
    if (cambios.correo !== undefined) {
      correo = this.validarCorreo(cambios.correo, usuarioId);
    }
    let roles = actual.roles;
    if (cambios.roles !== undefined) {
      roles = this.validarRoles(cambios.roles);
    }
    const activo = cambios.activo ?? actual.activo;
    this.usuariosSignal.update((lista) =>
      lista.map((u) => (u.id === usuarioId ? { ...u, nombre, correo, roles, activo } : u)),
    );
  }

  /** Desactiva sin borrar (1.3): conserva el historial del usuario. */
  desactivarUsuario(usuarioId: string, actor: Usuario): void {
    this.editarUsuario(usuarioId, { activo: false }, actor);
  }

  // ---------- Validaciones ----------

  private exigirAdmin(actor: Usuario): void {
    if (!actor || !actor.activo || !this.usuariosSignal().some((u) => u.id === actor.id)) {
      throw new ErrorValidacion('Se requiere una sesion activa para administrar usuarios.');
    }
    if (!actor.roles.includes('Admin')) {
      throw new ErrorPermisoDenegado('administrarUsuarios', 'Administracion', ['Admin']);
    }
  }

  private validarNombre(nombre: string): string {
    const limpio = nombre.trim();
    if (!limpio) {
      throw new ErrorValidacion('El nombre del usuario es obligatorio.');
    }
    return limpio;
  }

  private validarCorreo(correo: string, exceptoId?: string): string {
    const limpio = correo.trim().toLowerCase();
    if (!CORREO_RE.test(limpio)) {
      throw new ErrorValidacion('El correo no tiene un formato valido.');
    }
    if (this.existeCorreo(limpio, exceptoId)) {
      throw new ErrorDuplicado('usuario', 'correo', limpio);
    }
    return limpio;
  }

  private existeCorreo(correo: string, exceptoId?: string): boolean {
    return this.usuariosSignal().some((u) => u.correo === correo && u.id !== exceptoId);
  }

  private validarRoles(roles: readonly Rol[]): readonly Rol[] {
    if (!roles || roles.length === 0) {
      throw new ErrorValidacion('El usuario requiere al menos un rol (1.4).');
    }
    for (const rol of roles) {
      if (!ROLES.includes(rol)) {
        throw new ErrorValidacion(`Rol desconocido: "${String(rol)}".`);
      }
    }
    return [...new Set(roles)];
  }
}
