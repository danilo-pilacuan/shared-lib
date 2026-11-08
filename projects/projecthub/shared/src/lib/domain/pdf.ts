/**
 * Exportacion a PDF (docs/funcionalidades.md 7.5). Sin dependencias: genera
 * un documento HTML imprimible y el navegador lo guarda como PDF con su
 * dialogo nativo de impresion ("Guardar como PDF").
 */

export interface ColumnaPdf {
  readonly encabezado: string;
  readonly alineacion?: 'izq' | 'der';
}

export interface TablaPdf {
  readonly titulo: string;
  readonly columnas: readonly ColumnaPdf[];
  readonly filas: readonly (readonly string[])[];
  readonly pie?: readonly string[];
}

/** Escapa un valor para su uso seguro dentro del HTML del documento. */
function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function estilosDocumento(): string {
  return [
    'body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2933; margin: 24px; }',
    'h1 { font-size: 1.25rem; margin: 0 0 4px; }',
    '.meta { font-size: 0.8rem; color: #52606d; margin: 0 0 20px; }',
    'h2 { font-size: 1rem; margin: 24px 0 8px; }',
    'table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }',
    'th, td { border: 1px solid #cbd2d9; padding: 4px 8px; font-size: 0.78rem; }',
    'th { background: #f0f4f8; text-align: left; }',
    'td.der, th.der { text-align: right; }',
    'tfoot td { font-weight: 700; background: #f0f4f8; }',
  ].join('\n');
}

/**
 * Genera el HTML completo e imprimible del reporte: titulo, marca de tiempo
 * y una tabla por cada `TablaPdf` (con pie opcional de totales).
 */
export function generarHtmlPdf(
  titulo: string,
  tablas: readonly TablaPdf[],
  generado: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fecha = `${generado.getFullYear()}-${pad(generado.getMonth() + 1)}-${pad(generado.getDate())}`;
  const hora = `${pad(generado.getHours())}:${pad(generado.getMinutes())}`;
  const cuerpo = tablas
    .map((t) => {
      const columnas = t.columnas
        .map(
          (c) =>
            `<th${c.alineacion === 'der' ? ' class="der"' : ''}>${escaparHtml(c.encabezado)}</th>`,
        )
        .join('');
      const filas = t.filas
        .map((fila) => {
          const celdas = fila
            .map((valor, i) => {
              const der = t.columnas[i]?.alineacion === 'der';
              return `<td${der ? ' class="der"' : ''}>${escaparHtml(valor)}</td>`;
            })
            .join('');
          return `<tr>${celdas}</tr>`;
        })
        .join('');
      const pie = t.pie
        ? `<tfoot><tr>${t.pie
            .map((valor, i) => {
              const der = t.columnas[i]?.alineacion === 'der';
              return `<td${der ? ' class="der"' : ''}>${escaparHtml(valor)}</td>`;
            })
            .join('')}</tr></tfoot>`
        : '';
      return `<section><h2>${escaparHtml(t.titulo)}</h2><table><thead><tr>${columnas}</tr></thead><tbody>${filas}</tbody>${pie}</table></section>`;
    })
    .join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escaparHtml(titulo)}</title>`,
    `<style>${estilosDocumento()}</style>`,
    '</head>',
    '<body>',
    `<h1>${escaparHtml(titulo)}</h1>`,
    `<p class="meta">ProjectHub - generado el ${fecha} ${hora}</p>`,
    cuerpo,
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * Abre el documento generado en un iframe oculto y dispara el dialogo de
 * impresion del navegador, donde el usuario elige "Guardar como PDF".
 * El iframe se retira despues para no dejar nodos residuales.
 */
export function imprimirPdf(html: string, titulo: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', titulo);
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);
  const documento = iframe.contentDocument;
  if (!documento) {
    iframe.parentNode?.removeChild(iframe);
    return;
  }
  documento.open();
  documento.write(html);
  documento.close();
  const limpiar = () => {
    iframe.parentNode?.removeChild(iframe);
  };
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  window.setTimeout(limpiar, 30000);
}