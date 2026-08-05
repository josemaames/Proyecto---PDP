const XLSX = require('xlsx');
const wb = XLSX.readFile('/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL -  CONSOLIDADO EJECUCION PLC 2025 OD-09.01.25.xlsx', { cellDates: true });
const hoja = wb.Sheets['DATOS-ACTIVIDAD'];
const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });

function quitarTildes(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

const CATEGORIAS = [
  ['PASANTIA', 'PASANTÍA'], ['PASATIA', 'PASANTÍA'],
  ['CONGRESO', 'CONGRESO'], ['CONFERENCIA', 'CONFERENCIA'], ['SIMPOSIO', 'SIMPOSIO'],
  ['DIPLOMADO', 'DIPLOMADO'], ['SEMINARIO', 'SEMINARIO'], ['WEBINAR', 'WEBINAR'],
  ['TALLER', 'TALLER'], ['CURSO', 'CURSO'], ['JORNADA', 'JORNADA'], ['FORO', 'FORO'],
  ['ENTRENAMIENTO', 'ENTRENAMIENTO'], ['PROGRAMA', 'PROGRAMA'], ['REUNION', 'REUNIÓN'],
  ['ROTACION', 'ROTACIÓN'], ['ESTANCIA', 'ESTANCIA'], ['VISITA', 'VISITA'],
  ['PRACTICA', 'PRÁCTICA'], ['CAPACITACION', 'CAPACITACIÓN'],
];
const PAISES = [
  'ESTADOS UNIDOS', 'EE.UU', 'EEUU', 'ARGENTINA', 'CHILE', 'COLOMBIA', 'URUGUAY',
  'BRASIL', 'BRAZIL', 'MEXICO', 'ESPAÑA', 'PARAGUAY', 'BOLIVIA', 'ECUADOR',
  'VENEZUELA', 'PANAMA', 'CUBA', 'COSTA RICA', 'GUATEMALA', 'HONDURAS',
  'EL SALVADOR', 'NICARAGUA', 'REPUBLICA DOMINICANA', 'PUERTO RICO', 'CANADA',
  'FRANCIA', 'ALEMANIA', 'ITALIA', 'PORTUGAL', 'INGLATERRA', 'REINO UNIDO',
  'SUIZA', 'HOLANDA', 'PAISES BAJOS', 'BELGICA', 'SUECIA', 'NORUEGA',
  'DINAMARCA', 'AUSTRIA', 'RUSIA', 'CHINA', 'JAPON', 'COREA', 'INDIA',
  'ISRAEL', 'TURQUIA', 'SINGAPUR', 'SINGAPURE', 'AUSTRALIA', 'NUEVA ZELANDA',
  'SUDAFRICA', 'EGIPTO', 'MARRUECOS', 'MIAMI', 'BARCELONA',
];
function clasificar(nombre) {
  const n = quitarTildes(nombre.toUpperCase());
  let mejor = null, mejorIdx = Infinity;
  for (const [buscar, etiqueta] of CATEGORIAS) {
    const idx = n.indexOf(buscar);
    if (idx !== -1 && idx < mejorIdx) { mejorIdx = idx; mejor = etiqueta; }
  }
  return mejor;
}
function esInternacional(nombre) {
  const n = quitarTildes(nombre.toUpperCase());
  if (/\bINTERNACIONAL\b/.test(n)) return 'palabra INTERNACIONAL';
  for (const pais of PAISES) {
    const re = new RegExp('\\b' + quitarTildes(pais).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(n)) return 'pais:' + pais;
  }
  return null;
}
function contienePaisExtranjero(nombre) {
  const n = quitarTildes(nombre.toUpperCase());
  for (const pais of PAISES) {
    const re = new RegExp('\\b' + quitarTildes(pais).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(n)) return pais;
  }
  return null;
}

const conteo = {};
let total = 0;
const detallePasantias = [];
for (let i = 8; i < filas.length; i++) {
  const f = filas[i];
  if (!f[1]) continue;
  total++;
  const nombre = String(f[7] || '').trim();
  let cat = clasificar(nombre);
  if (!cat) {
    const pais = contienePaisExtranjero(nombre);
    cat = pais ? 'PASANTÍA INTERNACIONAL' : 'CURSO';
  } else if (cat === 'PASANTÍA') {
    const motivo = esInternacional(nombre);
    if (motivo) { cat = 'PASANTÍA INTERNACIONAL'; detallePasantias.push({ fila: i+1, codigo: f[1], nombre, motivo }); }
    else detallePasantias.push({ fila: i+1, codigo: f[1], nombre, motivo: 'nacional' });
  }
  conteo[cat] = (conteo[cat] || 0) + 1;
}
console.log('TOTAL FILAS:', total);
console.log('--- conteo final por tipo ---');
const ordenado = Object.entries(conteo).sort((a,b) => b[1]-a[1]);
let suma = 0;
for (const [k,v] of ordenado) { console.log(k.padEnd(24), v); suma += v; }
console.log('SUMA:', suma);

const lineas = ['Fila;Codigo ACT;Clasificacion;Motivo;Nombre de la actividad'];
for (const p of detallePasantias) {
  const limpiar = (v) => String(v).replace(/;/g, ',').replace(/\r?\n/g, ' ').trim();
  const clas = p.motivo === 'nacional' ? 'PASANTÍA' : 'PASANTÍA INTERNACIONAL';
  lineas.push([p.fila, limpiar(p.codigo), clas, limpiar(p.motivo), limpiar(p.nombre)].join(';'));
}
require('fs').writeFileSync('/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/pasantias_verificacion.csv', '﻿' + lineas.join('\n'), 'utf8');
console.log('CSV de pasantias generado, filas:', detallePasantias.length);
