/**
 * Cliente HTTP del backend FastAPI (docs/funcionalidades.md 13.3, 10.3).
 * Sincroniza colecciones del dominio contra http://localhost:8100 y, si la
 * API no responde, deja intactas las semillas en los stores (degradacion
 * elegante: estado vacio, no excepcion). La identidad viaja en el token de sesion (Authorization).
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { TimeoutError } from 'rxjs';
import { TokenAlmacen } from './autenticacion';
import { Usuario } from '../domain/modelos';

/** URL base de la API; el shell puede sobreescribirla con el token. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:8100',
});

/** Milisegundos de gracia para considerar caida el backend. */
export const API_TIMEOUT_MS = 2500;

/** Callback opcional para avisar a las apps que el backend cayo (o volvio). */
export type EnlaceListener = (disponible: boolean) => void;

/** Callback para avisar que la sesion real expiro en pleno uso (14.6). */
export type SesionExpiradaListener = () => void;

/**
 * Callback para avisar que la cuenta del actor fue desactivada en pleno uso
 * (14.7): token vigente, usuario conocido, 403 USUARIO_INACTIVO.
 */
export type CuentaDesactivadaListener = () => void;

/**
 * Estado de contacto con el backend, visible para la UI (iteracion 32):
 * 'verificando' al arrancar, 'disponible' tras un contacto exitoso,
 * 'indisponible' cuando la API no responde (la app sigue con datos de
 * referencia de lectura,
 * degradacion elegante, pero el usuario debe saberlo).
 */
export type EstadoApi = 'verificando' | 'disponible' | 'indisponible';

/** Milisegundos entre sondeos de salud con el backend arriba. */
export const SONDEO_SALUD_MS = 15000;

/** Milisegundos de reintento acelerado cuando el backend esta caido. */
export const SONDEO_REINTENTO_MS = 5000;

@Injectable({ providedIn: 'root' })
export class ApiEnlaceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly tokenAlmacen = inject(TokenAlmacen);
  private disponible_ = true;
  private readonly listeners = new Set<EnlaceListener>();
  private readonly oyentesSesionExpirada = new Set<SesionExpiradaListener>();
  private readonly oyentesCuentaDesactivada = new Set<CuentaDesactivadaListener>();

  /** Estado de contacto con la API para la UI (signal reactiva). */
  readonly estado = signal<EstadoApi>('verificando');

  private sondeoIniciado = false;
  private temporizadorSondeo: ReturnType<typeof setInterval> | null = null;

  /** Indica si el ultimo contacto con la API fue exitoso. */
  get disponible(): boolean {
    return this.disponible_;
  }

  /** Suscribe un callback de cambio de disponibilidad. */
  onCambio(listener: EnlaceListener): void {
    this.listeners.add(listener);
  }

  /** Suscribe un callback que corre cuando el backend invalida la sesion (14.6). */
  onSesionExpirada(listener: SesionExpiradaListener): void {
    this.oyentesSesionExpirada.add(listener);
  }

  /**
   * Suscribe un callback que corre cuando el backend rechaza al actor por
   * cuenta desactivada (14.7): 403 USUARIO_INACTIVO con token vigente.
   */
  onCuentaDesactivada(listener: CuentaDesactivadaListener): void {
    this.oyentesCuentaDesactivada.add(listener);
  }

  /** Marca el estado y notifica solo en transicion. */
  marcar(disponible: boolean): void {
    this.estado.set(disponible ? 'disponible' : 'indisponible');
    if (this.disponible_ !== disponible) {
      this.disponible_ = disponible;
      this.listeners.forEach((l) => l(disponible));
    }
  }

  /**
   * Sondeo puntual de salud contra GET /api/salud (iteracion 32): marca el
   * estado segun el resultado y lo devuelve. Nunca lanza.
   */
  async sondear(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http
          .get<unknown>(`${this.baseUrl}/api/salud`)
          .pipe(timeout(API_TIMEOUT_MS)),
      );
      this.marcar(true);
      return true;
    } catch {
      this.marcar(false);
      return false;
    }
  }

  /**
   * Sondeo periodico de salud: uno inmediato y luego un intervalo; mientras
   * el backend esta caido reintenta mas rapido para anunciar la recuperacion
   * sin retraso. Idempotente: una sola vez por app (shell y remotes).
   */
  iniciarSondeoSalud(): void {
    if (this.sondeoIniciado) {
      return;
    }
    this.sondeoIniciado = true;
    const reprogramar = (disponible: boolean): void => {
      this.temporizadorSondeo = setInterval(
        () => void this.sondear().then(reprogramar),
        disponible ? SONDEO_SALUD_MS : SONDEO_REINTENTO_MS,
      );
    };
    void this.sondear().then(reprogramar);
  }

  /**
   * Cabeceras de la peticion: Authorization con token Bearer cuando hay sesion real (fase 14).
   */
  private cabeceras(): Record<string, string> | undefined {
    const cabeceras: Record<string, string> = {};
    const token = this.tokenAlmacen.leer();
    if (token !== null) {
      cabeceras['Authorization'] = `Bearer ${token}`;
    }
    return Object.keys(cabeceras).length > 0 ? cabeceras : undefined;
  }

  /** GET de coleccion; null si la API no responde (fallback a semilla). */
  async lista<T>(ruta: string): Promise<readonly T[] | null> {
    try {
      const datos = await firstValueFrom(
        this.http
          .get<readonly T[]>(`${this.baseUrl}${ruta}`, {
            headers: this.cabeceras(),
          })
          .pipe(timeout(API_TIMEOUT_MS)),
      );
      this.marcar(true);
      return datos;
    } catch (error) {
      this.registrarCaida(error);
      return null;
    }
  }

  /** POST/PUT/PATCH: devuelve la entidad o null si la API no responde. */
  async enviar<T>(
    metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    ruta: string,
    cuerpo: unknown,
  ): Promise<T | null> {
    try {
      const datos = await firstValueFrom(
        this.http
          .request<T>(metodo, `${this.baseUrl}${ruta}`, {
            body: cuerpo,
            headers: this.cabeceras(),
          })
          .pipe(timeout(API_TIMEOUT_MS)),
      );
      this.marcar(true);
      return datos;
    } catch (error) {
      this.registrarCaida(error);
      return null;
    }
  }

  /**
   * Clasifica el error de contacto con la API. Solo un problema de red,
   * timeout o un 5xx del servidor consideran al backend caido: un 4xx
   * (VALIDACION 422 por sesion ausente, 404, 409) demuestra
   * que la API esta viva y rechazo la peticion (mitigacion VULN-002),
   * de modo que el banner no anuncia una caida inexistente.
   */
  private esCaidaReal(error: unknown): boolean {
    if (error instanceof HttpErrorResponse) {
      return error.status === 0 || error.status >= 500;
    }
    return error instanceof Error || error instanceof TimeoutError;
  }

  private registrarCaida(error: unknown): void {
    if (this.esCaidaReal(error)) {
      this.marcar(false);
    } else if (error instanceof HttpErrorResponse) {
      if (this.esCuentaDesactivada(error)) {
        this.notificarCuentaDesactivada();
      }
      if (this.esSesionExpirada(error)) {
        this.notificarSesionExpirada();
      }
      // La API respondio (4xx): sigue disponible.
      this.marcar(true);
    }
  }

  /**
   * 401 con codigo SESION_INVALIDA significa que el backend valido el token
   * y lo rechazo (expirado o usuario eliminado): la sesion real ya no es
   * recuperable y el token almacenado queda inservible (docs 14.6). Se
   * limpia el token y se avisa a la app; el estado de salud de la API no
   * cambia porque el backend esta vivo.
   */
  private esSesionExpirada(error: HttpErrorResponse): boolean {
    if (error.status !== 401 || this.tokenAlmacen.leer() === null) {
      return false;
    }
    const cuerpo = error.error as { detail?: { codigo?: unknown }; codigo?: unknown } | null;
    const codigo = cuerpo?.detail?.codigo ?? cuerpo?.codigo;
    return codigo === 'SESION_INVALIDA';
  }

  /**
   * 403 con codigo USUARIO_INACTIVO significa que el token sigue siendo
   * criptograficamente valido pero la cuenta fue desactivada por un Admin
   * en pleno uso (docs 14.7). La sesion no se limpia aqui: es decision de
   * la app (el shell la cierra y avisa); el estado de salud de la API no
   * cambia porque el backend esta vivo.
   */
  private esCuentaDesactivada(error: HttpErrorResponse): boolean {
    if (error.status !== 403 || this.tokenAlmacen.leer() === null) {
      return false;
    }
    const cuerpo = error.error as { detail?: { codigo?: unknown }; codigo?: unknown } | null;
    const codigo = cuerpo?.detail?.codigo ?? cuerpo?.codigo;
    return codigo === 'USUARIO_INACTIVO';
  }

  private notificarSesionExpirada(): void {
    this.tokenAlmacen.limpiar();
    this.oyentesSesionExpirada.forEach((oyente) => oyente());
  }

  private notificarCuentaDesactivada(): void {
    this.oyentesCuentaDesactivada.forEach((oyente) => oyente());
  }
}

/** Tipo de actor para las llamadas: el propio Usuario del dominio. */
export type ActorApi = Pick<Usuario, 'id'>;
