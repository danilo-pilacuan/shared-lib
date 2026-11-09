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

  it('un 4xx (sesion ausente, VULN-002) NO marca al backend caido', async () => {
    // Sin sesion (sin token) los GET de dominio responden 422
    // VALIDACION: la API esta viva y solo rechazo la peticion anonima.
    const promesa = enlace.lista<Usuario>('/api/usuarios');
    const req = httpMock.expectOne('http://localhost:8100/api/usuarios');
    req.flush({ codigo: 'VALIDACION', mensaje: 'Sesion requerida' }, { status: 422, statusText: 'Unprocessable Entity' });
    const datos = await promesa;
    expect(datos).toBeNull();
    expect(enlace.disponible).toBe(true);
    expect(enlace.estado()).toBe('disponible');
  });

  it('un 5xx si marca al backend caido', async () => {
    const promesa = enlace.lista<Usuario>('/api/usuarios');
    const req = httpMock.expectOne('http://localhost:8100/api/usuarios');
    req.flush({ codigo: 'ERROR_INTERNO' }, { status: 500, statusText: 'Internal Server Error' });
    const datos = await promesa;
    expect(datos).toBeNull();
    expect(enlace.disponible).toBe(false);
  });

  it('envia Authorization Bearer sin header de actor simulado', async () => {
    const promesa = enlace.enviar('POST', '/api/proyectos', { nombre: 'X' });
    const req = httpMock.expectOne('http://localhost:8100/api/proyectos');
    expect(req.request.headers.get('X-Actor-Id')).toBeNull();
    req.flush({ id: 'p9' });
    const datos = await promesa;
    expect(datos).toEqual({ id: 'p9' });
  });

  it('arranca en estado verificando y publica disponible tras sondeo exitoso', async () => {
    expect(enlace.estado()).toBe('verificando');
    const promesa = enlace.sondear();
    const req = httpMock.expectOne('http://localhost:8100/api/salud');
    req.flush({ estado: 'ok' });
    expect(await promesa).toBe(true);
    expect(enlace.estado()).toBe('disponible');
  });

  it('publica indisponible cuando el sondeo de salud falla', async () => {
    const promesa = enlace.sondear();
    const req = httpMock.expectOne('http://localhost:8100/api/salud');
    req.error(new ProgressEvent('error'));
    expect(await promesa).toBe(false);
    expect(enlace.estado()).toBe('indisponible');
  });

  it('sondear de nuevo con exito restaura el estado disponible', async () => {
    const caida = enlace.sondear();
    httpMock.expectOne('http://localhost:8100/api/salud').error(new ProgressEvent('error'));
    expect(await caida).toBe(false);
    const subida = enlace.sondear();
    httpMock.expectOne('http://localhost:8100/api/salud').flush({ estado: 'ok' });
    expect(await subida).toBe(true);
    expect(enlace.estado()).toBe('disponible');
  });

  it('iniciarSondeoSalud es idempotente (una sola suscripcion por app)', async () => {
    enlace.iniciarSondeoSalud();
    enlace.iniciarSondeoSalud();
    // Solo un sondeo inicial a pesar de dos llamadas.
    httpMock.expectOne('http://localhost:8100/api/salud').flush({ estado: 'ok' });
    // La continuation del sondeo corre en microtarea posterior al flush.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(enlace.estado()).toBe('disponible');
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

  it('conserva las semillas cuando la API rechaza la peticion anonima (422)', async () => {
    // Sin sesion: los GET de dominio exigen actor (VULN-002) y
    // responden 422; el fallback a semilla es el comportamiento esperado.
    const promesa = TestBed.runInInjectionContext(() => sincronizarStores());
    for (const ruta of ['/api/usuarios', '/api/proyectos', '/api/etapas', '/api/entregables', '/api/bitacora']) {
      const req = httpMock.expectOne(`http://localhost:8100${ruta}`);
      req.flush({ codigo: 'VALIDACION' }, { status: 422, statusText: 'Unprocessable Entity' });
    }
    await promesa;
    expect(projectStore.proyectos().length).toBe(PROYECTOS_SEMILLA.length);
    expect(usuarioStore.usuarios().length).toBe(USUARIOS_SEMILLA.length);
  });
});
