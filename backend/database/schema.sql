-- ================================================================
--  PDP EsSalud — Esquema completo de base de datos (PostgreSQL)
--  Generado a partir del código real de backend/index.js
--
--  Cómo usar este archivo:
--    1. Correr este script UNA vez sobre una base de datos vacía.
--    2. Levantar el backend (`npm start`): al arrancar, siembra
--       automáticamente los usuarios y presupuestos base (ver
--       ensureSchema()/crearTablas() en index.js). No hace falta
--       insertar esos datos a mano.
--
--  Extensiones necesarias (búsqueda de texto difusa/sin tildes):
-- ================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;


-- ================================================================
--  1. TABLAS BASE (sin FKs entre sí)
-- ================================================================

-- Personal de EsSalud (maestro). NO la llena esta app: se puebla desde un
-- proceso externo (sync con SAP / RRHH). El backend solo LEE de aquí.
CREATE TABLE IF NOT EXISTS personal (
  id               SERIAL PRIMARY KEY,
  dni_ce           TEXT,
  cod_planilla     TEXT,
  apellidos        TEXT,
  nombre           TEXT,
  sexo             TEXT,
  red              TEXT,
  sub_programa     TEXT,
  servicio_area    TEXT,
  cargo            TEXT,
  regimen_laboral  TEXT
);

-- Capacitaciones / actividades del PDP (una fila = una capacitación).
CREATE TABLE IF NOT EXISTS datos_actividad (
  id                     SERIAL PRIMARY KEY,
  numero                 INT,                  -- correlativo manual/legado; nullable
  codigo_act             TEXT NOT NULL,         -- código de la capacitación (ej. "2025PL704")
  fecha_inicio           DATE,
  fecha_fin              DATE,
  mes_termino            TEXT,
  red_asistencial        TEXT NOT NULL,
  servicio_area          TEXT NOT NULL,
  nombre_actividad       TEXT,
  total_horas            NUMERIC,
  horas_fuera_horario    NUMERIC,
  frecuencia             TEXT NOT NULL,
  hora_inicio            TIME,
  hora_termino           TIME,
  modalidad              TEXT,
  publico                TEXT,
  nivel_evaluacion       TEXT,
  objetivo_estrategico   TEXT,
  total_participantes    INT,
  ruc_proveedor          TEXT,
  nombre_proveedor       TEXT,
  sector_proveedor       TEXT,
  presupuesto_ejecutado  NUMERIC,
  eje_tematico           TEXT
);

-- Usuarios del sistema (login propio, no viene de SOMOS).
CREATE TABLE IF NOT EXISTS usuarios_sistema (
  id                SERIAL PRIMARY KEY,
  dni               TEXT UNIQUE NOT NULL,
  nombre            TEXT NOT NULL,
  password          TEXT NOT NULL,
  rol               TEXT NOT NULL,             -- rol principal (compatibilidad)
  roles             TEXT DEFAULT '',           -- multi-rol, separados por coma
  cargo             TEXT DEFAULT '',
  estado            TEXT NOT NULL DEFAULT 'Activo',
  sedes             TEXT DEFAULT '',           -- redes asignadas (Sectorista/Ejecutor), separadas por coma
  numero_plantilla  TEXT DEFAULT '',
  email             TEXT DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Techo presupuestal por red (se descuenta con presupuesto_ejecutado de datos_actividad).
CREATE TABLE IF NOT EXISTS presupuesto_redes (
  red    TEXT PRIMARY KEY,
  techo  NUMERIC(14,2) NOT NULL,
  anio   INT NOT NULL DEFAULT 2025
);

-- Bitácora de auditoría (todo el sistema escribe aquí vía logEvento()).
CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL,
  descripcion   TEXT NOT NULL,
  actor_nombre  TEXT,
  actor_rol     TEXT,
  referencia    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link de Drive por red donde se guardan los certificados (subida manual).
CREATE TABLE IF NOT EXISTS certificado_carpeta_drive (
  red              TEXT PRIMARY KEY,
  drive_url        TEXT NOT NULL,
  actualizado_por  TEXT,
  actualizado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ================================================================
--  2. TABLAS QUE DEPENDEN DE LAS ANTERIORES
-- ================================================================

-- Participantes por capacitación (vínculo entre datos_actividad y personal).
CREATE TABLE IF NOT EXISTS lista_participantes (
  id                SERIAL PRIMARY KEY,
  codigo_act        TEXT,                      -- FK → datos_actividad.codigo_act (ver más abajo)
  dni_ce            TEXT,                      -- FK → personal.dni_ce (ver más abajo)
  cod_planilla      TEXT,
  apellidos         TEXT,
  nombre            TEXT,
  sexo              TEXT,
  red               TEXT,
  sub_programa      TEXT,
  servicio_area     TEXT,
  cargo             TEXT,
  regimen_laboral   TEXT,
  -- Notas (el ejecutor las sube al terminar la capacitación):
  nota              NUMERIC(4,2),
  condicion         TEXT,                      -- 'Aprobado' | 'Desaprobado'
  nota_subida_at    TIMESTAMPTZ,
  fuera_de_plazo    BOOLEAN NOT NULL DEFAULT FALSE
);

-- Solicitudes de revisión del ejecutor al sectorista (formulario completo en JSONB).
CREATE TABLE IF NOT EXISTS solicitudes_revision (
  id                     SERIAL PRIMARY KEY,
  datos                  JSONB NOT NULL,        -- snapshot completo del formulario
  red_asistencial        TEXT,
  ejecutor_nombre        TEXT,
  ejecutor_dni           TEXT,                  -- FK → usuarios_sistema.dni (ver más abajo)
  estado                 TEXT NOT NULL DEFAULT 'pendiente',
  motivo_rechazo         TEXT,
  correccion_pendiente   BOOLEAN NOT NULL DEFAULT FALSE,
  seccion_correccion     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at            TIMESTAMPTZ
);

-- Comprobantes / documentos adjuntos a una capacitación.
-- SIN FK a datos_actividad a propósito: el ejecutor sube el comprobante
-- ANTES de que la actividad exista en datos_actividad (se crea recién
-- cuando el sectorista aprueba). No usar ON DELETE CASCADE aquí.
CREATE TABLE IF NOT EXISTS documentos (
  id              SERIAL PRIMARY KEY,
  codigo_act      TEXT NOT NULL,               -- referencia lógica, no FK
  nombre_archivo  TEXT NOT NULL,
  tipo_archivo    TEXT,
  ruta_storage    TEXT NOT NULL,               -- ruta en Supabase Storage (bucket "documentos")
  tamano_kb       INT,
  fecha_subida    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pasos de la hoja de ruta por capacitación (siempre los mismos pasos, uno por actividad).
CREATE TABLE IF NOT EXISTS hoja_ruta_pasos (
  id             SERIAL PRIMARY KEY,
  actividad_id   INT NOT NULL REFERENCES datos_actividad(id) ON DELETE CASCADE,
  paso_nombre    TEXT NOT NULL,
  completado     BOOLEAN NOT NULL DEFAULT FALSE,
  completado_at  TIMESTAMPTZ,
  UNIQUE (actividad_id, paso_nombre)
);

-- Solicitudes de cambio de presupuesto (rol Presupuesto). Hoy se aplican
-- directo (estado 'aplicado'); el flujo de aprobación del admin quedó
-- deprecado pero las columnas se conservan por compatibilidad.
CREATE TABLE IF NOT EXISTS solicitud_presupuesto (
  id                  SERIAL PRIMARY KEY,
  tipo                TEXT NOT NULL,            -- 'aumento' | 'reduccion' | 'reasignacion'
  red                 TEXT NOT NULL,            -- red origen
  red_destino         TEXT,                     -- solo en 'reasignacion'
  monto               NUMERIC(14,2) NOT NULL,
  motivo              TEXT,
  estado              TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'aprobado' | 'denegado' | 'aplicado'
  solicitante_dni     TEXT,
  solicitante_nombre  TEXT,
  revisor_dni         TEXT,
  revisor_nombre      TEXT,
  respuesta           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);


-- ================================================================
--  3. LLAVES FORÁNEAS
--  (se agregan al final, con limpieza previa de huérfanos —
--   ver crearConstraints() en index.js, que hace lo mismo en cada arranque)
-- ================================================================

-- UNIQUE requerido para poder referenciar personal.dni_ce desde otra tabla
ALTER TABLE personal
  ADD CONSTRAINT personal_dni_ce_unique UNIQUE (dni_ce);

-- lista_participantes.codigo_act → datos_actividad.codigo_act
-- ON DELETE SET NULL: los participantes son trabajadores reales y deben
-- seguir existiendo aunque se borre la capacitación (solo pierden el vínculo).
ALTER TABLE lista_participantes
  ADD CONSTRAINT fk_participantes_actividad
  FOREIGN KEY (codigo_act) REFERENCES datos_actividad(codigo_act) ON DELETE SET NULL;

-- lista_participantes.dni_ce → personal.dni_ce
-- ON DELETE SET NULL: si el trabajador se retira del maestro, el
-- participante queda igual (es un registro histórico de la capacitación).
ALTER TABLE lista_participantes
  ADD CONSTRAINT fk_participantes_personal
  FOREIGN KEY (dni_ce) REFERENCES personal(dni_ce) ON DELETE SET NULL;

-- solicitudes_revision.ejecutor_dni → usuarios_sistema.dni
ALTER TABLE solicitudes_revision
  ADD CONSTRAINT fk_solicitudes_ejecutor
  FOREIGN KEY (ejecutor_dni) REFERENCES usuarios_sistema(dni) ON DELETE SET NULL;

-- codigo_act debe ser único para poder referenciarlo como FK y hacer
-- ON CONFLICT (codigo_act) al aprobar/editar actividades.
ALTER TABLE datos_actividad
  ADD CONSTRAINT uq_datos_actividad_codigo_act UNIQUE (codigo_act);

-- solicitud_presupuesto.red / red_destino → presupuesto_redes.red
-- (red_destino es nullable: solo se usa en solicitudes de tipo 'reasignacion')
ALTER TABLE solicitud_presupuesto
  ADD CONSTRAINT fk_solpres_red
  FOREIGN KEY (red) REFERENCES presupuesto_redes(red);
ALTER TABLE solicitud_presupuesto
  ADD CONSTRAINT fk_solpres_red_destino
  FOREIGN KEY (red_destino) REFERENCES presupuesto_redes(red);

-- solicitud_presupuesto.solicitante_dni / revisor_dni → usuarios_sistema.dni
-- (siempre son usuarios ya autenticados en el sistema)
ALTER TABLE solicitud_presupuesto
  ADD CONSTRAINT fk_solpres_solicitante
  FOREIGN KEY (solicitante_dni) REFERENCES usuarios_sistema(dni) ON DELETE SET NULL;
ALTER TABLE solicitud_presupuesto
  ADD CONSTRAINT fk_solpres_revisor
  FOREIGN KEY (revisor_dni) REFERENCES usuarios_sistema(dni) ON DELETE SET NULL;

-- certificado_carpeta_drive.red → presupuesto_redes.red
-- (red es a la vez PK de esta tabla y FK a presupuesto_redes: patrón "PF")
ALTER TABLE certificado_carpeta_drive
  ADD CONSTRAINT fk_certcarpeta_red
  FOREIGN KEY (red) REFERENCES presupuesto_redes(red);

-- PENDIENTE (a propósito, no es un olvido): datos_actividad.red_asistencial y
-- solicitudes_revision.red_asistencial CONCEPTUALMENTE también deberían apuntar
-- a presupuesto_redes.red, pero el sistema todavía no garantiza un formato único
-- de nombre de red en todos los flujos (ver expandirRed()/normalizarRedKey() en
-- index.js). Agregar esas FK ahora rompería la creación de actividades en cuanto
-- el texto no calzara exacto. Primero hay que normalizar el formato de "red" en
-- toda la app; recién ahí se pueden agregar esas 2 FK con seguridad.
-- personal.red tampoco se enlaza: esa tabla la puebla un proceso EXTERNO.


-- ================================================================
--  4. ÍNDICES
-- ================================================================

-- Filtros por red (control de acceso por red y resúmenes)
CREATE INDEX IF NOT EXISTS idx_actividad_red       ON datos_actividad(red_asistencial);
CREATE INDEX IF NOT EXISTS idx_personal_red        ON personal(red);
CREATE INDEX IF NOT EXISTS idx_participantes_red   ON lista_participantes(red);
CREATE INDEX IF NOT EXISTS idx_participantes_codigo ON lista_participantes(codigo_act);

-- Covering index para /api/resumen-redes (permite index-only scan)
CREATE INDEX IF NOT EXISTS idx_actividad_resumen_cov
  ON datos_actividad(red_asistencial)
  INCLUDE (total_horas, total_participantes, presupuesto_ejecutado);

-- GROUP BY del dashboard
CREATE INDEX IF NOT EXISTS idx_actividad_modalidad ON datos_actividad(modalidad);
CREATE INDEX IF NOT EXISTS idx_actividad_mes       ON datos_actividad(mes_termino);
CREATE INDEX IF NOT EXISTS idx_actividad_servicio  ON datos_actividad(servicio_area);
CREATE INDEX IF NOT EXISTS idx_participantes_sexo  ON lista_participantes(sexo);

-- Paginación por defecto (listado de actividades sin filtro de red)
CREATE INDEX IF NOT EXISTS idx_actividad_numero ON datos_actividad(numero NULLS LAST);

-- Auditoría: listar lo más reciente primero
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- Solicitudes de presupuesto pendientes
CREATE INDEX IF NOT EXISTS idx_solpres_estado ON solicitud_presupuesto(estado);

-- Búsqueda de texto difusa (sin tildes, parcial) — usa pg_trgm
CREATE INDEX IF NOT EXISTS idx_actividad_nombre_trgm
  ON datos_actividad USING gin(nombre_actividad gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_personal_apellidos_trgm
  ON personal USING gin(apellidos gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_participantes_apellidos_trgm
  ON lista_participantes USING gin(apellidos gin_trgm_ops);

-- NOTA: NO se crea un índice aparte para personal.dni_ce ni para
-- (actividad_id) solo en hoja_ruta_pasos — ver auditoría más abajo:
-- ya quedan cubiertos por personal_dni_ce_unique y por el UNIQUE
-- (actividad_id, paso_nombre) respectivamente.
