// Asigna el rol SuperAdministrador a un usuario existente por DNI.
// Uso:  node asignar_superadmin.js <dni>
// Ej.:  node asignar_superadmin.js 70435255
//
// A propósito NO hay una versión de este script para uso normal del sistema
// (ni un botón en la UI) — SuperAdministrador solo se asigna manualmente acá,
// según lo definido con el usuario.

require('dotenv').config();
const pool = require('./db-oracle');

const dni = process.argv[2];
if (!dni) {
  console.error('Uso: node asignar_superadmin.js <dni>');
  process.exit(1);
}

(async () => {
  const existente = await pool.query(
    'SELECT dni, nombre, rol, roles, estado FROM usuarios_sistema WHERE dni = $1',
    [dni],
  );
  if (!existente.rows.length) {
    console.error(`No se encontró ningún usuario con DNI ${dni}.`);
    process.exit(1);
  }
  console.log('Usuario encontrado:', existente.rows[0]);

  const r = await pool.query(
    "UPDATE usuarios_sistema SET rol = 'SuperAdministrador', roles = 'SuperAdministrador' WHERE dni = $1",
    [dni],
  );
  console.log('Filas actualizadas:', r.rowCount);

  const check = await pool.query(
    'SELECT dni, nombre, rol, roles, estado FROM usuarios_sistema WHERE dni = $1',
    [dni],
  );
  console.log('Verificación:', check.rows[0]);
  process.exit(0);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
