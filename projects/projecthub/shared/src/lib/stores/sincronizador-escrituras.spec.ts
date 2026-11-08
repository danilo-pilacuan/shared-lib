/** Tests de SincronizadorEscrituras (13.4): empuje de estado al backend. */
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ApiEnlaceService,
  ESCRITURA_DEBOUNCE_MS,
  ProjectStore,
  SESION_STORE,
  SesionStore,
  SincronizadorEscrituras,
  UsuarioStore,
} from './index';

describe('SincronizadorEscrituras', () => {
  let httpMock: HttpTestingController;
  let projectStore: ProjectStore;
  let usuarioStore: UsuarioStore;
  let sesionStore: SesionStore;
  let sincronizador: SincronizadorEscrituras;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), SincronizadorEscrituras],
    });
    httpMock = TestBed.inject(HttpTestingController);
    projectStore = TestBed.inject(ProjectStore);
    usuarioStore = TestBed.inject(UsuarioStore);
    sesionStore = TestBed.inject(SESION_STORE);
    sesionStore.seleccionar('u-admin');
    sincronizador = TestBed.inject(SincronizadorEscrituras);
    // Los pushes requieren actor: sesion simulada con usuario semilla.
    sesionStore.seleccionar('u-admin');
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('no empuja sin sesion activa (modo demo): no hay actor valido', async () => {
    sesionStore.cerrar();
    expect(await sincronizador.empujar()).toBe(false);
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');
  });

  it('empuja el estado completo de los stores al backend', async () => {    const promesa = sincronizador.empujar();
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.proyectos.length).toBe(projectStore.proyectos().length);
    expect(req.request.body.usuarios.length).toBe(usuarioStore.usuarios().length);
    req.flush({});
    expect(await promesa).toBe(true);
  });

  it('omite del push la bitacora ajena no confirmada y la envia tras el eco del servidor (VULN-001)', async () => {
    // Estado stale: el store trae una entrada ajena (registrada por otro
    // usuario en otra pestana) que el servidor aun no conoce. El push solo
    // lleva propias o confirmadas: no atribuye acciones ajenas.
    const propia = {
      id: 'b-propia',
      proyectoId: 'p1',
      autorId: 'u-admin',
      fecha: '2026-11-09T12:00:00Z',
      tipo: 'cambio' as const,
      etapaOrigen: null,
      etapaDestino: null,
      comentario: 'Propia del actor',
    };
    const ajena = {
      ...propia,
      id: 'b-ajena',
      autorId: 'u-pm',
      comentario: 'Registrada por el PM en otra pestana',
    };
    projectStore.cargarDesdeBackend({
      proyectos: [],
      etapas: [],
      entregables: [],
      bitacora: [propia, ajena],
    });
    const promesa = sincronizador.empujar();
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(req.request.body.bitacora.map((b: { id: string }) => b.id)).toEqual(['b-propia']);
    // El servidor responde con la bitacora autoritativa (incluye la ajena,
    // registrada en servidor por el otro usuario): el eco la confirma y a
    // partir de ahi el push puede llevarla sin atribucion falsa.
    req.flush({
      usuarios: [],
      proyectos: [],
      etapas: [],
      entregables: [],
      bitacora: [propia, ajena],
    });
    expect(await promesa).toBe(true);
    const reintento = sincronizador.empujar();
    const req2 = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(req2.request.body.bitacora.map((b: { id: string }) => b.id)).toEqual([
      'b-propia',
      'b-ajena',
    ]);
    req2.flush({});
    expect(await reintento).toBe(true);
  });

  it('reporta false cuando la API no responde', async () => {
    const promesa = sincronizador.empujar();
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    req.error(new ProgressEvent('error'));
    expect(await promesa).toBe(false);
  });

  it('no empuja el estado inicial (eco) antes de preparar()', async () => {
    TestBed.runInInjectionContext(() => sincronizador.observar());
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');
  });

  it('empuja una sola vez tras una mutacion real del store', async () => {
    TestBed.runInInjectionContext(() => sincronizador.observar());
    sincronizador.preparar();
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');
    usuarioStore.cargarDesdeBackend([
      {
        id: 'u-x',
        nombre: 'Usuario X',
        correo: 'x@projecthub.dev',
        roles: ['Admin'],
        activo: true,
      },
    ]);
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.usuarios.map((u: { id: string }) => u.id)).toContain('u-x');
    req.flush({});
  });

  it('agrupa una rafaga de cambios en un solo empuje (debounce)', async () => {
    TestBed.runInInjectionContext(() => sincronizador.observar());
    sincronizador.preparar();
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');
    usuarioStore.cargarDesdeBackend([
      {
        id: 'u-x',
        nombre: 'Usuario X',
        correo: 'x@projecthub.dev',
        roles: ['Admin'],
        activo: true,
      },
    ]);
    projectStore.cargarDesdeBackend({
      proyectos: [],
      etapas: [],
      entregables: [],
      bitacora: [],
    });
    projectStore.crearProyecto({
      nombre: 'Rafaga E2E',
      descripcion: '',
      patrocinadorId: 'u-x',
      presupuestoEstimado: 1000,
      fechaObjetivo: '2027-06-30',
    }, usuarioStore.usuarios()[0]);
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 150));
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('aplica la respuesta del servidor a los stores sin re-disparar el push', async () => {
    TestBed.runInInjectionContext(() => sincronizador.observar());
    sincronizador.preparar();
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');

    usuarioStore.cargarDesdeBackend([
      {
        id: 'u-x',
        nombre: 'Usuario X',
        correo: 'x@projecthub.dev',
        roles: ['Admin'],
        activo: true,
      },
    ]);
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));

    const estadoServidor = {
      usuarios: [
        {
          id: 'u-x',
          nombre: 'Usuario X Normalizado',
          correo: 'x@projecthub.dev',
          roles: ['Admin'],
          activo: true,
        },
      ],
      proyectos: [
        {
          id: 'p-srv',
          nombre: 'Proyecto del servidor',
          descripcion: '',
          patrocinadorId: 'u-x',
          presupuestoEstimado: 500,
          fechaObjetivo: '2027-01-31',
          etapa: 'Planteamiento',
          estado: 'Activo',
        },
      ],
      etapas: [],
      entregables: [],
      bitacora: [],
    };
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    req.flush(estadoServidor);

    // La respuesta del servidor reemplaza el estado local (fuente de verdad
    // compartida) y ese cambio es eco: no genera un segundo PUT.
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 150));
    expect(usuarioStore.usuarios()[0]?.nombre).toBe('Usuario X Normalizado');
    expect(projectStore.proyectos().map((p) => p.id)).toContain('p-srv');
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');
  });

  it('no toca los stores cuando la respuesta no trae colecciones', async () => {
    const promesa = sincronizador.empujar();
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    req.flush({ algo: 'no-colecciones' });
    expect(await promesa).toBe(true);
    expect(usuarioStore.usuarios().length).toBeGreaterThan(0);
    expect(projectStore.proyectos().length).toBeGreaterThan(0);
  });

  it('re-empuja automaticamente los cambios hechos durante una caida al recuperar la API', async () => {
    TestBed.runInInjectionContext(() => sincronizador.observar());
    TestBed.runInInjectionContext(() => sincronizador.conectarRecuperacion());
    sincronizador.preparar();
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');

    // Cambio durante la caida: el PUT falla y queda pendiente.
    const enlace = TestBed.inject(ApiEnlaceService);
    enlace.marcar(false);
    usuarioStore.cargarDesdeBackend([
      {
        id: 'u-offline',
        nombre: 'Hecho sin API',
        correo: 'off@projecthub.dev',
        roles: ['Admin'],
        activo: true,
      },
    ]);
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 150));
    const fallido = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(fallido.request.body.usuarios.map((u: { id: string }) => u.id)).toContain('u-offline');
    fallido.error(new ProgressEvent('error'));
    await new Promise((r) => setTimeout(r, 50));

    // Sin nuevo cambio, la recuperacion sola debe disparar el re-push.
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');
    enlace.marcar(true);
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 150));
    const reintento = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(reintento.request.method).toBe('PUT');
    expect(reintento.request.body.usuarios.map((u: { id: string }) => u.id)).toContain('u-offline');
    reintento.flush({});
  });

  it('no re-empuja al recuperar si no hubo cambios durante la caida', async () => {
    TestBed.runInInjectionContext(() => sincronizador.observar());
    TestBed.runInInjectionContext(() => sincronizador.conectarRecuperacion());
    sincronizador.preparar();
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 100));

    const enlace = TestBed.inject(ApiEnlaceService);
    enlace.marcar(false);
    await new Promise((r) => setTimeout(r, 50));
    enlace.marcar(true);
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 150));
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');
  });

  it('un empuje exitoso limpia la bandera de cambios no enviados', async () => {
    const enlace = TestBed.inject(ApiEnlaceService);
    TestBed.runInInjectionContext(() => sincronizador.conectarRecuperacion());
    enlace.marcar(false);
    const promesa = sincronizador.empujar();
    const fallido = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    fallido.error(new ProgressEvent('error'));
    expect(await promesa).toBe(false);
    await new Promise((r) => setTimeout(r, 50));

    // La API vuelve y el re-push automatico sale bien: la bandera se limpia
    // y un ciclo caida/recuperacion posterior ya no re-empuja.
    enlace.marcar(true);
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 150));
    const reintento = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    reintento.flush({});
    await new Promise((r) => setTimeout(r, 50));

    enlace.marcar(false);
    await new Promise((r) => setTimeout(r, 50));
    enlace.marcar(true);
    await new Promise((r) => setTimeout(r, ESCRITURA_DEBOUNCE_MS + 150));
    httpMock.expectNone('http://localhost:8100/api/sincronizacion');
  });
});
