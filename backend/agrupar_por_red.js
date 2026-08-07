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

    // 1) match exacto
    let match = index.find(r => r.na === na && r.nn === nn);
    // 2) apellido exacto + nombre empieza igual (por truncamientos/espacios)
    if (!match) match = index.find(r => r.na === na && (r.nn.startsWith(nn) || nn.startsWith(r.nn)));
    // 3) apellido exacto solamente, si hay un único candidato
    if (!match) {
      const cand = index.filter(r => r.na === na);
      if (cand.length === 1) match = cand[0];
    }

    const label = `${apellidos}, ${nombre}`;
    if (match) {
      const red = match.red || 'SIN RED';
      (porRed[red] = porRed[red] || []).push(`${label} (${match.dni_ce})`);
    } else {
      sinMatch.push(label);
    }
  }

  const redes = Object.keys(porRed).sort();
  let totalMatch = 0;
  for (const red of redes) {
    console.log(`\n=== ${red} (${porRed[red].length}) ===`);
    porRed[red].forEach(n => console.log('  ' + n));
    totalMatch += porRed[red].length;
  }
  console.log(`\n=== SIN COINCIDENCIA (${sinMatch.length}) ===`);
  sinMatch.forEach(n => console.log('  ' + n));

  console.log(`\nTotal nombres: ${nombres.length} | Encontrados: ${totalMatch} | Sin match: ${sinMatch.length}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
