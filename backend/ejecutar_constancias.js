const fs = require('fs');
const path = require('path');

const ORIGEN = '/Users/victoracero/Desktop/drive-download-20260807T191150Z-1-001';
const DESTINO = '/Users/victoracero/Desktop/Constancias';

const { plan } = JSON.parse(fs.readFileSync('/tmp/plan_constancias.json', 'utf8'));

// Sanitiza nombres de carpeta (los servicio_area pueden traer '/', ':' etc.)
function nombreCarpeta(s) {
  return s.replace(/[\/\\:*?"<>|]/g, '-').trim();
}

let copiados = 0;
const errores = [];

for (const item of plan) {
  try {
    const redDir = path.join(DESTINO, nombreCarpeta(item.red));
    const servicioDir = path.join(redDir, nombreCarpeta(item.servicioArea));
    fs.mkdirSync(servicioDir, { recursive: true });

    const origenPath = path.join(ORIGEN, item.archivo);
    const destinoPath = path.join(servicioDir, item.archivo);

    if (fs.existsSync(destinoPath)) {
      errores.push({ archivo: item.archivo, motivo: 'ya existía en destino, se omitió' });
      continue;
    }
    fs.copyFileSync(origenPath, destinoPath);
    copiados++;
  } catch (e) {
    errores.push({ archivo: item.archivo, motivo: e.message });
  }
}

console.log('Copiados:', copiados, 'de', plan.length);
if (errores.length) {
  console.log('Errores/omitidos:');
  errores.forEach(e => console.log(' -', e.archivo, '-', e.motivo));
}
