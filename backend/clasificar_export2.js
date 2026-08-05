const XLSX = require('xlsx');
const wb = XLSX.readFile('/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL -  CONSOLIDADO EJECUCION PLC 2025 OD-09.01.25.xlsx', { cellDates: true });
const hoja = wb.Sheets['DATOS-ACTIVIDAD'];
const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });

function quitarTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const CATEGORIAS = [
  ['PASANTIA', 'PASANTÍA'], ['PASATIA', 'PASANTÍA'],
  ['CONGRESO', 'CONGRESO'], ['CONFERENCIA', 'CONFERENCIA'], ['SIMPOSIO', 'SIMPOSIO'],
  ['DIPLOMADO', 'DIPLOMADO'], ['SEMINARIO', 'SEMINARIO'], ['WEBINAR', 'WEBINAR'],
  ['TALLER', 'TALLER'], ['CURSO', 'CURSO'], ['JORNADA', 'JORNADA'], ['FORO', 'FORO'],
  ['ENTRENAMIENTO', 'ENTRENAMIENTO'], ['PROGRAMA', 'PROGRAMA'], ['REUNION', 'REUNIÓN'],
  ['ROTACION', 'ROTACIÓN'], ['ESTANCIA', 'ESTANCIA'], ['VISITA', 'VISITA'],
  ['PRACTICA', 'PRÁCTICA'], ['CAPACITACION', 'CAPACITACIÓN'],
];

// Países extranjeros (se excluye PERÚ a propósito: es el país sede, no cuenta como "internacional").
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

function contienePaisExtranjero(nombre) {
  const n = quitarTildes(nombre.toUpperCase());
  for (const pais of PAISES) {
    const re = new RegExp('\\b' + quitarTildes(pais).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(n)) return pais;
  }
  return null;
}

const resultado = [];
for (let i = 8; i < filas.length; i++) {
  const f = filas[i];
  if (!f[1]) continue;
  const nombre = String(f[7] || '').trim();
  let cat = clasificar(nombre);
  let origen = 'palabra_clave';
  if (!cat) {
    const pais = contienePaisExtranjero(nombre);
    if (pais) { cat = 'PASANTÍA INTERNACIONAL'; origen = 'pais:' + pais; }
    else { cat = 'CURSO'; origen = 'default'; }
  }
  resultado.push({ fila: i + 1, codigo: f[1], nombre, cat, origen });
}

const nuevos = resultado.filter(r => r.origen !== 'palabra_clave');
const porPais = nuevos.filter(r => r.origen.startsWith('pais:'));
const porDefault = nuevos.filter(r => r.origen === 'default');
console.log('total filas:', resultado.length);
console.log('ya clasificadas por palabra clave (sin cambio):', resultado.length - nuevos.length);
console.log('nuevas por pais extranjero -> Pasantía Internacional:', porPais.length);
console.log('nuevas por default -> Curso:', porDefault.length);

const lineas = ['Fila;Codigo ACT;Tipo asignado;Motivo;Nombre de la actividad'];
for (const r of nuevos) {
  const limpiar = (v) => String(v).replace(/;/g, ',').replace(/\r?\n/g, ' ').trim();
  lineas.push([r.fila, limpiar(r.codigo), limpiar(r.cat), limpiar(r.origen), limpiar(r.nombre)].join(';'));
}
require('fs').writeFileSync('/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/tipo_actividad_verificacion.csv', '﻿' + lineas.join('\n'), 'utf8');
console.log('CSV de verificacion generado');
