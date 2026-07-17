require('dotenv').config();
const oracledb = require('oracledb');

async function main() {
  const connectString = `${process.env.DB_QA_HOST}:${process.env.DB_QA_PORT}/${process.env.DB_QA_SERVICE}`;
  console.log('Conectando a', connectString, 'como', process.env.DB_QA_USER, '...');

  const connection = await oracledb.getConnection({
    user: process.env.DB_QA_USER,
    password: process.env.DB_QA_PASSWORD,
    connectString,
  });

  try {
    const result = await connection.execute(
      `SELECT COUNT(*) AS total FROM Pdp_personal`,
    );
    console.log('Conexión OK. Filas en Pdp_personal:', result.rows[0][0]);

    const tablas = await connection.execute(
      `SELECT table_name FROM user_tables WHERE table_name LIKE 'PDP%' ORDER BY table_name`,
    );
    console.log('Tablas Pdp_* encontradas:', tablas.rows.map((r) => r[0]));
  } finally {
    await connection.close();
  }
}

main().catch((err) => {
  console.error('Fallo la conexión:', err);
  process.exit(1);
});
