/**
 * Autenticacion real (docs/funcionalidades.md 10.3, fase 14).
 * Login contra POST /api/auth/login del backend FastAPI: el servidor valida
 * credenciales y devuelve un JWT (HS256) que esta capa guarda en localStorage
 * y adjunta como "Authorization: Bearer <token>" en cada llamada HTTP.
 * La sesion activa (SesionStore) queda fijada al usuario autenticado; si el
 * backend no responde se muestra el error y la app navega sin sesion
 * (degradacion elegante, nunca excepcion).
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { API_TIMEOUT_MS, API_BASE_URL, ApiEnlaceService } from './api-enlace';
import { Usuario } from '../domain/modelos';
import { SESION_STORE, SesionStore } from './sesion.store';
import { sincronizarStores } from './sincronizacion';

/** Clave de localStorage para el token de sesion. */
const CLAVE_TOKEN = 'projecthub.token';

/** Codigos de error de autenticacion que la UI puede mostrar. */
export type CodigoAutenticacion =
  | 'CREDENCIALES_INVALIDAS'
  | 'USUARIO_INACTIVO'
  | 'CONTRASENA_ACTUAL_INVALIDA'
  | 'LIMITE_INTENTOS'
  | 'VALIDACION'
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

  /**
   * Veces que el backend invalido la sesion en pleno uso (14.6). La app
   * shell reacciona: cierra sesion y redirige a /login?expirada=1.
   */
  readonly expiraciones = signal(0);

  /**
   * Veces que el backend rechazo al actor por cuenta desactivada en pleno
   * uso (14.7). La app shell reacciona: cierra sesion y redirige a
   * /login?desactivada=1 con su propio aviso.
   */
  readonly desactivaciones = signal(0);

  constructor() {
    // Cuando ApiEnlaceService detecta el 401 SESION_INVALIDA limpia el
    // token; aqui se refleja en el signal espejo y en la sesion simulada.
    const enlace = inject(ApiEnlaceService);
    enlace.onSesionExpirada(() => {
      this.cerrarSesion();
      this.expiraciones.update((n) => n + 1);
    });
    // El 403 USUARIO_INACTIVO no limpia el token en el enlace (la identidad
    // sigue siendo valida, la cuenta no): cerrar la sesion es decision de la
    // app, que aqui se refleja igual que una expiracion.
    enlace.onCuentaDesactivada(() => {
      this.cerrarSesion();
      this.desactivaciones.update((n) => n + 1);
    });
  }

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
    this.sesion.fijarUsuario(respuesta.usuario);
    // Con la sesion real fijada se descarga el estado autoritativo del
    // backend (10.3): el arranque anonimo no puede hacerlo por el 422 de
    // sesion ausente y quedaria en semilla local.
    await this.resincronizarStores();
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
      this.sesion.fijarUsuario(usuario);
      return usuario;
    } catch {
      this.cerrarSesion();
      return null;
    }
  }

  /**
   * Descarga las colecciones del backend tras fijar la sesion (13.3). Nunca
   * lanza: si la API no responde los stores conservan su estado local y el
   * SincronizadorEscrituras re-empujara los cambios al recuperar la API.
   */
  private async resincronizarStores(): Promise<void> {
    try {
      await sincronizarStores();
    } catch {
      /* degradacion elegante: la app sigue con el estado local */
    }
  }

  /** Cierra la sesion real y la simulada. */
  cerrarSesion(): void {
    this.tokenSignal.set(null);
    this.tokenAlmacen.limpiar();
    this.sesion.cerrar();
  }

  /**
   * Cambio de contrasena (14.5): exige la actual y politica minima en el
   * servidor. Exige sesion real (hay token); ErrorAutenticacion con codigo
   * CONTRASENA_ACTUAL_INVALIDA (401) o VALIDACION (422 politica/sin sesion).
   * Al exito el token vigente sigue siendo valido: no invalida la sesion.
   */
  async cambiarContrasena(contrasenaActual: string, contrasenaNueva: string): Promise<void> {
    // El token se lee de TokenAlmacen (fuente de verdad, igual que
    // restaurarSesion); el signal espejo solo se refresca via este servicio.
    const token = this.tokenAlmacen.leer();
    if (token === null) {
      throw new ErrorAutenticacion('VALIDACION', 'Inicia sesion antes de cambiar la contrasena.');
    }
    try {
      await firstValueFrom(
        this.http
          .put<void>(
            `${this.baseUrl}/api/auth/contrasena`,
            { contrasenaActual, contrasenaNueva },
            { headers: { Authorization: `Bearer ${token}` } },
          )
          .pipe(timeout(API_TIMEOUT_MS)),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const cuerpo = (error.error ?? {}) as {
          codigo?: string;
          mensaje?: string;
          detail?: { codigo?: string; mensaje?: string };
        };
        const mensaje = cuerpo?.mensaje ?? cuerpo?.detail?.mensaje;
        if (error.status === 401) {
          throw new ErrorAutenticacion(
            'CONTRASENA_ACTUAL_INVALIDA',
            mensaje ?? 'La contrasena actual no es correcta.',
          );
        }
        if (error.status === 422) {
          throw new ErrorAutenticacion(
            'VALIDACION',
            mensaje ?? 'La contrasena nueva no cumple la politica minima.',
          );
        }
      }
      throw new ErrorAutenticacion(
        'BACKEND_NO_DISPONIBLE',
        'El backend no responde; reintenta mas tarde.',
      );
    }
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
      if (error.status === 429) {
        // Rate limit del backend (mitigacion VULN-003): mensaje propio, no
        // "backend no disponible" (la API esta viva, solo rechazo).
        const cuerpo = error.error as { detail?: { mensaje?: string } } | null;
        return new ErrorAutenticacion(
          'LIMITE_INTENTOS',
          cuerpo?.detail?.mensaje ?? 'Demasiados intentos fallidos; reintente mas tarde.',
        );
      }
    }
    return new ErrorAutenticacion(
      'BACKEND_NO_DISPONIBLE',
      'El backend no responde; reintenta mas tarde.',
    );
  }
}
