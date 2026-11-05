/**
 * Errores de dominio tipados con mensaje en espanol (docs/funcionalidades.md 9.3).
 * La capa de dominio no lanza errores de framework: solo estos tipos.
 */

/** Codigo estable del error; la UI puede mapearlo a mensajes o estilos. */
export type CodigoErrorDominio =
  | 'TRANSICION_INVALIDA'
  | 'PERMISO_DENEGADO'
  | 'VALIDACION'
  | 'ESTADO_PROYECTO'
  | 'ENTIDAD_NO_ENCONTRADA'
  | 'DUPLICADO';

export class ErrorDominio extends Error {
  readonly codigo: CodigoErrorDominio;

  constructor(codigo: CodigoErrorDominio, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
  }
}

/** Transicion fuera del grafo del ciclo de vida (3.2, 3.3). */
export class ErrorTransicionInvalida extends ErrorDominio {
  constructor(origen: string, destino: string) {
    super(
      'TRANSICION_INVALIDA',
      `Transicion invalida: no se puede pasar de "${origen}" a "${destino}".`,
    );
    this.name = 'ErrorTransicionInvalida';
  }
}

/** Accion no permitida para el rol en la etapa actual (1.5, 1.7). */
export class ErrorPermisoDenegado extends ErrorDominio {
  constructor(accion: string, etapa: string, roles: readonly string[]) {
    super(
      'PERMISO_DENEGADO',
      `Permiso denegado: la accion "${accion}" en la etapa "${etapa}" requiere uno de estos roles: ${roles.join(', ')}.`,
    );
    this.name = 'ErrorPermisoDenegado';
  }
}

/** Validacion de datos de entrada (4.5 y similares). */
export class ErrorValidacion extends ErrorDominio {
  constructor(mensaje: string) {
    super('VALIDACION', mensaje);
    this.name = 'ErrorValidacion';
  }
}

/** Operacion bloqueada por el estado del proyecto (2.6, 2.7, 3.4). */
export class ErrorEstadoProyecto extends ErrorDominio {
  constructor(mensaje: string) {
    super('ESTADO_PROYECTO', mensaje);
    this.name = 'ErrorEstadoProyecto';
  }
}

/** Referencia a una entidad inexistente. */
export class ErrorEntidadNoEncontrada extends ErrorDominio {
  constructor(entidad: string, id: string) {
    super('ENTIDAD_NO_ENCONTRADA', `${entidad} con id "${id}" no existe.`);
    this.name = 'ErrorEntidadNoEncontrada';
  }
}

/** Unicidad violada (nombre de proyecto, correo de usuario). */
export class ErrorDuplicado extends ErrorDominio {
  constructor(entidad: string, campo: string, valor: string) {
    super(
      'DUPLICADO',
      `Ya existe ${entidad} con ${campo} "${valor}".`,
    );
    this.name = 'ErrorDuplicado';
  }
}
