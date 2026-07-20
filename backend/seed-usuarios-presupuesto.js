// Reinserta en Oracle la data semilla que traía crearTablas() en Postgres
// (usuarios de prueba + techos de presupuesto por red), que se perdió al
// borrar ese bloque durante la migración a Oracle (el bloque era DDL +
// esta semilla mezclados).
require('dotenv').config();
const db = require('./db-oracle');

const usuarios = [
  ['90642735', 'José Manuel Ames Anapán', 'admin123', 'Administrador', 'Analista PDP', 'Activo', '', 'PL-0001', 'jose.ames@essalud.gob.pe'],
  ['70435255', 'Víctor Gabriel Acero Garay', 'admin123', 'Administrador', 'Analista PDP', 'Activo', '', 'PL-0002', 'victor.acero@essalud.gob.pe'],
  ['73456264', 'Fernando David Campos Quiroz', 'admin123', 'Administrador', 'Especialista PDP', 'Activo', '', 'PL-0003', 'fernando.campos@essalud.gob.pe'],
  ['45611148', 'Sthywen Javier Muñoz Ruiz', 'admin123', 'Administrador', 'Especialista PDP', 'Activo', '', 'PL-0004', 'sthywen.munoz@essalud.gob.pe'],
  ['11111111', 'María Torres Quispe', 'sector123', 'Sectorista', 'Sectorista Red Arequipa', 'Activo', 'RA AREQUIPA', 'PL-0005', 'maria.torres@essalud.gob.pe'],
  ['33333333', 'Ana Sofía Paredes Quispe', 'sector123', 'Sectorista', 'Sectorista Redes Sur-Centro', 'Activo', 'RA CUSCO,RA AREQUIPA,RA PIURA', 'PL-0007', 'ana.paredes@essalud.gob.pe'],
  ['48562134', 'María Elena Torres Salazar', 'sector123', 'Sectorista', 'Sectorista Red Rebagliati', 'Activo', 'RP REBAGLIATI', '', 'maria.elena.torres@essalud.gob.pe'],
  ['71234589', 'Luis Alberto Sánchez Rojas', 'sector123', 'Sectorista', 'Sectorista Red Almenara', 'Activo', 'RP ALMENARA', '', 'luis.sanchez@essalud.gob.pe'],
  ['22222222', 'Ricardo Mendoza García', 'ejecutor123', 'Ejecutor', 'Ejecutor Red Rebagliati', 'Activo', 'RP REBAGLIATI', 'PL-0006', 'ricardo.mendoza@essalud.gob.pe'],
  ['44444444', 'Carlos Alberto Huanca Torres', 'ejecutor123', 'Ejecutor', 'Ejecutor Red Arequipa', 'Activo', 'RA AREQUIPA', 'PL-0008', 'carlos.huanca@essalud.gob.pe'],
  ['59874123', 'Ana Lucía Rodríguez Vargas', 'ejecutor123', 'Ejecutor', 'Ejecutor de Capacitación', 'Activo', '', '', 'ana.rodriguez@essalud.gob.pe'],
  ['74125896', 'Carmen Rosa Delgado Silva', 'ejecutor123', 'Ejecutor', 'Ejecutor Administrativo', 'Inactivo', '', '', 'carmen.delgado@essalud.gob.pe'],
];

const techos = [
  ['Red Asistencial Amazonas', 30000.0],
  ['Red Asistencial Ancash', 158640.0],
  ['Red Asistencial Apurímac', 66000.0],
  ['Red Asistencial Arequipa', 120000.0],
  ['Red Asistencial Ayacucho', 65000.0],
  ['Red Asistencial Cajamarca', 80000.0],
  ['Red Asistencial Cusco', 160000.0],
  ['Red Asistencial Huancavelica', 32000.0],
  ['Red Asistencial Huánuco', 74000.0],
  ['Red Asistencial Huaraz', 40000.0],
  ['Red Asistencial Ica', 175000.0],
  ['Red Asistencial Jaen', 32000.0],
  ['Red Asistencial Juliaca', 65760.0],
  ['Red Asistencial Junin', 54000.0],
  ['Red Asistencial La Libertad', 114960.0],
  ['Red Asistencial Loreto', 60000.0],
  ['Red Asistencial Madre de Dios', 60000.0],
  ['Red Asistencial Moquegua', 91020.0],
  ['Red Asistencial Moyobamba', 62000.0],
  ['Red Asistencial Pasco', 72000.0],
  ['Red Asistencial Piura', 45000.0],
  ['Red Asistencial Puno', 122524.0],
  ['Red Asistencial Tacna', 90000.0],
  ['Red Asistencial Tarapoto', 58000.0],
  ['Red Asistencial Tumbes', 36130.0],
  ['Red Asistencial Ucayali', 45000.0],
  ['Red Prestacional Almenara', 240000.0],
  ['Red Asistencial Lambayeque', 140000.0],
  ['Red Prestacional Rebagliati', 240000.0],
  ['Red Prestacional Sabogal', 195000.0],
  ['Centro Nacional de Salud Renal', 72000.0],
  ['Instituto Nacional Cardiovascular', 52000.0],
];

async function main() {
  let insertados = 0;
  let omitidos = 0;
  for (const u of usuarios) {
    const dni = u[0];
    const { rows } = await db.query('SELECT 1 FROM usuarios_sistema WHERE dni=$1', [dni]);
    if (rows.length) {
      omitidos++;
      continue;
    }
    await db.query(
      `INSERT INTO usuarios_sistema (dni,nombre,password,rol,cargo,estado,sedes,numero_plantilla,email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      u,
    );
    insertados++;
  }
  console.log('usuarios_sistema: insertados', insertados, '| ya existían (omitidos)', omitidos);

  const { rows: yaRedes } = await db.query('SELECT COUNT(*) AS count FROM presupuesto_redes');
  if (yaRedes[0].count > 0) {
    console.log('presupuesto_redes ya tiene', yaRedes[0].count, 'filas, se omite.');
  } else {
    for (const [red, techo] of techos) {
      await db.query(`INSERT INTO presupuesto_redes (red, techo, anio) VALUES ($1, $2, 2025)`, [red, techo]);
    }
    console.log('presupuesto_redes: insertados', techos.length);
  }
}

main().catch((err) => {
  console.error('FALLÓ:', err.message);
  process.exit(1);
});
