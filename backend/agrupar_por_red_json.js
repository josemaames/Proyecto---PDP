require('dotenv').config();
const pool = require('./db-oracle');
const nombres = JSON.parse(require('fs').readFileSync('/tmp/nombres_lista.json', 'utf8'));

function norm(s) {
  return (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

(async () => {
  const { rows: todos } = await pool.query('SELECT dni_ce, apellidos, nombre, red FROM personal');
  const index = todos.map(r => ({ ...r, na: norm(r.apellidos), nn: norm(r.nombre) }));

  const porRed = {};
  const sinMatch = [];

  for (const [apellidos, nombre] of nombres) {
    const na = norm(apellidos);
    const nn = norm(nombre);

    let match = index.find(r => r.na === na && r.nn === nn);
    if (!match) match = index.find(r => r.na === na && (r.nn.startsWith(nn) || nn.startsWith(r.nn)));
    if (!match) {
      const cand = index.filter(r => r.na === na);
      if (cand.length === 1) match = cand[0];
    }
    // apellido paterno coincide + nombre coincide (para casos "APELLIDO DE CASADA")
    if (!match) {
      const primerApellido = na.split(' ')[0];
      const cand = index.filter(r => r.na.split(' ')[0] === primerApellido && r.na.includes(primerApellido) && (r.nn === nn));
      if (cand.length === 1) match = cand[0];
    }

    if (match) {
      const red = match.red || 'SIN RED';
      (porRed[red] = porRed[red] || []).push({
        apellidos, nombre, dni: match.dni_ce, apellidosBd: match.apellidos, nombreBd: match.nombre,
      });
    } else {
      sinMatch.push({ apellidos, nombre });
    }
  }

  for (const red of Object.keys(porRed)) {
    porRed[red].sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
  }

  const out = { porRed, sinMatch, total: nombres.length };
  require('fs').writeFileSync('/tmp/resultado_redes.json', JSON.stringify(out, null, 2));
  console.log('Escrito /tmp/resultado_redes.json');
  console.log('Redes:', Object.keys(porRed).length, '| Sin match:', sinMatch.length);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
