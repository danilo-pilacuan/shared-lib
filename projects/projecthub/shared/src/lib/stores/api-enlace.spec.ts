/**
 * Tests de la capa HTTP (docs/funcionalidades.md 13.3): ApiEnlaceService
 * (timeout y degradacion) y sincronizarStores (carga en stores o fallback
 * a semilla cuando el backend no responde).
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiEnlaceService } from './api-enlace';
import { ProjectStore } from './project.store';
import { UsuarioStore } from './usuario.store';
import { PROYECTOS_SEMILLA, USUARIOS_SEMILLA } from './semilla';
import { sincronizarStores } from './sincronizacion';
import { Usuario } from '../domain/modelos';

describe('ApiEnlaceService', () => {
  let enlace: ApiEnlaceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    enlace = TestBed.inject(ApiEnlaceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('descarga una coleccion y marca disponible', async () => {
    const promesa = enlace.lista<Usuario>('/api/usuarios');
    const req = httpMock.expectOne('http://localhost:8100/api/usuarios');
    expect(req.request.method).toBe('GET');
    req.flush(USUARIOS_SEMILLA);
    const datos = await promesa;
    expect(datos).not.toBeNull();
    expect(datos!.length).toBe(USUARIOS_SEMILLA.length);
    expect(enlace.disponible).toBe(true);
  });

  it('devuelve null y marca caida cuando el backend no responde', async () => {
    const promesa = enlace.lista<Usuario>('/api/usuarios');
    const req = httpMock.expectOne('http://localhost:8100/api/usuarios');
    req.error(new ProgressEvent('error'));
    const datos = await promesa;
    expect(datos).toBeNull();
    expect(enlace.disponible).toBe(false);
  });

  it('envia el header X-Actor-Id cuando se pasa actor', async () => {
    const promesa = enlace.enviar('POST', '/api/proyectos', { nombre: 'X' }, 'u-admin');
    const req = httpMock.expectOne('http://localhost:8100/api/proyectos');
    expect(req.request.headers.get('X-Actor-Id')).toBe('u-admin');
    req.flush({ id: 'p9' });
    const datos = await promesa;
    expect(datos).toEqual({ id: 'p9' });
  });
});

describe('sincronizarStores', () => {
  let httpMock: HttpTestingController;
  let projectStore: ProjectStore;
  let usuarioStore: UsuarioStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    projectStore = TestBed.inject(ProjectStore);
    usuarioStore = TestBed.inject(UsuarioStore);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('carga las colecciones del backend en los stores', async () => {
    const promesa = TestBed.runInInjectionContext(() => sincronizarStores());
    for (const ruta of ['/api/usuarios', '/api/proyectos', '/api/etapas', '/api/entregables', '/api/bitacora']) {
      const req = httpMock.expectOne(`http://localhost:8100${ruta}`);
      req.flush([]);
    }
    await promesa;
    expect(projectStore.proyectos()).toEqual([]);
    expect(usuarioStore.usuarios()).toEqual([]);
  });

  it('conserva las semillas cuando el backend no responde', async () => {
    const promesa = TestBed.runInInjectionContext(() => sincronizarStores());
    for (const ruta of ['/api/usuarios', '/api/proyectos', '/api/etapas', '/api/entregables', '/api/bitacora']) {
      const req = httpMock.expectOne(`http://localhost:8100${ruta}`);
      req.error(new ProgressEvent('error'));
    }
    await promesa;
    expect(projectStore.proyectos().length).toBe(PROYECTOS_SEMILLA.length);
    expect(usuarioStore.usuarios().length).toBe(USUARIOS_SEMILLA.length);
  });
});
