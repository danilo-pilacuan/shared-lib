/**
 * Sincronizacion stores <-> backend (docs/funcionalidades.md 13.3).
 * Al arrancar (providers APP_INIT) descarga las colecciones del backend
 * FastAPI y las carga en ProjectStore/UsuarioStore. Si la API no responde,
 * los stores conservan sus semillas y la app funciona igual (degradacion
 * elegante). Debe llamarse dentro de un contexto de inyeccion (p. ej. una
 * factory de provider o TestBed.runInInjectionContext).
 */
import { inject } from '@angular/core';
import { BitacoraEntrada, Entregable, EtapaTrabajo, Proyecto, Usuario } from '../domain/modelos';
import { ApiEnlaceService } from './api-enlace';
import { ProjectStore } from './project.store';
import { UsuarioStore } from './usuario.store';

/** Estado completo del dominio tal como lo intercambian cliente y backend. */
export interface EstadoSincronizacion {
  readonly usuarios: readonly Usuario[];
  readonly proyectos: readonly Proyecto[];
  readonly etapas: readonly EtapaTrabajo[];
  readonly entregables: readonly Entregable[];
  readonly bitacora: readonly BitacoraEntrada[];
}

/** Carga las colecciones del backend en los stores; no lanza si falla. */
export async function sincronizarStores(): Promise<void> {
  const enlace = inject(ApiEnlaceService);
  const projectStore = inject(ProjectStore);
  const usuarioStore = inject(UsuarioStore);

  const [usuarios, proyectos, etapas, entregables, bitacora] = await Promise.all([
    enlace.lista<Usuario>('/api/usuarios'),
    enlace.lista<Proyecto>('/api/proyectos'),
    enlace.lista<EtapaTrabajo>('/api/etapas'),
    enlace.lista<Entregable>('/api/entregables'),
    enlace.lista<BitacoraEntrada>('/api/bitacora'),
  ]);

  if (usuarios !== null) usuarioStore.cargarDesdeBackend(usuarios);
  if (proyectos !== null) {
    projectStore.cargarDesdeBackend({
      proyectos,
      etapas: etapas ?? [],
      entregables: entregables ?? [],
      bitacora: bitacora ?? [],
      usuarios: usuarios ?? [],
    });
  }
}
