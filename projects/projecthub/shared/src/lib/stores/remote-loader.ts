/**
 * Cargador de modulos federados como abstraction de dominio
 * (docs/funcionalidades.md 8.5, 8.6; AGENTS.md "Fronteras entre apps").
 *
 * Las apps no importan el runtime de federacion directamente: cada app
 * (shell y remotes) provee REMOTE_MODULE_LOADER en su app.config con SU
 * propia instancia del runtime, que su bootstrap ya inicializo. Asi los
 * chunks expuestos dejan de arrastrar copias no inicializadas del runtime
 * (la causa raiz del hang del widget remote a remote) y dev y prod se
 * comportan igual.
 */
import { InjectionToken, inject } from '@angular/core';

/** Carga un modulo expuesto por un remote y devuelve sus exports. */
export type RemoteModuleLoader = (
  remoteName: string,
  exposedModule: string,
) => Promise<Record<string, unknown>>;

/** Token unico del cargador federado entre shell y remotes. */
export const REMOTE_MODULE_LOADER = new InjectionToken<RemoteModuleLoader>(
  'REMOTE_MODULE_LOADER',
  {
    providedIn: 'root',
    factory: () => {
      throw new Error(
        'REMOTE_MODULE_LOADER no provisto: cada app debe proveerlo en su app.config',
      );
    },
  },
);

/** Resuelve el cargador federado (instancia unica del inyector raiz). */
export function remoteModuleLoader(): RemoteModuleLoader {
  return inject(REMOTE_MODULE_LOADER, { optional: true }) ?? inject(REMOTE_MODULE_LOADER);
}
