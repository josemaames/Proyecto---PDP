require('dotenv').config();
const pool = require('./db-oracle');
const fs = require('fs');
const path = require('path');

const ORIGEN = '/Users/victoracero/Desktop/drive-download-20260807T191150Z-1-001';
const DESTINO = '/Users/victoracero/Desktop/Constancias';

function norm(s) {
  return (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

(async () => {
  const archivos = fs.readdirSync(ORIGEN).filter(f => f.toLowerCase().endsWith('.pdf'));

  const { rows: todos } = await pool.query('SELECT dni_ce, apellidos, nombre, red, servicio_area FROM personal');
  const index = todos.map(r => ({ ...r, na: norm(r.apellidos), nn: norm(r.nombre) }));

  const plan = []; // { archivo, red, servicioArea, dni }
  const yaOrganizados = [];
  const sinMatch = [];

  // archivos ya colocados en Constancias/ (para no duplicar)
  function listarExistentes(dir) {
    const existentes = new Set();
    function walk(d) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.toLowerCase().endsWith('.pdf')) existentes.add(entry.name);
      }
    }
    if (fs.existsSync(dir)) walk(dir);
    return existentes;
  }
  const existentes = listarExistentes(DESTINO);

  for (const archivo of archivos) {
    if (existentes.has(archivo)) { yaOrganizados.push(archivo); continue; }

    const nombreCompleto = archivo.replace(/\.pdf$/i, '');
    const [apellidos, nombre] = nombreCompleto.split(',').map(s => (s || '').trim());
    if (!apellidos || !nombre) { sinMatch.push({ archivo, motivo: 'nombre de archivo no tiene formato "APELLIDOS, NOMBRE"' }); continue; }

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

    if (!match) { sinMatch.push({ archivo, apellidos, nombre }); continue; }
    if (!match.red || !match.servicio_area) {
      sinMatch.push({ archivo, apellidos, nombre, motivo: `encontrado pero sin red/servicio_area (red=${match.red}, servicio=${match.servicio_area})` });
      continue;
    }

    plan.push({ archivo, apellidos, nombre, dni: match.dni_ce, red: match.red.trim(), servicioArea: match.servicio_area.trim() });
  }

  fs.writeFileSync('/tmp/plan_constancias.json', JSON.stringify({ plan, sinMatch, yaOrganizados }, null, 2));

  console.log('Total archivos en origen:', archivos.length);
  console.log('Ya organizados (se omiten):', yaOrganizados.length);
  console.log('Para mover/copiar:', plan.length);
  console.log('Sin coincidencia:', sinMatch.length);
  if (sinMatch.length) {
    console.log('\nDetalle sin coincidencia:');
    sinMatch.forEach(s => console.log(' -', s.archivo, s.motivo ? `(${s.motivo})` : ''));
  }

  // resumen por red
  const porRed = {};
  plan.forEach(p => { porRed[p.red] = (porRed[p.red] || 0) + 1; });
  console.log('\nResumen por red:');
  Object.keys(porRed).sort((a,b)=>porRed[b]-porRed[a]).forEach(r => console.log(' ', r, '->', porRed[r]));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
