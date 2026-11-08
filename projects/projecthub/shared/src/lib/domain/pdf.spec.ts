import { generarHtmlPdf } from './pdf';

describe('generarHtmlPdf', () => {
  const fija = new Date(2026, 10, 8, 9, 7);

  it('genera documento con titulo, meta y una tabla', () => {
    const html = generarHtmlPdf(
      'Tablero general',
      [
        {
          titulo: 'Proyectos por estado',
          columnas: [{ encabezado: 'Estado' }, { encabezado: 'Cantidad', alineacion: 'der' }],
          filas: [['Activo', '3']],
          pie: ['Total', '3'],
        },
      ],
      fija,
    );
    expect(html).toContain('<title>Tablero general</title>');
    expect(html).toContain('<h1>Tablero general</h1>');
    expect(html).toContain('generado el 2026-11-08 09:07');
    expect(html).toContain('<th>Estado</th>');
    expect(html).toContain('<th class="der">Cantidad</th>');
    expect(html).toContain('<td>Activo</td>');
    expect(html).toContain('<td class="der">3</td>');
    expect(html).toContain('<tfoot>');
  });

  it('escapa HTML peligroso en titulo, encabezados y celdas', () => {
    const html = generarHtmlPdf('Inyeccion <script>', [
      {
        titulo: 'a <b> & "c"',
        columnas: [{ encabezado: '<img>' }],
        filas: [['<script>alert(1)</script>']],
      },
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img&gt;');
    expect(html).toContain('&quot;c&quot;');
  });

  it('alinea a la derecha las columnas con alineacion der', () => {
    const html = generarHtmlPdf('t', [
      {
        titulo: 't',
        columnas: [{ encabezado: 'A' }, { encabezado: 'B', alineacion: 'der' }],
        filas: [
          ['1', '2'],
          ['3', '4'],
        ],
      },
    ]);
    expect(html.match(/<td class="der">/g)?.length).toBe(2);
    expect(html).toContain('<td>1</td>');
  });

  it('soporta multiples secciones de tabla', () => {
    const html = generarHtmlPdf('Reporte', [
      { titulo: 'S1', columnas: [{ encabezado: 'a' }], filas: [['1']] },
      { titulo: 'S2', columnas: [{ encabezado: 'b' }], filas: [['2']] },
    ]);
    expect(html.match(/<section>/g)?.length).toBe(2);
    expect(html).toContain('<h2>S1</h2>');
    expect(html).toContain('<h2>S2</h2>');
  });
});
