/**
 * Tests de autenticacion (10.3, fase 14): login, restauracion de sesion y
 * adjuncion del Bearer token en ApiEnlaceService.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiEnlaceService } from './api-enlace';
import {
  AutenticacionService,
  ErrorAutenticacion,
  TokenAlmacen,
} from './autenticacion';
import { SESION_STORE } from './sesion.store';
import { Usuario } from '../domain/modelos';

const DIANA: Usuario = {
  id: 'u-admin',
  nombre: 'Diana Admin',
  correo: 'diana@projecthub.local',
  roles: ['Admin'],
  activo: true,
};

const LOGIN_URL = 'http://localhost:8100/api/auth/login';
const ME_URL = 'http://localhost:8100/api/auth/me';

describe('AutenticacionService', () => {
  let servicio: AutenticacionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(AutenticacionService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(TokenAlmacen).limpiar();
  });

  afterEach(() => {
    TestBed.inject(TokenAlmacen).limpiar();
    httpMock.verify();
  });

  it('login valido guarda el token y fija la sesion activa', async () => {
    const promesa = servicio.iniciarSesion('diana@projecthub.local', 'clave');
    const req = httpMock.expectOne(LOGIN_URL);
    req.flush({ token: 'jwt-de-diana', usuario: DIANA });
    const usuario = await promesa;
    expect(usuario.id).toBe('u-admin');
    expect(TestBed.inject(TokenAlmacen).leer()).toBe('jwt-de-diana');
    expect(servicio.sesionReal()).toBe(true);
    expect(TestBed.inject(SESION_STORE).usuarioActivo()?.id).toBe('u-admin');
  });

  it('login valida credenciales en el cuerpo de la peticion', async () => {
    const promesa = servicio.iniciarSesion('diana@projecthub.local', 'clave');
    const req = httpMock.expectOne(LOGIN_URL);
    expect(req.request.body).toEqual({
      correo: 'diana@projecthub.local',
      contrasena: 'clave',
    });
    req.flush({ token: 't', usuario: DIANA });
    await promesa;
  });

  it('credenciales invalidas (401) lanza ErrorAutenticacion con codigo', async () => {
    const promesa = servicio.iniciarSesion('diana@projecthub.local', 'mala');
    httpMock
      .expectOne(LOGIN_URL)
      .flush({ detail: { codigo: 'CREDENCIALES_INVALIDAS' } }, { status: 401, statusText: 'Unauthorized' });
    await expect(promesa).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
    });
    expect(servicio.sesionReal()).toBe(false);
  });

  it('usuario inactivo (403) lanza USUARIO_INACTIVO', async () => {
    const promesa = servicio.iniciarSesion('ivan@projecthub.local', 'clave');
    httpMock
      .expectOne(LOGIN_URL)
      .flush({ detail: { codigo: 'USUARIO_INACTIVO' } }, { status: 403, statusText: 'Forbidden' });
    await expect(promesa).rejects.toBeInstanceOf(ErrorAutenticacion);
    await promesa.catch((e) => expect(e.codigo).toBe('USUARIO_INACTIVO'));
  });

  it('backend caido lanza BACKEND_NO_DISPONIBLE sin tocar la sesion', async () => {
    const promesa = servicio.iniciarSesion('diana@projecthub.local', 'clave');
    httpMock.expectOne(LOGIN_URL).error(new ProgressEvent('error'));
    await promesa.catch((e) => expect(e.codigo).toBe('BACKEND_NO_DISPONIBLE'));
    expect(TestBed.inject(SESION_STORE).haySesion()).toBe(false);
  });

  it('restaurarSesion con token valido fija la sesion (F5)', async () => {
    TestBed.inject(TokenAlmacen).guardar('jwt-guardado');
    const promesa = servicio.restaurarSesion();
    const req = httpMock.expectOne(ME_URL);
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-guardado');
    req.flush(DIANA);
    const usuario = await promesa;
    expect(usuario?.id).toBe('u-admin');
    expect(TestBed.inject(SESION_STORE).haySesion()).toBe(true);
  });

  it('restaurarSesion con token rechazado limpia el token y devuelve null', async () => {
    TestBed.inject(TokenAlmacen).guardar('jwt-expirado');
    const promesa = servicio.restaurarSesion();
    httpMock.expectOne(ME_URL).flush({}, { status: 401, statusText: 'Unauthorized' });
    const usuario = await promesa;
    expect(usuario).toBeNull();
    expect(TestBed.inject(TokenAlmacen).leer()).toBeNull();
    expect(servicio.sesionReal()).toBe(false);
  });

  it('restaurarSesion sin token no llama al backend', async () => {
    const usuario = await servicio.restaurarSesion();
    expect(usuario).toBeNull();
    httpMock.expectNone(ME_URL);
  });

  it('cerrarSesion limpia token y sesion', async () => {
    TestBed.inject(TokenAlmacen).guardar('jwt-guardado');
    TestBed.inject(AutenticacionService);
    TestBed.inject(SESION_STORE).seleccionar('u-admin');
    servicio.cerrarSesion();
    expect(TestBed.inject(TokenAlmacen).leer()).toBeNull();
    expect(TestBed.inject(SESION_STORE).haySesion()).toBe(false);
    expect(servicio.sesionReal()).toBe(false);
  });

  // ----- Cambio de contrasena (14.5) -----

  const CONTRASENA_URL = 'http://localhost:8100/api/auth/contrasena';

  it('cambiarContrasena hace PUT con Bearer y cuerpo camelCase', async () => {
    TestBed.inject(TokenAlmacen).guardar('jwt-de-diana');
    const promesa = servicio.cambiarContrasena('actual-larga-1', 'nueva-larga-2');
    const req = httpMock.expectOne(CONTRASENA_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-de-diana');
    expect(req.request.body).toEqual({ contrasenaActual: 'actual-larga-1', contrasenaNueva: 'nueva-larga-2' });
    req.flush(null, { status: 200, statusText: 'OK' });
    await promesa;
  });

  it('cambiarContrasena sin sesion real lanza VALIDACION sin llamar al backend', async () => {
    const promesa = servicio.cambiarContrasena('actual-larga-1', 'nueva-larga-2');
    await expect(promesa).rejects.toMatchObject({ codigo: 'VALIDACION' });
    httpMock.expectNone(CONTRASENA_URL);
  });

  it('cambiarContrasena con 401 lanza CONTRASENA_ACTUAL_INVALIDA', async () => {
    TestBed.inject(TokenAlmacen).guardar('jwt-de-diana');
    const promesa = servicio.cambiarContrasena('mala', 'nueva-larga-2');
    httpMock
      .expectOne(CONTRASENA_URL)
      .flush({ detail: { codigo: 'CONTRASENA_ACTUAL_INVALIDA', mensaje: 'no' } }, { status: 401, statusText: 'Unauthorized' });
    await expect(promesa).rejects.toMatchObject({ codigo: 'CONTRASENA_ACTUAL_INVALIDA' });
  });

  it('cambiarContrasena con 422 lanza VALIDACION (politica)', async () => {
    TestBed.inject(TokenAlmacen).guardar('jwt-de-diana');
    const promesa = servicio.cambiarContrasena('actual-larga-1', 'corta');
    httpMock
      .expectOne(CONTRASENA_URL)
      .flush({ detail: { codigo: 'VALIDACION', mensaje: 'politica' } }, { status: 422, statusText: 'Unprocessable Entity' });
    await expect(promesa).rejects.toMatchObject({ codigo: 'VALIDACION' });
  });
});

describe('ApiEnlaceService con sesion real', () => {
  let enlace: ApiEnlaceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    enlace = TestBed.inject(ApiEnlaceService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(TokenAlmacen).guardar('jwt-de-sesion');
  });

  afterEach(() => {
    TestBed.inject(TokenAlmacen).limpiar();
    httpMock.verify();
  });

  it('GET adjunta Authorization Bearer', async () => {
    const promesa = enlace.lista('/api/usuarios');
    const req = httpMock.expectOne('http://localhost:8100/api/usuarios');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-de-sesion');
    req.flush([]);
    await promesa;
  });

  it('PUT de sincronizacion adjunta Bearer y X-Actor-Id', async () => {
    const promesa = enlace.enviar('PUT', '/api/sincronizacion', {}, 'u-admin');
    const req = httpMock.expectOne('http://localhost:8100/api/sincronizacion');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-de-sesion');
    expect(req.request.headers.get('X-Actor-Id')).toBe('u-admin');
    req.flush({});
    await promesa;
  });
});
