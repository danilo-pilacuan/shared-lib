import { describe, expect, it } from 'vitest';
import { nombreConFecha, serializarCsv } from './csv';

describe('serializarCsv', () => {
  it('emite encabezados y filas con CRLF (RFC 4180)', () => {
    const csv = serializarCsv([
      { nombre: 'Portal', avance: 42.39 },
      { nombre: 'Gestion', avance: 0 },
    ]);
    expect(csv).toBe('nombre,avance\r\nPortal,42.39\r\nGestion,0\r\n');
  });

  it('respeta el orden de columnas indicado', () => {
    const csv = serializarCsv([{ a: 1, b: 2, c: 3 }], ['c', 'a']);
    expect(csv).toBe('c,a\r\n3,1\r\n');
  });

  it('escapa valores con separador, comillas y saltos de linea', () => {
    const csv = serializarCsv([{ nombre: 'Proyecto, "especial"\nsegunda linea' }]);
    expect(csv).toBe(
      'nombre\r\n"Proyecto, ""especial""\nsegunda linea"\r\n',
    );
  });

  it('serializa null, undefined y booleanos', () => {
    const csv = serializarCsv([
      { a: null, b: undefined, c: true, d: false },
    ]);
    expect(csv).toBe('a,b,c,d\r\n,,true,false\r\n');
  });

  it('no emite NaN ni Infinity (cadena vacia)', () => {
    const csv = serializarCsv([{ a: Number.NaN, b: Number.POSITIVE_INFINITY, c: 5 }]);
    expect(csv).toBe('a,b,c\r\n,,5\r\n');
  });

  it('usa las claves de la primera fila si no hay columnas', () => {
    const csv = serializarCsv([{ x: 1, y: 2 }]);
    expect(csv).toBe('x,y\r\n1,2\r\n');
  });

  it('devuelve cadena vacia sin filas ni columnas', () => {
    expect(serializarCsv([])).toBe('');
  });

  it('emite solo encabezados si hay columnas pero no filas', () => {
    expect(serializarCsv([], ['a', 'b'])).toBe('a,b\r\n');
  });
});

describe('nombreConFecha', () => {
  it('formatea prefijo-YYYY-MM-DD-HHmm.csv', () => {
    const nombre = nombreConFecha('proyectos', new Date(2026, 10, 5, 9, 7));
    expect(nombre).toBe('proyectos-2026-11-05-0907.csv');
  });
});
