/**
 * Cliente HTTP del backend FastAPI (docs/funcionalidades.md 13.3, 10.3).
 * Sincroniza colecciones del dominio contra http://localhost:8100 y, si la
 * API no responde, deja intactas las semillas en los stores (degradacion
 * elegante: estado vacio, no excepcion). El actor viaja en X-Actor-Id.
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { TokenAlmacen } from './autenticacion';
import { Usuario } from '../domain/modelos';

/** URL base de la API; el shell puede sobreescribirla con el token. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:8100',
});

/** Milisegundos de gracia para considerar caida el backend. */
export const API_TIMEOUT_MS = 2500;

const ACTOR_HEADER = 'X-Actor-Id';

/** Callback opcional para avisar a las apps que el backend cayo (o volvio). */
export type EnlaceListener = (disponible: boolean) => void;

@Injectable({ providedIn: 'root' })
export class ApiEnlaceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly tokenAlmacen = inject(TokenAlmacen);
  private disponible_ = true;
  private readonly listeners = new Set<EnlaceListener>();

  /** Indica si el ultimo contacto con la API fue exitoso. */
  get disponible(): boolean {
    return this.disponible_;
  }

  /** Suscribe un callback de cambio de disponibilidad. */
  onCambio(listener: EnlaceListener): void {
    this.listeners.add(listener);
  }

  /** Marca el estado y notifica solo en transicion. */
  marcar(disponible: boolean): void {
    if (this.disponible_ !== disponible) {
      this.disponible_ = disponible;
      this.listeners.forEach((l) => l(disponible));
    }
  }

  /**
   * Cabeceras de la peticion: actor simulado (X-Actor-Id, compatibilidad) y
   * Bearer JWT cuando hay sesion real (fase 14).
   */
  private cabeceras(actorId?: string): Record<string, string> | undefined {
    const cabeceras: Record<string, string> = {};
    const token = this.tokenAlmacen.leer();
    if (token !== null) {
      cabeceras['Authorization'] = `Bearer ${token}`;
    }
    if (actorId) {
      cabeceras[ACTOR_HEADER] = actorId;
    }
    return Object.keys(cabeceras).length > 0 ? cabeceras : undefined;
  }

  /** GET de coleccion; null si la API no responde (fallback a semilla). */
  async lista<T>(ruta: string, actorId?: string): Promise<readonly T[] | null> {
    try {
      const datos = await firstValueFrom(
        this.http
          .get<readonly T[]>(`${this.baseUrl}${ruta}`, {
            headers: this.cabeceras(actorId),
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
    actorId: string,
  ): Promise<T | null> {
    try {
      const datos = await firstValueFrom(
        this.http
          .request<T>(metodo, `${this.baseUrl}${ruta}`, {
            body: cuerpo,
            headers: this.cabeceras(actorId),
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

  private registrarCaida(error: unknown): void {
    if (error instanceof HttpErrorResponse || error instanceof Error) {
      this.marcar(false);
    }
  }
}

/** Tipo de actor para las llamadas: el propio Usuario del dominio. */
export type ActorApi = Pick<Usuario, 'id'>;
