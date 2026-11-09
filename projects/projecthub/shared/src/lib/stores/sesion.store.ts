/**
 * Sesion real (docs/funcionalidades.md 10.3): el usuario activo lo fija la
 * autenticacion (login o restauracion del token); no existe sesion simulada
 * ni cambio de identidad sin credenciales. Store con signals; instancia
 * unica via InjectionToken.
 */
import { Injectable, InjectionToken, WritableSignal, computed, inject, signal } from '@angular/core';
import { Rol } from '../domain/catalogos';
import { Usuario } from '../domain/modelos';

@Injectable({ providedIn: 'root' })
export class SesionStore {
  private readonly usuarioSignal: WritableSignal<Usuario | null> = signal(null);

  /** Usuario autenticado; null si no hay sesion. */
  readonly usuarioActivo = computed<Usuario | null>(() => this.usuarioSignal());

  /** Roles efectivos del usuario activo; vacio si no hay sesion. */
  readonly rolesActivos = computed<readonly Rol[]>(
    () => this.usuarioActivo()?.roles ?? [],
  );

  readonly haySesion = computed(() => this.usuarioActivo() !== null);

  /**
   * Fija el usuario de la sesion (10.3). Solo la autenticacion lo invoca en
   * produccion (los tests lo usan para simular una sesion iniciada); un
   * usuario inactivo no puede iniciar sesion (1.8). `null` cierra la sesion.
   */
  fijarUsuario(usuario: Usuario | null): void {
    if (usuario !== null && !usuario.activo) {
      throw new Error('Un usuario inactivo no puede iniciar sesion.');
    }
    this.usuarioSignal.set(usuario);
  }

  /** Cierra la sesion (el token lo gestiona AutenticacionService). */
  cerrar(): void {
    this.usuarioSignal.set(null);
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
