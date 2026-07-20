// Corrige el DNI/CE que perdió el cero a la izquierda al leer el Excel:
// la columna en el Excel tiene formato de celda "00000000" (8 dígitos con
// ceros a la izquierda), pero al leer el valor numérico crudo esos ceros se
// pierden (ej. "01318125" quedó como "1318125"). Verificado sin colisiones.
require('dotenv').config();
const db = require('./db-oracle');

async function main() {
  console.log('Quitando FK fk_participantes_personal (para poder actualizar ambas tablas)...');
  await db.query('ALTER TABLE lista_participantes DROP CONSTRAINT fk_participantes_personal');

  console.log('Corrigiendo personal.dni_ce...');
  const r1 = await db.query(
    `UPDATE personal SET dni_ce = LPAD(dni_ce, 8, '0') WHERE LENGTH(dni_ce) < 8`,
  );
  console.log('personal: filas corregidas =', r1.rowCount);

  console.log('Corrigiendo lista_participantes.dni_ce...');
  const r2 = await db.query(
    `UPDATE lista_participantes SET dni_ce = LPAD(dni_ce, 8, '0') WHERE LENGTH(dni_ce) < 8`,
  );
  console.log('lista_participantes: filas corregidas =', r2.rowCount);

  console.log('Recreando FK fk_participantes_personal...');
  await db.query(
    `ALTER TABLE lista_participantes
     ADD CONSTRAINT fk_participantes_personal
     FOREIGN KEY (dni_ce) REFERENCES personal(dni_ce) ON DELETE SET NULL`,
  );

  console.log('Listo.');
}

main().catch((err) => {
  console.error('FALLÓ:', err.message);
  process.exit(1);
});
