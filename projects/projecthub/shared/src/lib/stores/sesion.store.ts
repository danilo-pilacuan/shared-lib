/**
 * Sesion simulada (docs/funcionalidades.md 1.6): el usuario activo determina
 * todos los permisos. Store con signals; instancia unica via InjectionToken.
 */
import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Rol } from '../domain/catalogos';
import { Usuario } from '../domain/modelos';
import { USUARIOS_SEMILLA } from './semilla';

/** Catalogo de usuarios disponible para la sesion simulada. */
export interface SesionState {
  readonly usuarios: readonly Usuario[];
  readonly usuarioActivoId: string | null;
}

@Injectable({ providedIn: 'root' })
export class SesionStore {
  private readonly usuariosSignal = signal<readonly Usuario[]>(USUARIOS_SEMILLA);
  private readonly usuarioActivoIdSignal = signal<string | null>(null);

  /** Usuarios activos: solo ellos pueden ser usuario activo (1.8). */
  readonly usuariosActivos = computed(() =>
    this.usuariosSignal().filter((u) => u.activo),
  );

  readonly usuarioActivo = computed<Usuario | null>(() => {
    const id = this.usuarioActivoIdSignal();
    if (id === null) return null;
    return this.usuariosSignal().find((u) => u.id === id) ?? null;
  });

  /** Roles efectivos del usuario activo; vacio si no hay sesion. */
  readonly rolesActivos = computed<readonly Rol[]>(
    () => this.usuarioActivo()?.roles ?? [],
  );

  readonly haySesion = computed(() => this.usuarioActivo() !== null);

  /** Cambia el usuario activo; rechaza usuarios inexistentes o inactivos (1.8). */
  seleccionar(usuarioId: string): void {
    const usuario = this.usuariosSignal().find((u) => u.id === usuarioId);
    if (!usuario) {
      throw new Error(`Usuario "${usuarioId}" no existe.`);
    }
    if (!usuario.activo) {
      throw new Error('Un usuario inactivo no puede iniciar sesion.');
    }
    this.usuarioActivoIdSignal.set(usuarioId);
  }

  /**
   * Registra un usuario en el catalogo de la sesion si no existe (fase 14):
   * el usuario autenticado puede venir del backend (alta nueva) y no estar
   * en la semilla. Si ya existe, lo reemplaza por la version actualizada.
   */
  registrarUsuario(usuario: Usuario): void {
    this.usuariosSignal.update((lista) => {
      const indice = lista.findIndex((u) => u.id === usuario.id);
      if (indice === -1) {
        return [...lista, usuario];
      }
      const copia = [...lista];
      copia[indice] = usuario;
      return copia;
    });
  }

  cerrar(): void {
    this.usuarioActivoIdSignal.set(null);
  }
}

/** Token unico del store de sesion entre shell y remotes. */
export const SESION_STORE = new InjectionToken<SesionStore>('SESION_STORE', {
  providedIn: 'root',
  factory: () => new SesionStore(),
});

/** Resuelve el store de sesion (instancia unica del inyector raiz). */
export function sesionStore(): SesionStore {
  return inject(SESION_STORE, { optional: true }) ?? inject(SesionStore);
}
