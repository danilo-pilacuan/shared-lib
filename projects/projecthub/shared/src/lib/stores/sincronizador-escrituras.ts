/**
 * Escrituras del frontend hacia el backend (docs/funcionalidades.md 13.4).
 * El cliente es la fuente de la verdad durante la sesion: tras cada
 * mutacion de los stores empuja su estado completo a PUT /api/sincronizacion
 * (re-sync total), con debounce para agrupar rafagas de cambios. Si la API
 * no responde reintenta en el siguiente cambio; nunca lanza (degradacion
 * elegante). El arranque (carga inicial + efecto de escritura) queda en el
 * provider proporcionarSincronizacionBackend(); las apps solo lo agregan a
 * sus providers.
 */
import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  inject,
  Injectable,
  NgZone,
  effect,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { BitacoraEntrada, Entregable, EtapaTrabajo, Proyecto, Usuario } from '../domain/modelos';
import { ApiEnlaceService } from './api-enlace';
import { AutenticacionService } from './autenticacion';
import { ProjectStore } from './project.store';
import { UsuarioStore } from './usuario.store';
import { SESION_STORE, SesionStore } from './sesion.store';
import { sincronizarStores } from './sincronizacion';

/** Milisegundos de espera antes de empujar tras una rafaga de cambios. */
export const ESCRITURA_DEBOUNCE_MS = 400;

@Injectable({ providedIn: 'root' })
export class SincronizadorEscrituras {
  private readonly enlace = inject(ApiEnlaceService);
  private readonly projectStore = inject(ProjectStore);
  private readonly usuarioStore = inject(UsuarioStore);
  private readonly sesion = inject(SESION_STORE, { optional: true }) ?? inject(SesionStore);
  private readonly zone = inject(NgZone);

  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private enVuelo = false;
  private pendiente = false;
  /**
   * Cambios hechos durante una caida (empujar() devolvio false). Al
   * recuperar la API se re-empujan automaticamente (iteracion 35): si el
   * usuario no vuelve a tocar nada, sin esto se perderian al cerrar la
   * pestaña porque el push solo se reprograma con un nuevo cambio.
   */
  private conCambiosNoEnviados = false;
  /** false hasta preparar(): la lectura inicial del efecto no empuja (eco). */
  private listo = false;
  /**
   * Referencias de estado aplicadas desde la respuesta del servidor. El
   * efecto no corre sincrono con la escritura de las signals, asi que la
   * supresion del eco se hace por identidad: si lo que lee el efecto es
   * exactamente lo que el servidor confirmo, no se re-dispara el push.
   */
  private aplicada: {
    usuarios: readonly Usuario[];
    proyectos: readonly Proyecto[];
    etapas: readonly EtapaTrabajo[];
    entregables: readonly Entregable[];
    bitacora: readonly BitacoraEntrada[];
  } | null = null;

  /** Re-baselinea tras la carga inicial: el proximo cambio real dispara push. */
  preparar(): void {
    this.listo = true;
  }

  /** Suscribe el empuje automatico a los cambios de los stores. */
  observar(): void {
    let primeraLectura = true;
    effect(() => {
      const usuarios = this.usuarioStore.usuarios();
      const proyectos = this.projectStore.proyectos();
      const etapas = this.projectStore.etapas();
      const entregables = this.projectStore.entregables();
      const bitacora = this.projectStore.bitacora();
      if (primeraLectura) {
        primeraLectura = false;
        return;
      }
      if (!this.listo) {
        return;
      }
      if (this.esEcoDelServidor(usuarios, proyectos, etapas, entregables, bitacora)) {
        return;
      }
      this.programarFueraDeZone();
    });
  }

  /** true si el estado actual de los stores es el confirmado por el servidor. */
  private esEcoDelServidor(
    usuarios: readonly Usuario[],
    proyectos: readonly Proyecto[],
    etapas: readonly EtapaTrabajo[],
    entregables: readonly Entregable[],
    bitacora: readonly BitacoraEntrada[],
  ): boolean {
    const aplicada = this.aplicada;
    if (aplicada === null) {
      return false;
    }
    return (
      usuarios === aplicada.usuarios &&
      proyectos === aplicada.proyectos &&
      etapas === aplicada.etapas &&
      entregables === aplicada.entregables &&
      bitacora === aplicada.bitacora
    );
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

  /**
   * Re-empuja automaticamente al recuperar la API (iteracion 35). El
   * sondeo de salud llama a onCambio; en la transicion a disponible, si
   * hubo escrituras fallidas durante la caida, programa un push. La
   * desuscripcion la gestiona el ciclo de vida de la app (root provider).
   */
  conectarRecuperacion(): void {
    this.enlace.onCambio((disponible) => {
      if (disponible && this.conCambiosNoEnviados) {
        this.conCambiosNoEnviados = false;
        this.programar();
      }
    });
  }

  /** Empuja el estado actual; reprograma si hubo cambios durante el envio. */
  async empujar(): Promise<boolean> {
    // Sin sesion activa (modo demo, fase 13) no hay actor valido: el backend
    // rechazaria la escritura con 404 (ENTIDAD_NO_ENCONTRADA). Los cambios
    // de demo son efimeros: se omite el push.
    if (this.actorId() === null) {
      return false;
    }
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
        this.actorId() as string,
      );
      if (respuesta !== null) {
        this.conCambiosNoEnviados = false;
        this.aplicarRespuesta(respuesta);
      } else {
        this.conCambiosNoEnviados = true;
      }
      return respuesta !== null;
    } finally {
      this.enVuelo = false;
      if (this.pendiente) {
        this.pendiente = false;
        this.programar();
      }
    }
  }

  /**
   * Actor de las escrituras: el usuario de la sesion activa (13.4: "durante
   * la sesion" el cliente empuja). Sin sesion (modo demo inicial) devuelve
   * null y el push se omite: no existe un actor 'sistema' en el backend.
   */
  private actorId(): string | null {
    return this.sesion.usuarioActivo()?.id ?? null;
  }

  /**
   * Aplica el estado confirmado por el servidor a los stores (13.4). El
   * efecto de escritura compara por identidad contra `aplicada` y no lo
   * vuelve a programar: si el servidor normalizo algo, el store queda igual
   * al del servidor sin generar un bucle de pushes.
   */
  private aplicarRespuesta(respuesta: Record<string, unknown>): void {
    const usuarios = respuesta['usuarios'];
    const proyectos = respuesta['proyectos'];
    const etapas = respuesta['etapas'];
    const entregables = respuesta['entregables'];
    const bitacora = respuesta['bitacora'];
    if (!Array.isArray(usuarios) && !Array.isArray(proyectos)) {
      return;
    }
    if (Array.isArray(usuarios)) {
      this.usuarioStore.cargarDesdeBackend(usuarios as Usuario[]);
      this.aplicada = {
        usuarios: usuarios as Usuario[],
        proyectos: [],
        etapas: [],
        entregables: [],
        bitacora: [],
      };
    }
    if (
      Array.isArray(proyectos) &&
      Array.isArray(etapas) &&
      Array.isArray(entregables) &&
      Array.isArray(bitacora)
    ) {
      this.projectStore.cargarDesdeBackend({
        proyectos: proyectos as Proyecto[],
        etapas: etapas as EtapaTrabajo[],
        entregables: entregables as Entregable[],
        bitacora: bitacora as BitacoraEntrada[],
      });
      this.aplicada = {
        usuarios: (Array.isArray(usuarios) ? usuarios : []) as Usuario[],
        proyectos: proyectos as Proyecto[],
        etapas: etapas as EtapaTrabajo[],
        entregables: entregables as Entregable[],
        bitacora: bitacora as BitacoraEntrada[],
      };
    }
  }

  private programarFueraDeZone(): void {
    this.zone.runOutsideAngular(() => this.programar());
  }
}

/**
 * Provider de arranque de la sincronizacion (13.3 + 13.4), una sola pieza
 * para shell y remotes. Resuelve SincronizadorEscrituras dentro de
 * ENVIRONMENT_INITIALIZER (contexto de inyeccion garantizado: evita el
 * NG0203 de llamar inject() tras un await) y enciende el efecto de escritura;
 * el initializer async solo hace la carga inicial del backend. Llamar
 * preparar() tras el await re-baselinea el efecto.
 */
export function proporcionarSincronizacionBackend(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        // Contexto de inyeccion garantizado: aqui si se puede inject().
        const sincronizador = inject(SincronizadorEscrituras);
        sincronizador.observar();
        // Re-push automatico de cambios hechos durante una caida (it. 35).
        sincronizador.conectarRecuperacion();
      },
    },
    provideAppInitializer(async () => {
      // La referencia se captura ANTES del await: tras reanudar la promesa
      // el contexto de inyeccion ya no existe (causa del NG0203).
      const sincronizador = inject(SincronizadorEscrituras);
      const autenticacion = inject(AutenticacionService);
      // Sondeo de salud (iteracion 32): publica en la UI si el backend
      // responde; mientras no responde la app sigue en modo demo.
      inject(ApiEnlaceService).iniciarSondeoSalud();
      await sincronizarStores();
      // Fase 14: si hay token guardado, restaura la sesion real (GET /me).
      // Nunca lanza: sin backend valido deja la app en modo demo.
      await autenticacion.restaurarSesion();
      sincronizador.preparar();
    }),
  ]);
}
