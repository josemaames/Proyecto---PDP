const XLSX = require('xlsx');

const RUTA = '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL - CORREGIDO (Tipo de Actividad).xlsx';

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

// Decisiones puntuales del usuario para las filas que quedaron en REVISAR,
// identificadas por Código ACT.
const DECISIONES_USUARIO = {
  '2025PL694': 'Congreso',                                    // 45ª Reunión Anual... Trasplante Corazón y Pulmón
  '2025PL310': 'Capacitación Interinstitucional',              // CAPACITACIÓN DE SISTEMAS... ESSI
  '2025PL759': 'Pasantía',                                     // ENTRENAMIENTO EN CIRUGÍA GÁSTRICA - CHINA
  '2025PL382': 'Curso, Taller o Curso-Taller',                 // NORMATIVIDAD BUENAS PRACTICAS OFICINA FARMACEUTICA
  '2025PL408': 'Curso, Taller o Curso-Taller',                 // Practicas Seguras de Calidad
  '2025PL420': 'Curso, Taller o Curso-Taller',                 // BUENAS PRACTICAS DE ALMACENAMIENTO
  '2025PL504': 'Curso, Taller o Curso-Taller',                 // Curso Taller Metodología riesgos Tarapoto
  '2025PL533': 'Curso, Taller o Curso-Taller',                 // Bioseguridad Prevención IAAS
  '2025PL197': 'Diplomado o Programa de Especialización',      // PROGRAMA ESPECIALIZADO EN CORNEA IPO PIURA
  '2025PL521': 'Curso, Taller o Curso-Taller',                 // BUENAS PRACTICAS OFICINA FARMACEUTICA. SERVICIO FARMACIA
  '2025PL636': 'Pasantía',                                     // ESTANCIA FORMATIVA CIRUGÍA TORÁCICA - ESPAÑA
  '2025PL076': 'Diplomado o Programa de Especialización',      // GESTIÓN DE RIESGO EN LA ATENCIÓN DE SALUD
  '2025PL403': 'Curso, Taller o Curso-Taller',                 // seguridad transfusional Hemorragias Masivas
  '2025PL285': 'Diplomado o Programa de Especialización',      // CAPACITACION INTEGRAL EN CUIDADOS CRITICOS
  '2025PL322': 'Pasantía',                                     // ENDOSCOPÍA TERAPÉUTICA AVANZADA JAPON
  '2025PL511': 'Curso, Taller o Curso-Taller',                 // Visita domiciliaria con enfoque integral
  '2025PL549': 'Curso, Taller o Curso-Taller',                 // CERTIFICACIÓN OPERADORES APILADOR ELÉCTRICO
  '2025PL821': 'Congreso',                                     // XVII JORNADA INTERNACIONAL DE ORL
  '2025PL840': 'Pasantía',                                     // ROTACION CLINICA... UNIVERSIDAD DE WASHINGTON
  '2025PL198': 'Diplomado o Programa de Especialización',      // PROGRAMA CIRUGIA SEGMENTO OCULAR ANTERIOR IPO PIURA
  '2025PL170': 'Curso, Taller o Curso-Taller',                 // ENTRENAMIENTO HABILIDADES EN LAPAROSCOPIA
  '2025PL637': 'Curso, Taller o Curso-Taller',                 // MANIPULACION DE ALIMENTOS Y ATENCION HOSPITALARIA
  '2025PL836': 'Pasantía',                                     // ESTANCIA FORMATIVA MEDICINA DIGESTIVA - ESPAÑA
  '2025PL666': 'Curso, Taller o Curso-Taller',                 // BUENAS PRACTICAS FASE PRE ANALITICA PATOLOGIA
  '2025PL220': 'Curso, Taller o Curso-Taller',                 // EXPERIENCIAS Y BUENAS PRACTICAS DE APS
  '2025PL570': 'Curso, Taller o Curso-Taller',                 // PRACTICAS SEGURAS - NEUMOLOGICAS Y CIRUGIA DE TORAX
  '2025PL766': 'Congreso',                                     // II JORNADA DE PROTECCION Y SEGURIDAD RADIOLOGICA
  '2025PL516': 'Curso, Taller o Curso-Taller',                 // Rondas de seguridad del paciente
};

const AMBIGUOS = ['PROGRAMA', 'PRÁCTICA', 'ESTANCIA', 'ENTRENAMIENTO', 'JORNADA', 'ROTACIÓN', 'REUNIÓN', 'VISITA', 'CAPACITACIÓN'];

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
  if (DECISIONES_USUARIO[codigo]) {
    propuesto = DECISIONES_USUARIO[codigo];
    nota = 'Decisión manual del usuario';
  } else if (MAPEO_DIRECTO[tipoActual]) {
    propuesto = MAPEO_DIRECTO[tipoActual];
  } else if (AMBIGUOS.includes(tipoActual)) {
    propuesto = 'REVISAR';
    nota = `Aún sin decisión (tipo actual: ${tipoActual})`;
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
const RUTA_SALIDA = '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/Propuesta Tipos Oficiales v2.xlsx';
XLSX.writeFile(wbOut, RUTA_SALIDA);

console.log('Total filas:', filasSalida.length - 1);
console.log('Conteo por tipo propuesto:');
for (const [k, v] of Object.entries(contadores).sort((a, b) => b[1] - a[1])) console.log(' ', k, '->', v);
console.log('\nFilas aún en REVISAR:');
filasSalida.slice(1).filter(r => r[4] === 'REVISAR').forEach(r => console.log(' ', r[1], '|', r[2], '|', r[3]));
console.log('\nArchivo:', RUTA_SALIDA);
