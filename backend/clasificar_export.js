const XLSX = require('xlsx');
const wb = XLSX.readFile('/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL -  CONSOLIDADO EJECUCION PLC 2025 OD-09.01.25.xlsx', { cellDates: true });
const hoja = wb.Sheets['DATOS-ACTIVIDAD'];
const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });

function quitarTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const CATEGORIAS = [
  ['PASANTIA', 'PASANTÍA'], ['PASATIA', 'PASANTÍA'], // typo confirmado
  ['CONGRESO', 'CONGRESO'], ['CONFERENCIA', 'CONFERENCIA'], ['SIMPOSIO', 'SIMPOSIO'],
  ['DIPLOMADO', 'DIPLOMADO'], ['SEMINARIO', 'SEMINARIO'], ['WEBINAR', 'WEBINAR'],
  ['TALLER', 'TALLER'], ['CURSO', 'CURSO'], ['JORNADA', 'JORNADA'], ['FORO', 'FORO'],
  ['ENTRENAMIENTO', 'ENTRENAMIENTO'], ['PROGRAMA', 'PROGRAMA'], ['REUNION', 'REUNIÓN'],
  ['ROTACION', 'ROTACIÓN'], ['ESTANCIA', 'ESTANCIA'], ['VISITA', 'VISITA'],
  ['PRACTICA', 'PRÁCTICA'], ['CAPACITACION', 'CAPACITACIÓN'],
];

function clasificar(nombre) {
  const n = quitarTildes(nombre.toUpperCase());
  let mejor = null, mejorIdx = Infinity;
  for (const [buscar, etiqueta] of CATEGORIAS) {
    const idx = n.indexOf(buscar);
    if (idx !== -1 && idx < mejorIdx) {
      mejorIdx = idx;
      mejor = etiqueta;
    }
  }
  return mejor;
}

const sinClasificar = [];
for (let i = 8; i < filas.length; i++) {
  const f = filas[i];
  if (!f[1]) continue;
  const nombre = String(f[7] || '').trim();
  const cat = clasificar(nombre);
  if (!cat) sinClasificar.push({ fila: i + 1, codigo: f[1], red: f[5], nombre });
}

console.log('sin clasificar:', sinClasificar.length);

// CSV para revisión
const lineas = ['Fila;Codigo ACT;Red;Nombre de la actividad'];
for (const s of sinClasificar) {
  const limpiar = (v) => String(v).replace(/;/g, ',').replace(/\r?\n/g, ' ').trim();
  lineas.push([s.fila, limpiar(s.codigo), limpiar(s.red), limpiar(s.nombre)].join(';'));
}
require('fs').writeFileSync('/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/tipo_actividad_sin_clasificar.csv', '﻿' + lineas.join('\n'), 'utf8');
console.log('CSV generado');
