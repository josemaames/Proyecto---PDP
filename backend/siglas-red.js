// Siglas oficiales por red asistencial/prestacional, usadas para armar el
// código de actividad autogenerado: {año}{PL|AC}{sigla}{secuencial 4 dígitos}.
// Lista provista directamente por el usuario (no es derivable automáticamente
// del nombre de la red porque varias comparten letras iniciales).
const SIGLAS_RED = {
  CNSR: 'CNSR',
  INCOR: 'INCOR',
  'RA AMAZONAS': 'RAAMA',
  'RA ANCASH': 'RAANC',
  'RA APURIMAC': 'RAAPU',
  'RA AREQUIPA': 'RAARE',
  'RA AYACUCHO': 'RAAYA',
  'RA CAJAMARCA': 'RACAJ',
  'RA CUSCO': 'RACUS',
  'RA HUANCAVELICA': 'RAHVC',
  'RA HUANUCO': 'RAHUA',
  'RA HUARAZ': 'RAHUZ',
  'RA ICA': 'RAICA',
  'RA JAEN': 'RAJAE',
  'RA JULIACA': 'RAJUL',
  'RA JUNIN': 'RAJUN',
  'RA LA LIBERTAD': 'RALLI',
  'RA LORETO': 'RALOR',
  'RA MADRE DE DIOS': 'RAMDD',
  'RA MOQUEGUA': 'RAMOQ',
  'RA MOYOBAMBA': 'RAMOY',
  'RA PASCO': 'RAPAS',
  'RA PIURA': 'RAPIU',
  'RA PUNO': 'RAPUN',
  'RA TACNA': 'RATAC',
  'RA TARAPOTO': 'RATAR',
  'RA TUMBES': 'RATUM',
  'RA UCAYALI': 'RAUCA',
  'RP ALMENARA': 'RPALM',
  'RP LAMBAYEQUE': 'RPLAM',
  'RP REBAGLIATI': 'RPREB',
  'RP SABOGAL': 'RPSAB',
};

function siglaDeRed(red) {
  if (!red) return null;
  return SIGLAS_RED[String(red).trim().toUpperCase()] || null;
}

// 'Plan Local de Capacitación' -> 'PL', 'Actividad Estrategias de Capacitación' -> 'AC'
function siglaDeCategoria(categoria) {
  if (!categoria) return null;
  const c = categoria.trim().toLowerCase();
  if (c.startsWith('plan local')) return 'PL';
  if (c.startsWith('actividad estrategia')) return 'AC';
  return null;
}

module.exports = { SIGLAS_RED, siglaDeRed, siglaDeCategoria };
