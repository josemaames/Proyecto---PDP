require('dotenv').config();
const pool = require('./db-oracle');
const fs = require('fs');
const path = require('path');

const DIR = '/Users/victoracero/Desktop/Constancias';

function norm(s) {
  return (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function nombreCarpetaNorm(s) {
  // Compara carpetas igual que los nombres: sin importar mayúsculas/tildes/espacios extra.
  return norm(s);
}

function walk(d, base) {
  const out = [];
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.name.toLowerCase().endsWith('.pdf')) {
      const rel = path.relative(base, full);
      const partes = rel.split(path.sep);
      const red = partes[0];
      const servicio = partes.slice(1, -1).join(path.sep); // por si hay sub-sub-carpetas
      out.push({ full, red, servicio, archivo: entry.name });
    }
  }
  return out;
}

(async () => {
  const archivos = walk(DIR, DIR);
  const { rows: todos } = await pool.query('SELECT dni_ce, apellidos, nombre, red, servicio_area FROM personal');
  const index = todos.map(r => ({ ...r, na: norm(r.apellidos), nn: norm(r.nombre) }));

  const correctos = [];
  const incorrectos = [];
  const sinMatch = [];

  for (const a of archivos) {
    const nombreCompleto = a.archivo.replace(/\.pdf$/i, '');
    const [apellidos, nombre] = nombreCompleto.split(',').map(s => (s || '').trim());
    if (!apellidos || !nombre) { sinMatch.push({ ...a, motivo: 'nombre de archivo sin coma' }); continue; }

    const na = norm(apellidos);
    const nn = norm(nombre);

    let match = index.find(r => r.na === na && r.nn === nn);
    if (!match) match = index.find(r => r.na === na && (r.nn.startsWith(nn) || nn.startsWith(r.nn)));
    if (!match) {
      const cand = index.filter(r => r.na === na);
      if (cand.length === 1) match = cand[0];
    }
    if (!match) {
      const primerApellido = na.split(' ')[0];
      const cand = index.filter(r => r.na.split(' ')[0] === primerApellido && r.nn === nn);
      if (cand.length === 1) match = cand[0];
    }

    if (!match) { sinMatch.push({ ...a, motivo: 'no encontrado en pdp_personal' }); continue; }
    if (!match.red || !match.servicio_area) {
      sinMatch.push({ ...a, motivo: `sin red/servicio_area en BD (red=${match.red}, servicio=${match.servicio_area})` });
      continue;
    }

    const redOk = nombreCarpetaNorm(a.red) === nombreCarpetaNorm(match.red);
    const servicioOk = nombreCarpetaNorm(a.servicio) === nombreCarpetaNorm(match.servicio_area.replace(/[\/\\:*?"<>|]/g, '-'));

    if (redOk && servicioOk) {
      correctos.push(a);
    } else {
      incorrectos.push({
        ...a, dni: match.dni_ce,
        redEsperada: match.red, servicioEsperado: match.servicio_area,
        redOk, servicioOk,
      });
    }
  }

  console.log('Total archivos revisados:', archivos.length);
  console.log('Correctamente ubicados:', correctos.length);
  console.log('MAL UBICADOS:', incorrectos.length);
  console.log('Sin poder verificar (no están en pdp_personal):', sinMatch.length);

  if (incorrectos.length) {
    console.log('\n=== MAL UBICADOS ===');
    incorrectos.forEach(i => {
      console.log(`- ${i.archivo}`);
      console.log(`    Está en:    ${i.red} / ${i.servicio}`);
      console.log(`    Debería en: ${i.redEsperada} / ${i.servicioEsperado}  (DNI ${i.dni})`);
    });
  }

  if (sinMatch.length) {
    console.log('\n=== SIN VERIFICAR (no están en pdp_personal, no se puede confirmar su ubicación) ===');
    sinMatch.forEach(s => console.log(`- ${s.red} / ${s.servicio} / ${s.archivo}  (${s.motivo})`));
  }

  fs.writeFileSync('/tmp/auditoria_constancias.json', JSON.stringify({ correctos, incorrectos, sinMatch }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
