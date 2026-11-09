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
  Injector,
  effect,
  makeEnvironmentProviders,
  provideAppInitializer,
  runInInjectionContext,
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
  /**
   * Ids de bitacora confirmados por el servidor (iteracion 53, VULN-001).
   * El push es append-only (3.5): solo se envian entradas propias del actor
   * o ya confirmadas; una entrada ajena no confirmada (registrada por otro
   * usuario en otra pestana, que este store aun no conoce) se omite para
   * no atribuir acciones ajenas y no agotar los reintentos con 422.
   */
  private confirmadas = new Set<string>();

  /** Re-baselinea tras la carga inicial: el proximo cambio real dispara push. */
  preparar(): void {
    this.listo = true;
  }

  /** Re-ancla el estado tras un cambio de identidad (login): los datos
   * descargados por la re-sincronizacion del login no son "cambios locales
   * pendientes"; se marcan como confirmados y se borra el eco del servidor
   * para que el proximo cambio real dispare el push. */
  reBaselinear(): void {
    this.reBaselinearConfirmadas();
    this.aplicada = null;
  }

  /**
   * Confirma como enviadas las entradas de bitacora presentes en los
   * stores tras la carga inicial (13.3). Sin esto, la primera lectura del
   * efecto dejaria `confirmadas` vacio y el primer push omitiria el estado
   * sembrado por el GET inicial.
   */
  private reBaselinearConfirmadas(): void {
    this.confirmadas = new Set(this.projectStore.bitacora().map((b) => b.id));
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
        this.reBaselinearConfirmadas();
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
    // Sin sesion activa no hay token de autorizacion: el backend rechazaria
    // la escritura con 422. Los cambios sin sesion son efimeros: se omite el
    // push y la sincronizacion los retomara al iniciar sesion.
    if (this.actorId() === null) {
      return false;
    }
    if (this.enVuelo) {
      this.pendiente = true;
      return false;
    }
    this.enVuelo = true;
    try {
      const actor = this.actorId();
      const bitacoraCompleta = this.projectStore.bitacora();
      // VULN-001: el push de bitacora es append-only (solo entradas propias
      // o ya confirmadas). Omitir lo demas evita atribuir acciones ajenas y
      // que el reintento automatico agote 422 en bucle tras un login sin
      // re-sincronizacion de stores.
      const bitacora = bitacoraCompleta.filter(
        (b) => b.autorId === actor || this.confirmadas.has(b.id),
      );
      const cuerpo = {
        usuarios: this.usuarioStore.usuarios(),
        proyectos: this.projectStore.proyectos(),
        etapas: this.projectStore.etapas(),
        entregables: this.projectStore.entregables(),
        bitacora,
      };
      const respuesta = await this.enlace.enviar<Record<string, unknown>>(
        'PUT',
        '/api/sincronizacion',
        cuerpo,
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
   * la sesion" el cliente empuja). Sin sesion devuelve null y el push se
   * omite: no existe un actor 'sistema' en el backend.
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
      // Confirma las ids que el servidor devolvio; si la respuesta no trajo
      // bitacora (respuesta parcial de usuarios) conserva lo ya confirmado:
      // pisarlo descartaria pushes propios en vuelo (iteracion 53).
      this.confirmadas = new Set((bitacora as BitacoraEntrada[]).map((b) => b.id));
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
 * el initializer async restaura la sesion y descarga el estado autoritativo.
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
      const inyector = inject(Injector);
      // Sondeo de salud (iteracion 32): publica en la UI si el backend
      // responde; mientras no responde la app sigue con datos de referencia.
      inject(ApiEnlaceService).iniciarSondeoSalud();
      // Fase 14 primero: si hay token guardado, restaura la sesion (GET /me)
      // para que la descarga inicial y el push viajen ya autenticados (sin
      // sesion el backend responde 422 a las lecturas autoritativas).
      await autenticacion.restaurarSesion();
      // Tras el await el contexto de inyeccion ya no existe: la descarga
      // inicial resuelve sus servicios dentro del inyector capturado (it. 57).
      await runInInjectionContext(inyector, () => sincronizarStores());
      sincronizador.preparar();
    }),
  ]);
}
