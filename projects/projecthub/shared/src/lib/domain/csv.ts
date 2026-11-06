/**
 * Exportacion a CSV (docs/funcionalidades.md 7.5). Puro, sin Angular ni DOM:
 * genera el contenido del archivo; la UI decide como descargarlo.
 * RFC 4180: separador coma, comillas dobles si el valor contiene separador,
 * comilla, salto de linea o espacios significativos.
 */

export interface FilaExportable {
  readonly [clave: string]: unknown;
}

/** Escapa un valor segun RFC 4180. */
function escapar(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  let texto: string;
  if (typeof valor === 'number') {
    texto = Number.isFinite(valor) ? String(valor) : '';
  } else if (typeof valor === 'boolean') {
    texto = valor ? 'true' : 'false';
  } else {
    texto = String(valor);
  }
  if (texto.includes('"') || texto.includes(',') || texto.includes('\n') || texto.includes('\r')) {
    texto = `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Serializa filas a CSV. La primera fila son los encabezados (en el orden de
 * `columnas` si se pasa, o el orden de las claves de la primera fila).
 * Usa CRLF como fin de linea (RFC 4180).
 */
export function serializarCsv(
  filas: readonly FilaExportable[],
  columnas?: readonly string[],
): string {
  if (filas.length === 0 && (!columnas || columnas.length === 0)) {
    return '';
  }
  const claves =
    columnas ??
    (filas.length > 0 ? Object.keys(filas[0] as FilaExportable) : []);
  const lineas: string[] = [claves.map(escapar).join(',')];
  for (const fila of filas) {
    lineas.push(claves.map((c) => escapar(fila[c])).join(','));
  }
  return lineas.join('\r\n') + '\r\n';
}

/** Dispara la descarga de un archivo de texto en el navegador. */
export function descargarArchivo(
  contenido: string,
  nombreArchivo: string,
  tipo: string,
): void {
  const blob = new Blob(['\ufeff' + contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const ancla = document.createElement('a');
  ancla.href = url;
  ancla.download = nombreArchivo;
  document.body.appendChild(ancla);
  ancla.click();
  document.body.removeChild(ancla);
  URL.revokeObjectURL(url);
}

/** Nombre de archivo con marca de tiempo: prefijo-YYYY-MM-DD-HHmm.csv */
export function nombreConFecha(prefijo: string, ahora: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
  const hora = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}`;
  return `${prefijo}-${fecha}-${hora}.csv`;
}
