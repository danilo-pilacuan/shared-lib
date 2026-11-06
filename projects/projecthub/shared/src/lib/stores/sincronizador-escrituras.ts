/**
 * Escrituras del frontend hacia el backend (docs/funcionalidades.md 13.4).
 * El cliente es la fuente de la verdad durante la sesion: tras cada
 * mutacion de los stores empuja su estado completo a PUT /api/sincronizacion
 * (re-sync total), con debounce para agrupar rrafagas de cambios. Si la API
 * no responde reintenta en el siguiente cambio; nunca lanza (degradacion
 * elegante). Debe instanciarse dentro de un contexto de inyeccion.
 */
import { Injectable, NgZone, effect, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiEnlaceService } from './api-enlace';
import { ProjectStore } from './project.store';
import { UsuarioStore } from './usuario.store';

/** Milisegundos de espera antes de empujar tras una rafaga de cambios. */
export const ESCRITURA_DEBOUNCE_MS = 400;

@Injectable()
export class SincronizadorEscrituras {
  private readonly enlace = inject(ApiEnlaceService);
  private readonly projectStore = inject(ProjectStore);
  private readonly usuarioStore = inject(UsuarioStore);
  private readonly zone = inject(NgZone);

  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private enVuelo = false;
  private pendiente = false;

  /** Suscribe el empuje automatico a los cambios de los stores. */
  observar(): void {
    effect(() => {
      this.usuarioStore.usuarios();
      this.projectStore.proyectos();
      this.projectStore.etapas();
      this.projectStore.entregables();
      this.projectStore.bitacora();
      this.programarFueraDeZone();
    });
  }

  /** Programa un empuje con debounce; multiple cambios = un solo envio. */
  programar(): void {
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
    }
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.empujar();
    }, ESCRITURA_DEBOUNCE_MS);
  }

  /** Empuja el estado actual; reprograma si hubo cambios durante el envio. */
  async empujar(): Promise<boolean> {
    if (this.enVuelo) {
      this.pendiente = true;
      return false;
    }
    this.enVuelo = true;
    try {
      const cuerpo = {
        usuarios: this.usuarioStore.usuarios(),
        proyectos: this.projectStore.proyectos(),
        etapas: this.projectStore.etapas(),
        entregables: this.projectStore.entregables(),
        bitacora: this.projectStore.bitacora(),
      };
      const respuesta = await this.enlace.enviar<Record<string, unknown>>(
        'PUT',
        '/api/sincronizacion',
        cuerpo,
        this.actorId(),
      );
      return respuesta !== null;
    } finally {
      this.enVuelo = false;
      if (this.pendiente) {
        this.pendiente = false;
        this.programar();
      }
    }
  }

  /** Actor de las escrituras: primer usuario activo de la sesion simulada. */
  private actorId(): string {
    return this.usuarioStore.usuariosActivos()[0]?.id ?? 'sistema';
  }

  private programarFueraDeZone(): void {
    this.zone.runOutsideAngular(() => this.programar());
  }
}
