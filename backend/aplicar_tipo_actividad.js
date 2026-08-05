const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const RUTA = '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL -  CONSOLIDADO EJECUCION PLC 2025 OD-09.01.25.xlsx';
const RUTA_SALIDA = '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL - CORREGIDO (Tipo de Actividad).xlsx';

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
// Correcciones manuales confirmadas por el usuario (por Código ACT).
const OVERRIDES = {
  '2025PL700': 'PASANTÍA INTERNACIONAL',
};

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
  if (/\bINTERNACIONAL\b/.test(n)) return true;
  for (const pais of PAISES) {
    const re = new RegExp('\\b' + quitarTildes(pais).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(n)) return true;
  }
  return false;
}

(async () => {
  // 1) Calcular la clasificación final con XLSX (rápido de leer)
  const wbRead = XLSX.readFile(RUTA, { cellDates: true });
  const hojaRead = wbRead.Sheets['DATOS-ACTIVIDAD'];
  const filas = XLSX.utils.sheet_to_json(hojaRead, { header: 1, defval: '' });

  const resultado = new Map(); // fila (1-based) -> tipo final
  let total = 0, conOverride = 0;
  for (let i = 8; i < filas.length; i++) {
    const f = filas[i];
    if (!f[1]) continue;
    total++;
    const codigo = String(f[1]).trim();
    const nombre = String(f[7] || '').trim();
    let cat;
    if (OVERRIDES[codigo]) { cat = OVERRIDES[codigo]; conOverride++; }
    else {
      cat = clasificar(nombre);
      if (!cat) cat = esInternacional(nombre) ? 'PASANTÍA INTERNACIONAL' : 'CURSO';
      else if (cat === 'PASANTÍA' && esInternacional(nombre)) cat = 'PASANTÍA INTERNACIONAL';
    }
    resultado.set(i + 1, cat); // fila real de Excel (1-based)
  }
  console.log('Filas a escribir:', resultado.size, '(de', total, 'con codigo_act) | overrides aplicados:', conOverride);

  // 2) Abrir con ExcelJS (preserva formato/estilos) y escribir SOLO la columna I
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(RUTA);
  const hoja = wb.getWorksheet('DATOS-ACTIVIDAD');

  let escritas = 0;
  for (const [filaExcel, tipo] of resultado.entries()) {
    hoja.getCell(filaExcel, 9).value = tipo; // columna I = 9
    escritas++;
  }
  console.log('Celdas escritas:', escritas);

  await wb.xlsx.writeFile(RUTA_SALIDA);
  console.log('Archivo guardado en:', RUTA_SALIDA);
})();
