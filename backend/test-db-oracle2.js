require('dotenv').config();
const db = require('./db-oracle');

async function main() {
  const r1 = await db.query(
    `INSERT INTO usuarios_sistema (dni,nombre,password,rol,cargo,estado,sedes,numero_plantilla,email)
     VALUES ($1,$2,$3,$4,$5,'Activo',$6,$7,$8)
     RETURNING id,dni,nombre,rol,cargo,estado,sedes,numero_plantilla,email`,
    ['99999999', 'TEST ADAPTER', 'secreto123', 'Ejecutor', 'Cargo Test', 'RED TEST', 'PLANT01', 'test@test.com'],
  );
  console.log('--- RETURNING con lista explícita (sin password) ---');
  console.log(r1.rows[0]);
  console.log('tiene password en la respuesta?', 'password' in r1.rows[0]);

  const del = await db.query('DELETE FROM usuarios_sistema WHERE dni=$1', ['99999999']);
  console.log('limpieza, filas borradas:', del.rowCount);
}

main().catch((err) => {
  console.error('FALLÓ:', err.message);
  process.exit(1);
});
