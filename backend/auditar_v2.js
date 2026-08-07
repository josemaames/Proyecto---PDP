require('dotenv').config();
const pool = require('./db-oracle');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = '/Users/victoracero/Desktop/Constancias';

function norm(s) {
  return (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

function walk(d, base) {
  const out = [];
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.name.toLowerCase().endsWith('.pdf')) {
      const rel = path.relative(base, full);
      const partes = rel.split(path.sep);
      out.push({ full, red: partes[0], servicio: partes.slice(1, -1).join('/'), archivo: entry.name });
    }
  }
  return out;
}

(async () => {
  const archivos = walk(DIR, DIR);
  archivos.forEach(a => a.hash = crypto.createHash('sha256').update(fs.readFileSync(a.full)).digest('hex'));

  const { rows: todos } = await pool.query('SELECT dni_ce, apellidos, nombre, red, servicio_area FROM personal');
  const index = todos.map(r => ({ ...r, na: norm(r.apellidos), nn: norm(r.nombre) }));

  // 1) Duplicados por contenido en TODO el árbol actual
  const porHash = {};
  archivos.forEach(a => (porHash[a.hash] = porHash[a.hash] || []).push(a));
  const dupContenido = Object.values(porHash).filter(g => g.length > 1);

  // 2) Match contra BD
  for (const a of archivos) {
    const nombreCompleto = a.archivo.replace(/\.pdf$/i, '');
    const [apellidos, nombre] = nombreCompleto.split(',').map(s => (s || '').trim());
    let match = null;
    if (apellidos && nombre) {
      const na = norm(apellidos), nn = norm(nombre);
      match = index.find(r => r.na === na && r.nn === nn)
        || index.find(r => r.na === na && (r.nn.startsWith(nn) || nn.startsWith(r.nn)));
      if (!match) {
        const cand = index.filter(r => r.na === na);
        if (cand.length === 1) match = cand[0];
      }
      if (!match) {
        const primerApellido = na.split(' ')[0];
        const cand = index.filter(r => r.na.split(' ')[0] === primerApellido && r.nn === nn);
        if (cand.length === 1) match = cand[0];
      }
    }
    if (!match && apellidos && nombre) {
      const na2 = norm(apellidos), nn2 = norm(nombre);
      const primerApellido2 = na2.split(' ')[0];
      const cand2 = index.filter(r => r.na.split(' ')[0] === primerApellido2 && r.na.includes(primerApellido2) && r.nn === nn2);
      if (cand2.length === 1) match = cand2[0];
    }
    a.match = match;
  }

  // 3) Chequeo de RED: comparar carpeta de red contra red real (normalizado)
  const redIncorrecta = archivos.filter(a => a.match && norm(a.red) !== norm(a.match.red));

  // 4) Chequeo de SERVICIO/ÁREA por carpeta física: agrupar por (red,servicio) y ver
  //    si los servicio_area REALES de la gente ahí adentro son consistentes entre sí.
  const porCarpeta = {};
  archivos.forEach(a => {
    if (!a.match) return;
    const key = a.red + '  →  ' + a.servicio;
    (porCarpeta[key] = porCarpeta[key] || []).push(a);
  });

  const carpetasInconsistentes = [];
  for (const [carpeta, gente] of Object.entries(porCarpeta)) {
    const serviciosReales = [...new Set(gente.map(g => norm(g.match.servicio_area)))];
    if (serviciosReales.length > 1) {
      carpetasInconsistentes.push({ carpeta, gente, serviciosReales: [...new Set(gente.map(g => g.match.servicio_area))] });
    }
  }

  console.log('Total archivos:', archivos.length);
  console.log('Con coincidencia en pdp_personal:', archivos.filter(a => a.match).length);
  console.log('Sin coincidencia:', archivos.filter(a => !a.match).length);

  console.log('\\n=== DUPLICADOS POR CONTENIDO (mismo PDF en 2+ carpetas) ===');
  if (!dupContenido.length) console.log('Ninguno.');
  dupContenido.forEach(g => {
    console.log('--- ' + g[0].archivo + ' (' + g.length + ' copias) ---');
    g.forEach(a => console.log('  ', a.red, '/', a.servicio));
  });

  console.log('\\n=== RED INCORRECTA (la carpeta de red no coincide con la BD) ===');
  if (!redIncorrecta.length) console.log('Ninguna.');
  redIncorrecta.forEach(a => console.log('-', a.archivo, '| está en:', a.red, '| debería:', a.match.red, '(DNI', a.match.dni_ce + ')'));

  console.log('\\n=== CARPETAS DE SERVICIO/ÁREA INCONSISTENTES (mezclan gente de servicios reales distintos) ===');
  if (!carpetasInconsistentes.length) console.log('Ninguna.');
  carpetasInconsistentes.forEach(c => {
    console.log('--- ' + c.carpeta + ' ---');
    console.log('   Servicios reales mezclados:', c.serviciosReales.join('  |  '));
    c.gente.forEach(g => console.log('    -', g.archivo, '→ real:', g.match.servicio_area, '(DNI', g.match.dni_ce + ')'));
  });

  console.log('\\n=== SIN COINCIDENCIA EN pdp_personal ===');
  archivos.filter(a => !a.match).forEach(a => console.log('-', a.red, '/', a.servicio, '/', a.archivo));

  fs.writeFileSync('/tmp/auditoria_v2.json', JSON.stringify({ dupContenido, redIncorrecta, carpetasInconsistentes }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
