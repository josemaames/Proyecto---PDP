const XLSX = require('xlsx');
const wb = XLSX.readFile('/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL -  CONSOLIDADO EJECUCION PLC 2025 OD-09.01.25.xlsx', { cellDates: true });
const hoja = wb.Sheets['DATOS-ACTIVIDAD'];
const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });

function quitarTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Orden = prioridad cuando el nombre contiene más de una palabra clave.
// Se busca la que aparece PRIMERO en el texto, no por orden de esta lista.
const CATEGORIAS = [
  'PASANTIA', 'CONGRESO', 'CONFERENCIA', 'SIMPOSIO', 'DIPLOMADO', 'SEMINARIO',
  'WEBINAR', 'TALLER', 'CURSO', 'JORNADA', 'FORO', 'ENTRENAMIENTO', 'PROGRAMA',
  'REUNION', 'ROTACION', 'ESTANCIA', 'VISITA', 'PRACTICA', 'CAPACITACION',
];

function clasificar(nombre) {
  const n = quitarTildes(nombre.toUpperCase());
  let mejor = null, mejorIdx = Infinity;
  for (const cat of CATEGORIAS) {
    const idx = n.indexOf(cat);
    if (idx !== -1 && idx < mejorIdx) {
      mejorIdx = idx;
      mejor = cat;
    }
  }
  return mejor;
}

let total = 0, clasificados = 0;
const sinClasificar = [];
const conteo = {};
for (let i = 8; i < filas.length; i++) {
  const f = filas[i];
  if (!f[1]) continue;
  total++;
  const nombre = String(f[7] || '').trim();
  const cat = clasificar(nombre);
  if (cat) {
    clasificados++;
    conteo[cat] = (conteo[cat] || 0) + 1;
  } else {
    sinClasificar.push({ fila: i + 1, codigo: f[1], nombre });
  }
}
console.log('total:', total, '| clasificados:', clasificados, '(' + Math.round(clasificados/total*100) + '%)', '| sin clasificar:', sinClasificar.length);
console.log('--- conteo por categoria ---');
console.log(JSON.stringify(conteo, null, 1));
console.log('--- primeras 40 sin clasificar ---');
sinClasificar.slice(0, 40).forEach(s => console.log(s.fila, s.codigo, '|', s.nombre));
