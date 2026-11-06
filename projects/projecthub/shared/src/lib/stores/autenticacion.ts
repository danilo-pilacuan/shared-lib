/**
 * Autenticacion real (docs/funcionalidades.md 10.3, fase 14).
 * Login contra POST /api/auth/login del backend FastAPI: el servidor valida
 * credenciales y devuelve un JWT (HS256) que esta capa guarda en localStorage
 * y adjunta como "Authorization: Bearer <token>" en cada llamada HTTP.
 * La sesion activa (SesionStore) queda fijada al usuario autenticado; si el
 * backend no responde, la app sigue en modo demo con la sesion simulada
 * (degradacion elegante, nunca excepcion).
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { API_TIMEOUT_MS, API_BASE_URL } from './api-enlace';
import { Usuario } from '../domain/modelos';
import { SESION_STORE, SesionStore } from './sesion.store';

/** Clave de localStorage para el token de sesion. */
const CLAVE_TOKEN = 'projecthub.token';

/** Codigos de error de autenticacion que la UI puede mostrar. */
export type CodigoAutenticacion =
  | 'CREDENCIALES_INVALIDAS'
  | 'USUARIO_INACTIVO'
  | 'BACKEND_NO_DISPONIBLE';

/** Error de autenticacion con codigo estable para la UI. */
export class ErrorAutenticacion extends Error {
  constructor(readonly codigo: CodigoAutenticacion, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorAutenticacion';
  }
}

/**
 * Persistencia del token en localStorage. Encapsulada en un servicio para
 * que los tests la sustituyan y para tolerar entornos sin localStorage
 * (never throws).
 */
@Injectable({ providedIn: 'root' })
export class TokenAlmacen {
  guardar(token: string): void {
    try {
      localStorage.setItem(CLAVE_TOKEN, token);
    } catch {
      /* sin localStorage (modo privado, tests): la sesion no persiste */
    }
  }

  leer(): string | null {
    try {
      return localStorage.getItem(CLAVE_TOKEN);
    } catch {
      return null;
    }
  }

  limpiar(): void {
    try {
      localStorage.removeItem(CLAVE_TOKEN);
    } catch {
      /* idem */
    }
  }
}

@Injectable({ providedIn: 'root' })
export class AutenticacionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly tokenAlmacen = inject(TokenAlmacen);
  private readonly sesion = inject(SESION_STORE, { optional: true }) ?? inject(SesionStore);

  /** Token actual; signal espejo de TokenAlmacen (reactiva para la UI). */
  private readonly tokenSignal = signal<string | null>(this.tokenAlmacen.leer());

  /** true si hay token guardado (sesion real, no simulada). */
  readonly sesionReal = computed(() => this.tokenSignal() !== null);

  /** Login: valida credenciales en el servidor y fija la sesion activa. */
  async iniciarSesion(correo: string, contrasena: string): Promise<Usuario> {
    let respuesta: { token: string; usuario: Usuario };
    try {
      respuesta = await firstValueFrom(
        this.http
          .post<{ token: string; usuario: Usuario }>(`${this.baseUrl}/api/auth/login`, {
            correo,
            contrasena,
          })
          .pipe(timeout(API_TIMEOUT_MS)),
      );
    } catch (error) {
      throw this.mapearError(error);
    }
    this.tokenSignal.set(respuesta.token);
    this.tokenAlmacen.guardar(respuesta.token);
    // El usuario autenticado debe existir en el catalogo de la sesion; si
    // llego por el backend (usuario nuevo) se registra antes de seleccionarlo.
    this.sesion.registrarUsuario(respuesta.usuario);
    this.sesion.seleccionar(respuesta.usuario.id);
    return respuesta.usuario;
  }

  /**
   * Restaura la sesion desde el token guardado (recarga F5). Devuelve el
   * usuario si el token sigue valido; null si no hay token o el servidor lo
   * rechaza (en ese caso limpia el token). Nunca lanza.
   */
  async restaurarSesion(): Promise<Usuario | null> {
    const token = this.tokenAlmacen.leer();
    if (token === null) {
      return null;
    }
    try {
      const usuario = await firstValueFrom(
        this.http
          .get<Usuario>(`${this.baseUrl}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .pipe(timeout(API_TIMEOUT_MS)),
      );
      this.sesion.registrarUsuario(usuario);
      this.sesion.seleccionar(usuario.id);
      return usuario;
    } catch {
      this.cerrarSesion();
      return null;
    }
  }

  /** Cierra la sesion real y la simulada. */
  cerrarSesion(): void {
    this.tokenSignal.set(null);
    this.tokenAlmacen.limpiar();
    this.sesion.cerrar();
  }

  private mapearError(error: unknown): ErrorAutenticacion {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        return new ErrorAutenticacion(
          'CREDENCIALES_INVALIDAS',
          'Correo o contrasena incorrectos.',
        );
      }
      if (error.status === 403) {
        return new ErrorAutenticacion(
          'USUARIO_INACTIVO',
          'Un usuario inactivo no puede iniciar sesion.',
        );
      }
    }
    return new ErrorAutenticacion(
      'BACKEND_NO_DISPONIBLE',
      'El backend no responde; reintenta mas tarde.',
    );
  }
}
