/** Tests de SincronizadorEscrituras (13.4): empuje de estado al backend. */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ApiEnlaceService,
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
});
