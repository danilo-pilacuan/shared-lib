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
  SincronizadorEscrituras,
  UsuarioStore,
} from './index';

describe('SincronizadorEscrituras', () => {
  let httpMock: HttpTestingController;
  let projectStore: ProjectStore;
  let usuarioStore: UsuarioStore;
  let sincronizador: SincronizadorEscrituras;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), SincronizadorEscrituras],
    });
    httpMock = TestBed.inject(HttpTestingController);
    projectStore = TestBed.inject(ProjectStore);
    usuarioStore = TestBed.inject(UsuarioStore);
    sincronizador = TestBed.inject(SincronizadorEscrituras);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('empuja el estado completo de los stores al backend', async () => {
    const promesa = sincronizador.empujar();
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.proyectos.length).toBe(projectStore.proyectos().length);
    expect(req.request.body.usuarios.length).toBe(usuarioStore.usuarios().length);
    req.flush({});
    expect(await promesa).toBe(true);
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
});
