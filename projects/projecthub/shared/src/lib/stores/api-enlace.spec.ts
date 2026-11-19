/**
 * Tests de la capa HTTP (docs/funcionalidades.md 13.3): ApiEnlaceService
 * (timeout y degradacion) y sincronizarStores (carga en stores o fallback
 * a semilla cuando el backend no responde).
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiEnlaceService, SONDEO_SALUD_MS, urlApiPorDefecto } from './api-enlace';
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
    const req = httpMock.expectOne(urlApiPorDefecto('/api/usuarios'));
    expect(req.request.method).toBe('GET');
    req.flush(USUARIOS_SEMILLA);
    const datos = await promesa;
    expect(datos).not.toBeNull();
    expect(datos!.length).toBe(USUARIOS_SEMILLA.length);
    expect(enlace.disponible).toBe(true);
  });

  it('devuelve null y marca caida cuando el backend no responde', async () => {
    const promesa = enlace.lista<Usuario>('/api/usuarios');
    const req = httpMock.expectOne(urlApiPorDefecto('/api/usuarios'));
    req.error(new ProgressEvent('error'));
    const datos = await promesa;
    expect(datos).toBeNull();
    expect(enlace.disponible).toBe(false);
  });

  it('un 4xx (sesion ausente, VULN-002) NO marca al backend caido', async () => {
    // Sin sesion (sin token) los GET de dominio responden 422
    // VALIDACION: la API esta viva y solo rechazo la peticion anonima.
    const promesa = enlace.lista<Usuario>('/api/usuarios');
    const req = httpMock.expectOne(urlApiPorDefecto('/api/usuarios'));
    req.flush({ codigo: 'VALIDACION', mensaje: 'Sesion requerida' }, { status: 422, statusText: 'Unprocessable Entity' });
    const datos = await promesa;
    expect(datos).toBeNull();
    expect(enlace.disponible).toBe(true);
    expect(enlace.estado()).toBe('disponible');
  });

  it('un 5xx si marca al backend caido', async () => {
    const promesa = enlace.lista<Usuario>('/api/usuarios');
    const req = httpMock.expectOne(urlApiPorDefecto('/api/usuarios'));
    req.flush({ codigo: 'ERROR_INTERNO' }, { status: 500, statusText: 'Internal Server Error' });
    const datos = await promesa;
    expect(datos).toBeNull();
    expect(enlace.disponible).toBe(false);
  });

  it('envia Authorization Bearer sin header de actor simulado', async () => {
    const promesa = enlace.enviar('POST', '/api/proyectos', { nombre: 'X' });
    const req = httpMock.expectOne(urlApiPorDefecto('/api/proyectos'));
    expect(req.request.headers.get('X-Actor-Id')).toBeNull();
    req.flush({ id: 'p9' });
    const datos = await promesa;
    expect(datos).toEqual({ id: 'p9' });
  });

  it('arranca en estado verificando y publica disponible tras sondeo exitoso', async () => {
    expect(enlace.estado()).toBe('verificando');
    const promesa = enlace.sondear();
    const req = httpMock.expectOne(urlApiPorDefecto('/api/salud'));
    req.flush({ estado: 'ok' });
    expect(await promesa).toBe(true);
    expect(enlace.estado()).toBe('disponible');
  });

  it('publica indisponible cuando el sondeo de salud falla', async () => {
    const promesa = enlace.sondear();
    const req = httpMock.expectOne(urlApiPorDefecto('/api/salud'));
    req.error(new ProgressEvent('error'));
    expect(await promesa).toBe(false);
    expect(enlace.estado()).toBe('indisponible');
  });

  it('sondear de nuevo con exito restaura el estado disponible', async () => {
    const caida = enlace.sondear();
    httpMock.expectOne(urlApiPorDefecto('/api/salud')).error(new ProgressEvent('error'));
    expect(await caida).toBe(false);
    const subida = enlace.sondear();
    httpMock.expectOne(urlApiPorDefecto('/api/salud')).flush({ estado: 'ok' });
    expect(await subida).toBe(true);
    expect(enlace.estado()).toBe('disponible');
  });

  it('iniciarSondeoSalud es idempotente (una sola suscripcion por app)', async () => {
    enlace.iniciarSondeoSalud();
    enlace.iniciarSondeoSalud();
    // Solo un sondeo inicial a pesar de dos llamadas.
    httpMock.expectOne(urlApiPorDefecto('/api/salud')).flush({ estado: 'ok' });
    // La continuation del sondeo corre en microtarea posterior al flush.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(enlace.estado()).toBe('disponible');
  });

  // Regresion (2026-11-17): iniciarSondeoSalud usaba setInterval DENTRO de
  // reprogramar sin limpiar el intervalo anterior: cada sondeo duplicaba el
  // numero de timers vivos y tras ~15 ciclos habia decenas de miles de XHR
  // a /api/salud (observado: 37.788 peticiones y GB de RAM en la pestana).
  it('iniciarSondeoSalud mantiene un solo sondeo activo (sin duplicar timers)', async () => {
    vi.useFakeTimers();
    try {
      const rutaSalud = urlApiPorDefecto('/api/salud');
      let totalSondeos = 0;
      // Consume (flush) todas las peticiones pendientes y las cuenta: cada
      // sondeo abre exactamente una; con el bug, el total crecia como 2^n.
      const drenar = (): void => {
        for (const peticion of httpMock.match(rutaSalud)) {
          peticion.flush({ estado: 'ok' });
          totalSondeos += 1;
        }
      };
      enlace.iniciarSondeoSalud(); // sondeo inmediato #1
      drenar();
      // 10 ciclos completos (15 s cada uno con backend disponible).
      for (let ciclo = 0; ciclo < 10; ciclo += 1) {
        await vi.advanceTimersByTimeAsync(SONDEO_SALUD_MS);
        drenar();
      }
      // Cada ciclo programa EXACTAMENTE un sondeo nuevo: 11 en total, no 2^10.
      expect(totalSondeos).toBe(11);
      expect(enlace.estado()).toBe('disponible');
    } finally {
      enlace.detenerSondeoSalud();
      vi.useRealTimers();
    }
  });

  it('detenerSondeoSalud cancela el sondeo programado', async () => {
    vi.useFakeTimers();
    try {
      enlace.iniciarSondeoSalud();
      httpMock.expectOne(urlApiPorDefecto('/api/salud')).flush({ estado: 'ok' });
      await vi.advanceTimersByTimeAsync(0);
      enlace.detenerSondeoSalud();
      // Sin timer vivo: a los 5 minutos no hay nuevas peticiones.
      await vi.advanceTimersByTimeAsync(300_000);
      expect(httpMock.match(urlApiPorDefecto('/api/salud')).length).toBe(0);
    } finally {
      enlace.detenerSondeoSalud();
      vi.useRealTimers();
    }
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
      const req = httpMock.expectOne(urlApiPorDefecto(ruta));
      req.flush([]);
    }
    await promesa;
    expect(projectStore.proyectos()).toEqual([]);
    expect(usuarioStore.usuarios()).toEqual([]);
  });

  it('conserva las semillas cuando el backend no responde', async () => {
    const promesa = TestBed.runInInjectionContext(() => sincronizarStores());
    for (const ruta of ['/api/usuarios', '/api/proyectos', '/api/etapas', '/api/entregables', '/api/bitacora']) {
      const req = httpMock.expectOne(urlApiPorDefecto(ruta));
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
      const req = httpMock.expectOne(urlApiPorDefecto(ruta));
      req.flush({ codigo: 'VALIDACION' }, { status: 422, statusText: 'Unprocessable Entity' });
    }
    await promesa;
    expect(projectStore.proyectos().length).toBe(PROYECTOS_SEMILLA.length);
    expect(usuarioStore.usuarios().length).toBe(USUARIOS_SEMILLA.length);
  });
});
