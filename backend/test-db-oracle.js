require('dotenv').config();
const db = require('./db-oracle');

async function main() {
  // 1) placeholder repetido + ILIKE + LIMIT/OFFSET + tabla sin prefijo
  const r1 = await db.query(
    `SELECT dni_ce, apellidos, nombre FROM personal
     WHERE (apellidos ILIKE $1 OR nombre ILIKE $1)
     ORDER BY apellidos LIMIT $2 OFFSET $3`,
    ['%garcia%', 5, 0],
  );
  console.log('--- test 1: ILIKE repetido + LIMIT/OFFSET ---');
  console.log('filas:', r1.rows.length, r1.rows[0]);

  // 2) INSERT ... RETURNING *
  const r2 = await db.query(
    `INSERT INTO presupuesto_redes (red, techo, anio) VALUES ($1, $2, $3) RETURNING *`,
    ['RED_TEST_ADAPTER', 1000.5, 2025],
  );
  console.log('--- test 2: INSERT RETURNING * ---');
  console.log(r2.rows[0]);

  // 3) UPDATE ... RETURNING *
  const r3 = await db.query(
    `UPDATE presupuesto_redes SET techo = $1 WHERE red = $2 RETURNING *`,
    [2000, 'RED_TEST_ADAPTER'],
  );
  console.log('--- test 3: UPDATE RETURNING * ---');
  console.log(r3.rows[0]);

  // 4) DELETE simple (sin RETURNING) - limpieza
  const r4 = await db.query(`DELETE FROM presupuesto_redes WHERE red = $1`, ['RED_TEST_ADAPTER']);
  console.log('--- test 4: DELETE ---');
  console.log('rowCount:', r4.rowCount);

  console.log('\nTODO OK');
}

main()
  .catch((err) => {
    console.error('FALLÓ:', err.message);
    process.exit(1);
  });
