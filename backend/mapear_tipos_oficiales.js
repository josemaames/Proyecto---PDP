const XLSX = require('xlsx');

const RUTA = '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL - CORREGIDO (Tipo de Actividad).xlsx';

// Mapeo directo tipo actual (17) -> grupo oficial (6), donde es inequívoco.
const MAPEO_DIRECTO = {
  'CURSO': 'Curso, Taller o Curso-Taller',
  'TALLER': 'Curso, Taller o Curso-Taller',
  'DIPLOMADO': 'Diplomado o Programa de Especialización',
  'CONGRESO': 'Congreso',
  'PASANTÍA': 'Pasantía',
  'PASANTÍA INTERNACIONAL': 'Pasantía',
  'CONFERENCIA': 'Conferencia (seminarios, simposios), entre otros',
  'SIMPOSIO': 'Conferencia (seminarios, simposios), entre otros',
  'SEMINARIO': 'Conferencia (seminarios, simposios), entre otros',
};

// Tipos actuales sin equivalencia clara en los 6 grupos oficiales -> quedan para revisar.
const AMBIGUOS = ['PROGRAMA', 'PRÁCTICA', 'ESTANCIA', 'ENTRENAMIENTO', 'JORNADA', 'ROTACIÓN', 'REUNIÓN', 'VISITA', 'CAPACITACIÓN'];

// Palabras que sugieren posible "Capacitación Interinstitucional"
const PISTAS_INTERINSTITUCIONAL = ['INTERINSTITUCIONAL', 'CONVENIO', 'ALIANZA', 'MINISTERIO', 'UNIVERSIDAD', 'COLEGIO', 'MINSA', 'SUSALUD', 'ESSALUD', 'MUNICIPALIDAD', 'INSTITUTO'];

function quitarTildes(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

const wb = XLSX.readFile(RUTA, { cellDates: true });
const hoja = wb.Sheets['DATOS-ACTIVIDAD'];
const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });

const filasSalida = [['N', 'Codigo', 'Nombre Actividad', 'Tipo Actual', 'Tipo Propuesto', 'Nota']];
let contadores = {};

for (let i = 8; i < filas.length; i++) {
  const f = filas[i];
  if (!f[1]) continue;
  const codigo = String(f[1]).trim();
  const nombre = String(f[7] || '').trim();
  const tipoActual = String(f[8] || '').trim();

  let propuesto, nota = '';
  if (MAPEO_DIRECTO[tipoActual]) {
    propuesto = MAPEO_DIRECTO[tipoActual];
    if (tipoActual === 'PASANTÍA INTERNACIONAL') nota = 'Se fusiona con Pasantía nacional (el grupo oficial no distingue).';
  } else if (AMBIGUOS.includes(tipoActual)) {
    const n = quitarTildes(nombre.toUpperCase());
    const pistaInter = PISTAS_INTERINSTITUCIONAL.some(p => n.includes(quitarTildes(p)));
    propuesto = 'REVISAR';
    nota = pistaInter
      ? `Posible Capacitación Interinstitucional (tipo actual: ${tipoActual})`
      : `Sin equivalencia clara en los 6 grupos oficiales (tipo actual: ${tipoActual})`;
  } else {
    propuesto = 'REVISAR';
    nota = `Tipo actual desconocido: ${tipoActual}`;
  }

  contadores[propuesto] = (contadores[propuesto] || 0) + 1;
  filasSalida.push([f[0], codigo, nombre, tipoActual, propuesto, nota]);
}

const wsOut = XLSX.utils.aoa_to_sheet(filasSalida);
const wbOut = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbOut, wsOut, 'Propuesta');
const RUTA_SALIDA = '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/Propuesta Tipos Oficiales.xlsx';
XLSX.writeFile(wbOut, RUTA_SALIDA);

console.log('Total filas:', filasSalida.length - 1);
console.log('Conteo por tipo propuesto:');
for (const [k, v] of Object.entries(contadores).sort((a, b) => b[1] - a[1])) console.log(' ', k, '->', v);
console.log('Archivo generado:', RUTA_SALIDA);
