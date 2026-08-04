import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { forkJoin, firstValueFrom } from 'rxjs';
import { PdpDataService, Actividad, Participante, AlertaPersonal } from '../../services/pdp-data.service';
import { tieneRol } from '../../utils/roles.util';
import * as ExcelJS from 'exceljs';

@Component({
  selector: 'app-sectorista',
  imports: [CommonModule, FormsModule],
  templateUrl: './sectorista.html',
  styleUrl: './sectorista.css',
})
export class Sectorista implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private pdpData = inject(PdpDataService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';
  tienePresupuesto = false;
  tieneConvenios = false;
  mostrarPerfilMenu = false;

  cargandoRuc = false;
  errorRuc = '';
  errorFormulario = '';
  camposError: Record<string, boolean> = {};

  get porcentajeCompletado(): number {
    const campos = [
      this.matriz.responsable,
      this.matriz.correo,
      this.matriz.telefono,

      this.matriz.accionFormacion,
      this.matriz.tipoAccion,
      this.matriz.costoTotal,
      this.matriz.cantidadBeneficiarios,

      this.matriz.horasCapacitacion,
      this.matriz.horasFueraJornada,

      this.matriz.nivelEvaluacion,
      this.matriz.resultadoAprendizaje,
      this.matriz.resultadoAplicacion,

      this.matriz.rucProveedor,
      this.matriz.sectorProveedor,

      this.matriz.financiamiento,
      this.matriz.montoCofinanciado,

      this.matriz.modificacionPdp,
      this.matriz.informeOrh,
    ];

    let completados = campos.filter((c) => {
      if (typeof c === 'number') {
        return c > 100;
      }

      return c !== null && c !== undefined && c.toString().trim() !== '';
    }).length;

    const beneficiario = this.beneficiarios[0];

    if (beneficiario?.nombre) completados++;
    if (beneficiario?.dni) completados++;
    if (beneficiario?.genero) completados++;
    if (beneficiario?.regimen) completados++;
    if (beneficiario?.unidad) completados++;
    if (beneficiario?.puesto) completados++;

    const totalCampos = 24;

    return Math.round((completados / totalCampos) * 100);
  }

  // SOLICITUDES DE REVISIÓN
  solicitudes: any[] = [];
  cargandoSolicitudes = false;
  solicitudDetalle: any = null;
  documentosDetalle: any[] = [];
  mostrarModalRechazo = false;
  motivoRechazo = '';
  solicitudADenegar: any = null;
  procesandoRevision = false;

  // HISTORIAL
  historial: any[] = [];
  cargandoHistorial = false;

  mostrarModalDocumentos = false;
  documentosGestion: any[] = [];
  cargandoDocumentosGestion = false;

  // EDICIÓN DE CAPACITACIÓN (sectorista)
  mostrarModalEditar = false;
  cargandoEdicion = false;
  guardandoEdicion = false;
  errorEdicion = '';
  actividadEditando: Actividad | null = null;
  participantesEditando: Participante[] = [];
  nuevoParticipanteEdicion = this.participanteVacioEdicion();
  errorParticipanteEdicion = '';

  // SOLICITAR EDICIÓN AL EJECUTOR
  mostrarModalSolicitarEdicion = false;
  solicitudParaEdicion: any = null;
  seccionEdicion: 'formulario' | 'participantes' | '' = '';
  mensajeEdicion = '';
  enviandoSolicitudEdicion = false;
  errorSolicitudEdicion = '';

  participanteVacioEdicion() {
    return {
      dni_ce: '',
      cod_planilla: '',
      apellidos: '',
      nombre: '',
      sexo: '',
      sub_programa: '',
      servicio_area: '',
      cargo: '',
      regimen_laboral: '',
    };
  }

  // PRESUPUESTO
  presupuestoMiRed: any[] = [];

  // BÚSQUEDA DE CAPACITACIONES
  mostrarBusqueda = false;
  textoBusqueda = '';
  codigoBusqueda = '';
  actividades: any[] = [];
  actividadDetalle: any = null;
  cargandoAct = false;
  redFiltro = '';
  totalActividades = 0;

  matriz = {
    // DATOS GENERALES

    entidad: 'ESSALUD',
    ruc: '20131257750',
    responsable: '',
    correo: '',
    telefono: '',

    // CAPACITACIÓN

    accionFormacion: '',
    tipoAccion: '',
    costoTotal: 0,
    cantidadBeneficiarios: 0,

    // DURACIÓN

    horasCapacitacion: 0,
    horasFueraJornada: 0,

    // EVALUACIÓN

    nivelEvaluacion: '',
    resultadoAprendizaje: '',
    resultadoAplicacion: '',

    // PROVEEDOR

    rucProveedor: '',
    proveedor: '',
    estadoContribuyente: '',
    condicionContribuyente: '',
    domicilioFiscal: '',
    actividadesEconomicas: '',
    sectorProveedor: '',

    // FINANCIAMIENTO

    financiamiento: '',
    montoCofinanciado: 0,

    // MODIFICACIÓN PDP

    modificacionPdp: '',
    informeOrh: '',
  };

  // BENEFICIARIOS

  beneficiarios = [
    {
      nombre: '',
      dni: '',
      genero: '',
      regimen: '',
      unidad: '',
      puesto: '',
    },
  ];

  ngOnInit() {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = (this.usuario?.nombre as string)?.charAt(0)?.toUpperCase() || 'U';
    this.tienePresupuesto = tieneRol(this.usuario, 'Presupuesto');
    this.tieneConvenios = tieneRol(this.usuario, 'Convenios');
    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);
    this.redFiltro = this.pdpData.getRedFiltro();
    this.cargarSolicitudes();
    this.cargarHistorial();
    this.cargarPresupuestoRed();
    this.cargarAlertasPersonal();
    this.cargarSindicatos();
  }

  // ── Sindicatos (para el formulario de capacitaciones de sindicato) ──
  cargarSindicatos() {
    this.pdpData.getSindicatos().subscribe({
      next: (lista) => (this.SINDICATOS_LISTA = lista.map((s) => s.nombre)),
      error: () => (this.SINDICATOS_LISTA = []),
    });
  }

  // ── Alertas de personal (cese / cambio de red) ────
  alertasPersonal: AlertaPersonal[] = [];

  cargarAlertasPersonal() {
    this.pdpData.getAlertasPersonal(undefined, this.redFiltro).subscribe({
      next: (alertas) => (this.alertasPersonal = alertas),
      error: () => (this.alertasPersonal = []),
    });
  }

  descripcionAlertaPersonal(a: AlertaPersonal): string {
    return a.tipo === 'CESE'
      ? `${a.nombre_completo} ya no pertenece al personal activo (capacitación ${a.codigo_act}).`
      : `${a.nombre_completo} cambió de red: ${a.red_anterior} → ${a.red_nueva} (capacitación ${a.codigo_act}).`;
  }

  resolverAlertaPersonal(a: AlertaPersonal) {
    if (!confirm('¿Marcar esta alerta como revisada?')) return;
    this.pdpData.resolverAlertaPersonal(a.id, this.usuario?.nombre || '').subscribe(() => {
      this.cargarAlertasPersonal();
    });
  }

  irARevisarAlertaPersonal(a: AlertaPersonal) {
    this.router.navigate(['/lista-participantes'], { queryParams: { codigo_act: a.codigo_act } });
  }

  cargarHistorial() {
    this.cargandoHistorial = true;
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const sedes: string[] = Array.isArray(usuario?.sedes) ? usuario.sedes : [];
    const red = sedes.join(',');
    const params = red ? `&red=${encodeURIComponent(red)}` : '';

    forkJoin([
      this.http.get<any[]>(`http://localhost:3001/api/solicitudes?estado=aprobado${params}`),
      this.http.get<any[]>(`http://localhost:3001/api/solicitudes?estado=denegado${params}`),
      this.http.get<any[]>(`http://localhost:3001/api/solicitudes?estado=observado${params}`),
      this.http.get<any[]>(`http://localhost:3001/api/solicitudes?estado=excluido${params}`),
    ]).subscribe({
      next: ([aprobadas, denegadas, observadas, excluidas]) => {
        this.historial = [...aprobadas, ...denegadas, ...observadas, ...excluidas].sort(
          (a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime(),
        );
        this.cargandoHistorial = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargandoHistorial = false;
      },
    });
  }

  abrirGestionDocumentos() {
    this.mostrarModalDocumentos = true;
    this.cargandoDocumentosGestion = true;
    this.pdpData.getDocumentos('').subscribe({
      next: (docs) => {
        this.documentosGestion = docs;
        this.cargandoDocumentosGestion = false;
      },
      error: () => {
        this.documentosGestion = [];
        this.cargandoDocumentosGestion = false;
      },
    });
  }

  cerrarGestionDocumentos() {
    this.mostrarModalDocumentos = false;
  }

  descargarDocumentoGestion(doc: any) {
    if (!doc.id) return;
    this.pdpData.descargarDocumento(doc.id).subscribe({
      next: (res) => window.open(res.url, '_blank'),
      error: () => alert('No se pudo generar el enlace de descarga.'),
    });
  }

  abrirEdicion(s: any) {
    const codigo = (s.datos?.codigoAct || '').trim();
    if (!codigo) return;

    this.errorEdicion = '';
    this.errorParticipanteEdicion = '';
    this.nuevoParticipanteEdicion = this.participanteVacioEdicion();
    this.cargandoEdicion = true;
    this.mostrarModalEditar = true;
    this.actividadEditando = null;
    this.participantesEditando = [];

    forkJoin({
      actividades: this.pdpData.getActividades(codigo, '', '', 1, 10),
      participantes: this.pdpData.getParticipantes('', codigo, 1, 500),
    }).subscribe({
      next: ({ actividades, participantes }) => {
        const act = actividades.data.find((a) => a.codigo_act === codigo) || actividades.data[0];
        this.actividadEditando = act ? { ...act } : null;
        this.participantesEditando = participantes.data;
        if (!this.actividadEditando) {
          this.errorEdicion = 'No se encontró el registro de esta actividad.';
        }
        this.cargandoEdicion = false;
      },
      error: () => {
        this.errorEdicion = 'Error al cargar los datos de la actividad.';
        this.cargandoEdicion = false;
      },
    });
  }

  cerrarEdicion() {
    this.mostrarModalEditar = false;
    this.actividadEditando = null;
    this.participantesEditando = [];
  }

  abrirSolicitudEdicion(s: any) {
    this.solicitudParaEdicion = s;
    this.seccionEdicion = '';
    this.mensajeEdicion = '';
    this.errorSolicitudEdicion = '';
    this.mostrarModalSolicitarEdicion = true;
  }

  cerrarSolicitudEdicion() {
    this.mostrarModalSolicitarEdicion = false;
    this.solicitudParaEdicion = null;
  }

  enviarSolicitudEdicion() {
    if (!this.seccionEdicion) {
      this.errorSolicitudEdicion = 'Selecciona qué sección debe corregir el ejecutor.';
      return;
    }
    this.enviandoSolicitudEdicion = true;
    this.errorSolicitudEdicion = '';
    this.http
      .post(
        `http://localhost:3001/api/solicitudes/${this.solicitudParaEdicion.id}/solicitar-edicion`,
        {
          seccion: this.seccionEdicion,
          mensaje: this.mensajeEdicion,
          sectorista_nombre: this.usuario.nombre,
        },
      )
      .subscribe({
        next: () => {
          this.enviandoSolicitudEdicion = false;
          this.cerrarSolicitudEdicion();
          alert(
            `Notificación enviada al ejecutor para que corrija el ${this.seccionEdicion === 'formulario' ? 'Formulario de Capacitación' : 'Registro de Participantes'}.`,
          );
        },
        error: () => {
          this.enviandoSolicitudEdicion = false;
          this.errorSolicitudEdicion = 'Error al enviar la notificación. Intente nuevamente.';
        },
      });
  }

  agregarParticipanteEdicion() {
    const p = this.nuevoParticipanteEdicion;
    if (!this.actividadEditando) return;
    if (!p.dni_ce.trim() || !p.apellidos.trim() || !p.nombre.trim()) {
      this.errorParticipanteEdicion = 'DNI/CE, Apellidos y Nombre son obligatorios.';
      return;
    }
    this.errorParticipanteEdicion = '';
    this.pdpData
      .crearParticipante({
        codigo_act: this.actividadEditando.codigo_act,
        red: this.actividadEditando.red_asistencial,
        ...p,
      })
      .subscribe({
        next: (nuevo) => {
          this.participantesEditando.push(nuevo);
          this.nuevoParticipanteEdicion = this.participanteVacioEdicion();
        },
        error: () => {
          this.errorParticipanteEdicion = 'No se pudo agregar al participante.';
        },
      });
  }

  quitarParticipanteEdicion(p: Participante) {
    if (!p.id) return;
    if (!confirm(`¿Quitar a ${p.apellidos} ${p.nombre} de la lista de participantes?`)) return;
    this.pdpData.eliminarParticipante(p.id).subscribe(() => {
      this.participantesEditando = this.participantesEditando.filter((x) => x.id !== p.id);
    });
  }

  guardarEdicionActividad() {
    if (!this.actividadEditando?.id) return;
    this.guardandoEdicion = true;
    this.errorEdicion = '';
    const payload: Actividad = {
      ...this.actividadEditando,
      total_participantes: this.participantesEditando.length,
      actor_nombre: this.usuario.nombre,
      actor_rol: this.usuario.rol,
    } as any;
    this.pdpData.actualizarActividad(this.actividadEditando.id, payload).subscribe({
      next: () => {
        this.guardandoEdicion = false;
        this.cerrarEdicion();
        this.cargarHistorial();
      },
      error: () => {
        this.guardandoEdicion = false;
        this.errorEdicion = 'No se pudo guardar la actividad.';
      },
    });
  }

  private normalizarRedKey(s: string): string {
    return (s || '')
      .toLowerCase()
      .replace(/^red (asistencial|prestacional)\s+/i, '')
      .replace(/^(ra|rp)\s+/i, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  cargarPresupuestoRed() {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const sedesRaw = usuario?.sedes;
    const sedes: string[] = Array.isArray(sedesRaw)
      ? sedesRaw
      : typeof sedesRaw === 'string' && sedesRaw
        ? sedesRaw.split(',').map((s: string) => s.trim())
        : [];

    const redesParam = sedes.length ? `?redes=${encodeURIComponent(sedes.join(','))}` : '';

    forkJoin({
      techos: this.http.get<any[]>('http://localhost:3001/api/presupuesto-redes'),
      ejecutados: this.http.get<any[]>(`http://localhost:3001/api/resumen-redes${redesParam}`),
    }).subscribe({
      next: ({ techos, ejecutados }) => {
        const misRedes = sedes.length
          ? techos.filter((p) =>
              sedes.some((s) => this.normalizarRedKey(s) === this.normalizarRedKey(p.red)),
            )
          : [];
        this.presupuestoMiRed = misRedes.map((p) => {
          const match = (ejecutados || []).find(
            (e) => this.normalizarRedKey(e.red) === this.normalizarRedKey(p.red),
          );
          const techo = Number(p.techo) || 0;
          const ejecutado = Number(match?.presupuesto) || 0;
          const saldo = techo - ejecutado;
          const pct = techo > 0 ? Math.min(100, Math.round((ejecutado / techo) * 100)) : 0;
          return { ...p, ejecutado, saldo, pct };
        });
        this.cdr.detectChanges();
      },
    });
  }

  cargarSolicitudes() {
    this.cargandoSolicitudes = true;
    this.cdr.detectChanges();

    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const sedes: string[] = Array.isArray(usuario?.sedes) ? usuario.sedes : [];
    const red = sedes.join(',');
    const url = red
      ? `http://localhost:3001/api/solicitudes?estado=pendiente&red=${encodeURIComponent(red)}`
      : `http://localhost:3001/api/solicitudes?estado=pendiente`;

    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.solicitudes = Array.isArray(data) ? data : [];
        this.cargandoSolicitudes = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargandoSolicitudes = false;
        this.cdr.detectChanges();
      },
    });
  }

  verSolicitud(s: any) {
    this.solicitudDetalle = this.solicitudDetalle?.id === s.id ? null : s;
    this.documentosDetalle = [];
    const codigo = this.solicitudDetalle?.datos?.codigoAct;
    if (codigo) {
      this.pdpData.getDocumentos(codigo).subscribe({
        next: (docs) => (this.documentosDetalle = docs),
        error: () => (this.documentosDetalle = []),
      });
    }
  }

  descargarDocumentoDetalle(doc: any) {
    if (!doc.id) return;
    this.pdpData.descargarDocumento(doc.id).subscribe({
      next: (res) => window.open(res.url, '_blank'),
      error: () => alert('No se pudo generar el enlace de descarga.'),
    });
  }

  aprobarSolicitud(s: any) {
    this.procesandoRevision = true;
    this.http
      .put(`http://localhost:3001/api/solicitudes/${s.id}/revisar`, {
        estado: 'aprobado',
        revisor_nombre: this.usuario.nombre,
        revisor_rol: this.usuario.rol,
      })
      .subscribe({
        next: () => {
          this.procesandoRevision = false;
          this.solicitudDetalle = null;
          this.cargarSolicitudes();
          this.cargarHistorial();
        },
        error: () => {
          this.procesandoRevision = false;
        },
      });
  }

  abrirModalRechazo(s: any) {
    this.solicitudADenegar = s;
    this.motivoRechazo = '';
    this.mostrarModalRechazo = true;
  }

  cerrarModalRechazo() {
    this.mostrarModalRechazo = false;
    this.solicitudADenegar = null;
    this.motivoRechazo = '';
  }

  confirmarRechazo() {
    if (!this.solicitudADenegar) return;
    this.procesandoRevision = true;
    this.http
      .put(`http://localhost:3001/api/solicitudes/${this.solicitudADenegar.id}/revisar`, {
        estado: 'observado',
        motivo_rechazo: this.motivoRechazo.trim() || 'Sin observación especificada',
        revisor_nombre: this.usuario.nombre,
        revisor_rol: this.usuario.rol,
      })
      .subscribe({
        next: () => {
          this.procesandoRevision = false;
          this.cerrarModalRechazo();
          this.solicitudDetalle = null;
          this.cargarSolicitudes();
          this.cargarHistorial();
        },
        error: () => {
          this.procesandoRevision = false;
        },
      });
  }

  excluirSolicitud(s: any) {
    if (
      !confirm(
        `¿Excluir la solicitud "${s.datos?.nombreActividad || 'esta actividad'}"?\n\nSe notificará al ejecutor por correo.`,
      )
    )
      return;
    this.procesandoRevision = true;
    this.http
      .put(`http://localhost:3001/api/solicitudes/${s.id}/revisar`, {
        estado: 'excluido',
        revisor_nombre: this.usuario.nombre,
        revisor_rol: this.usuario.rol,
      })
      .subscribe({
        next: () => {
          this.procesandoRevision = false;
          this.solicitudDetalle = null;
          this.cargarSolicitudes();
          this.cargarHistorial();
        },
        error: () => {
          this.procesandoRevision = false;
        },
      });
  }

  irA(ruta: string) {
    if (ruta === '/busqueda-expediente') {
      this.abrirBusqueda();
    } else {
      this.router.navigate([ruta]);
    }
  }

  togglePerfilMenu() {
    this.mostrarPerfilMenu = !this.mostrarPerfilMenu;
  }

  irAPresupuesto() {
    this.router.navigate(['/presupuesto']);
  }

  irAConvenios() {
    this.router.navigate(['/convenios']);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  exportandoExcel = false;

  formatFecha(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day = d.getUTCDate();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = String(d.getUTCFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  async exportarExcel() {
    if (this.exportandoExcel) return;
    this.exportandoExcel = true;

    try {
      // Trae TODAS las capacitaciones de datos_actividad para las redes del sectorista
      const res = await firstValueFrom(
        this.pdpData.getActividades('', this.redFiltro, '', 1, 9999),
      );
      const actividades = res.data;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sistema PDP EsSalud';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Capacitaciones PDP', {
        pageSetup: { orientation: 'landscape', fitToPage: true },
      });

      const AZUL = '1F3864';
      const NARANJA = 'C55A11';
      const AZUL2 = '305496';

      type ColDef = { header: string; width: number; color: string };
      const columnas: ColDef[] = [
        { header: 'CODIGO ACT.', width: 14, color: AZUL },
        { header: 'FECHA DE INICIO', width: 14, color: AZUL },
        { header: 'FECHA DE FIN', width: 14, color: AZUL },
        { header: 'MES DE TERMINO DE EJECUCIÓN', width: 16, color: AZUL },
        { header: 'RED ASISTENCIAL / UNIDAD ORGANICA SOLICITANTE', width: 28, color: AZUL },
        { header: 'SERVICIO / ÁREA SOLICITANTE', width: 28, color: AZUL },
        { header: 'NOMBRE DE LA ACTIVIDAD DE CAPACITACIÓN', width: 40, color: AZUL },
        { header: 'TOTAL NUMERO HORAS EJECUTADAS (cronológicas)', width: 18, color: AZUL },
        {
          header: 'NUMERO HORAS EJECUTADAS FUERA DEL HORARIO LABORAL (cronológicas)',
          width: 22,
          color: AZUL,
        },
        { header: 'FRECUENCIA DE DESARROLLO DE LA ACTIVIDAD', width: 18, color: AZUL },
        { header: 'HORA DE INICIO DE LA ACTIVIDAD', width: 14, color: AZUL },
        { header: 'HORA DE TERMINO DE LA ACTIVIDAD', width: 14, color: AZUL },
        { header: 'MODALIDAD', width: 16, color: AZUL },
        { header: 'PUBLICO', width: 16, color: AZUL },
        { header: 'NIVEL DE EVALUACION EJECUTADO', width: 22, color: NARANJA },
        { header: 'OBJETIVO ESTRATEGICO VINCULADO', width: 36, color: NARANJA },
        { header: 'TOTAL DE PARTICIPANTES (PLANILLA)', width: 16, color: AZUL2 },
        { header: 'RUC DEL PROVEEDOR ADJUDICADO', width: 18, color: NARANJA },
        { header: 'NOMBRE DEL PROVEEDOR ADJUDICADO', width: 36, color: NARANJA },
        {
          header: 'SECTOR AL QUE PERTENECE EL PROVEEDOR (PÚBLICO O PRIVADO)',
          width: 20,
          color: AZUL,
        },
        { header: 'PRESUPUESTO EJECUTADO', width: 18, color: AZUL },
        { header: 'EJE TEMATICO', width: 24, color: AZUL },
      ];

      sheet.columns = columnas.map((c) => ({ width: c.width }));

      // Fila de encabezado
      const headerRow = sheet.addRow(columnas.map((c) => c.header));
      headerRow.height = 50;
      headerRow.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
        const col = columnas[colNumber - 1];
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + col.color } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
          bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
          left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
          right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        };
      });

      // Filas de datos desde datos_actividad
      actividades.forEach((a, idx) => {
        const fondo = idx % 2 === 0 ? 'FFFFFFFF' : 'FFD9E1F2';
        const dataRow = sheet.addRow([
          a.codigo_act ?? '',
          this.formatFecha(a.fecha_inicio),
          this.formatFecha(a.fecha_fin),
          a.mes_termino ?? '',
          a.red_asistencial ?? '',
          a.servicio_area ?? '',
          a.nombre_actividad ?? '',
          a.total_horas ?? '',
          a.horas_fuera_horario ?? '',
          a.frecuencia ?? '',
          a.hora_inicio ?? '',
          a.hora_termino ?? '',
          a.modalidad ?? '',
          a.publico ?? '',
          a.nivel_evaluacion ?? '',
          a.objetivo_estrategico ?? '',
          a.total_participantes ?? '',
          a.ruc_proveedor ?? '',
          a.nombre_proveedor ?? '',
          a.sector_proveedor ?? '',
          a.presupuesto_ejecutado ?? '',
          a.eje_tematico ?? '',
        ]);
        dataRow.height = 40;
        dataRow.eachCell((cell: ExcelJS.Cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
          cell.font = { size: 9, name: 'Calibri' };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD0D7E8' } },
            bottom: { style: 'thin', color: { argb: 'FFD0D7E8' } },
            left: { style: 'thin', color: { argb: 'FFD0D7E8' } },
            right: { style: 'thin', color: { argb: 'FFD0D7E8' } },
          };
        });
      });

      // Descarga
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const red = this.redFiltro.split(',')[0].trim() || 'RED';
      link.href = url;
      link.download = `Capacitaciones_PDP_${red}_${new Date().getFullYear()}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      this.exportandoExcel = false;
    }
  }

  // BÚSQUEDA DE CAPACITACIONES
  abrirBusqueda() {
    this.textoBusqueda = '';
    this.codigoBusqueda = '';
    this.actividadDetalle = null;
    this.mostrarBusqueda = true;
    this.buscarActividades();
  }

  buscarActividades() {
    this.cargandoAct = true;
    const q = this.codigoBusqueda.trim() || this.textoBusqueda.trim();
    this.pdpData.getActividades(q, this.redFiltro, '', 1, 100).subscribe({
      next: (res) => {
        this.actividades = res.data;
        this.totalActividades = res.total;
        this.cargandoAct = false;
      },
      error: () => {
        this.cargandoAct = false;
      },
    });
  }

  cerrarBusqueda() {
    this.mostrarBusqueda = false;
    this.actividadDetalle = null;
  }

  verDetalle(act: any) {
    this.actividadDetalle = this.actividadDetalle?.id === act.id ? null : act;
  }

  onRucChange(ruc: string) {
    this.errorRuc = '';
    this.matriz.proveedor = '';
    this.matriz.estadoContribuyente = '';
    this.matriz.condicionContribuyente = '';
    this.matriz.domicilioFiscal = '';
    this.matriz.actividadesEconomicas = '';

    if (ruc.length === 11) {
      this.buscarRuc(ruc);
    }
  }

  buscarRuc(ruc: string) {
    this.cargandoRuc = true;

    this.http.get<any>(`http://localhost:3001/api/sunat/ruc?numero=${ruc}`).subscribe({
      next: (data) => {
        this.cargandoRuc = false;
        this.matriz.proveedor = data.razon_social || data.razonSocial || '';
        this.matriz.estadoContribuyente = data.estado || '';
        this.matriz.condicionContribuyente = data.condicion || '';
        this.matriz.domicilioFiscal =
          data['dirección'] || data.direccion || data.direccion_completa || '';
        this.matriz.actividadesEconomicas = Array.isArray(data.actividadesEconomicas)
          ? data.actividadesEconomicas.map((a: any) => a.descripcion).join('; ')
          : '';
      },
      error: () => {
        this.cargandoRuc = false;
        this.errorRuc = 'No se encontró información para este RUC. Verifique el número ingresado.';
      },
    });
  }

  agregarBeneficiario() {
    this.beneficiarios.push({
      nombre: '',
      dni: '',
      genero: '',
      regimen: '',
      unidad: '',
      puesto: '',
    });

    this.matriz.cantidadBeneficiarios = this.beneficiarios.length;
  }

  eliminarBeneficiario(index: number) {
    if (this.beneficiarios.length > 1) {
      this.beneficiarios.splice(index, 1);

      this.matriz.cantidadBeneficiarios = this.beneficiarios.length;
    }
  }

  // SINDICATOS ─────────────────────────────────────────────────────────────
  seccionActiva: 'inicio' | 'sindicatos' = 'inicio';

  sindicatoSeleccionado = '';
  guardandoSindicato = false;
  errorSindicatoForm = '';
  capacitacionesSindicato: any[] = [];
  cargandoCapacitacionesSindicato = false;
  filtroSindicatoLista = '';
  errorParticipanteSindicatoDni = ''; // estado de "ya registrado en otra capacitación"

  // Se carga desde /api/sindicatos (tabla `sindicatos`) en ngOnInit.
  SINDICATOS_LISTA: string[] = [];

  filtroRedSolicitudes = '';
  filtroRedHistorial = '';

  get solicitudesFiltradas(): any[] {
    if (!this.filtroRedSolicitudes) return this.solicitudes;
    const k = this.normalizarRedKey(this.filtroRedSolicitudes);
    return this.solicitudes.filter((s) => this.normalizarRedKey(s.red_asistencial) === k);
  }

  get historialFiltrado(): any[] {
    if (!this.filtroRedHistorial) return this.historial;
    const k = this.normalizarRedKey(this.filtroRedHistorial);
    return this.historial.filter((s) => this.normalizarRedKey(s.red_asistencial) === k);
  }

  get redesDisponibles(): string[] {
    return this.redFiltro
      ? this.redFiltro
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : [];
  }

  formularioSindicato = this.formSindicatoVacio();
  participantesSindicato: any[] = [];
  nuevoParticipanteSindicato = this.participanteVacioEdicion();
  errorParticipanteSindicato = '';

  formSindicatoVacio() {
    return {
      sindicato: '',
      codigoAct: '',
      fechaInicio: '',
      fechaFin: '',
      mesTermino: '',
      redAsistencial: '',
      servicioArea: '',
      nombreActividad: '',
      totalHoras: null as number | null,
      horasFueraHorario: null as number | null,
      frecuencia: '',
      horaInicio: '',
      horaTermino: '',
      modalidad: '',
      publico: '',
      nivelEvaluacion: '',
      totalParticipantes: null as number | null,
      ejeTematico: '',
      objetivoEstrategico: '',
      rucProveedor: '',
      nombreProveedor: '',
      sectorProveedor: '',
      presupuestoEjecutado: null as number | null,
    };
  }

  cambiarSeccion(s: 'inicio' | 'sindicatos') {
    this.seccionActiva = s;
    if (s === 'sindicatos') this.cargarCapacitacionesSindicato();
  }

  cargarCapacitacionesSindicato() {
    this.cargandoCapacitacionesSindicato = true;
    const qs = this.filtroSindicatoLista ? `?sindicato=${encodeURIComponent(this.filtroSindicatoLista)}` : '';
    this.http.get<any[]>(`http://localhost:3001/api/capacitaciones-sindicato${qs}`).subscribe({
      next: (rows) => {
        this.capacitacionesSindicato = rows.map((r) => ({
          sindicato: r.sindicato,
          codigoAct: r.codigo_act,
          nombreActividad: r.nombre_actividad,
          redAsistencial: r.red_asistencial,
          modalidad: r.modalidad,
          fechaInicio: r.fecha_inicio,
          fechaFin: r.fecha_fin,
          totalParticipantes: r.total_participantes,
          presupuestoEjecutado: r.presupuesto_ejecutado,
        }));
        this.cargandoCapacitacionesSindicato = false;
      },
      error: () => (this.cargandoCapacitacionesSindicato = false),
    });
  }

  actualizarMesTerminoSindicato() {
    if (!this.formularioSindicato.fechaFin) return;
    const meses = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    const d = new Date(this.formularioSindicato.fechaFin + 'T00:00:00');
    this.formularioSindicato.mesTermino = meses[d.getMonth()] ?? '';
  }

  agregarParticipanteSindicato() {
    const p = this.nuevoParticipanteSindicato;
    if (!p.dni_ce.trim() || !p.apellidos.trim() || !p.nombre.trim()) {
      this.errorParticipanteSindicato = 'DNI/CE, Apellidos y Nombre son obligatorios.';
      return;
    }
    if (this.participantesSindicato.some((x) => x.dni_ce === p.dni_ce.trim())) {
      this.errorParticipanteSindicato = 'Ese DNI ya está en la lista de esta capacitación.';
      return;
    }
    this.errorParticipanteSindicato = '';
    // Un participante no puede estar ya en OTRA capacitación (regla general del sistema).
    this.http
      .get<{ registrado: boolean; nombre_actividad?: string }>(
        `http://localhost:3001/api/participantes/verificar-dni/${p.dni_ce.trim()}`,
      )
      .subscribe({
        next: (r) => {
          if (r.registrado) {
            this.errorParticipanteSindicato = `${p.apellidos} ${p.nombre} ya está registrado en "${r.nombre_actividad}". No puede estar en más de una capacitación.`;
            return;
          }
          this.participantesSindicato.push({ ...p });
          this.nuevoParticipanteSindicato = this.participanteVacioEdicion();
        },
        // Si falla la verificación no se bloquea al usuario — el backend
        // igual revalida todo al guardar la capacitación completa.
        error: () => {
          this.participantesSindicato.push({ ...p });
          this.nuevoParticipanteSindicato = this.participanteVacioEdicion();
        },
      });
  }

  quitarParticipanteSindicato(idx: number) {
    this.participantesSindicato.splice(idx, 1);
  }

  guardarCapacitacionSindicato() {
    this.errorSindicatoForm = '';
    const f = this.formularioSindicato;

    if (!f.sindicato) {
      this.errorSindicatoForm = 'Seleccione un sindicato.';
      return;
    }
    if (!f.codigoAct.trim()) {
      this.errorSindicatoForm = 'El código de actividad es obligatorio.';
      return;
    }
    if (!f.nombreActividad.trim()) {
      this.errorSindicatoForm = 'El nombre de la actividad es obligatorio.';
      return;
    }
    if (!f.fechaInicio) {
      this.errorSindicatoForm = 'La fecha de inicio es obligatoria.';
      return;
    }
    if (!f.redAsistencial) {
      this.errorSindicatoForm = 'Seleccione una red asistencial.';
      return;
    }

    if (this.participantesSindicato.length === 0) {
      this.errorSindicatoForm = 'Agregue al menos un participante.';
      return;
    }

    this.guardandoSindicato = true;
    const payload = {
      ...f,
      participantes: [...this.participantesSindicato],
      actor_nombre: this.usuario?.nombre || '',
    };

    this.http.post('http://localhost:3001/api/capacitaciones-sindicato', payload).subscribe({
      next: () => {
        this.guardandoSindicato = false;
        this.formularioSindicato = this.formSindicatoVacio();
        this.participantesSindicato = [];
        this.cargarCapacitacionesSindicato();
      },
      error: (err) => {
        this.guardandoSindicato = false;
        this.errorSindicatoForm = err.error?.error || 'No se pudo registrar la capacitación.';
      },
    });
  }

  guardarMatriz() {
    this.errorFormulario = '';
    this.camposError = {};

    const errores: string[] = [];

    // Limpiar errores anteriores
    this.camposError = {};

    // Datos Generales
    if (!this.matriz.responsable.trim()) {
      errores.push('Responsable ORH');
      this.camposError['responsable'] = true;
    }

    if (!this.matriz.correo.trim()) {
      errores.push('Correo ORH');
      this.camposError['correo'] = true;
    }

    if (!this.matriz.telefono.trim()) {
      errores.push('Teléfono');
      this.camposError['telefono'] = true;
    }

    // Capacitación
    if (!this.matriz.accionFormacion.trim()) {
      errores.push('Acción de Formación');
      this.camposError['accionFormacion'] = true;
    }

    if (!this.matriz.tipoAccion) {
      errores.push('Tipo de Acción');
      this.camposError['tipoAccion'] = true;
    }

    if (!this.matriz.costoTotal || this.matriz.costoTotal <= 0) {
      errores.push('Costo Total');
      this.camposError['costoTotal'] = true;
    }

    // Duración
    if (!this.matriz.horasCapacitacion || this.matriz.horasCapacitacion <= 0) {
      errores.push('Horas de capacitación');
      this.camposError['horasCapacitacion'] = true;
    }

    // Evaluación
    if (!this.matriz.nivelEvaluacion) {
      errores.push('Nivel de Evaluación');
      this.camposError['nivelEvaluacion'] = true;
    }

    if (!this.matriz.resultadoAprendizaje.trim()) {
      errores.push('Resultado de aprendizaje');
      this.camposError['resultadoAprendizaje'] = true;
    }

    if (!this.matriz.resultadoAplicacion.trim()) {
      errores.push('Resultado de aplicación');
      this.camposError['resultadoAplicacion'] = true;
    }

    // Proveedor
    if (!this.matriz.rucProveedor || this.matriz.rucProveedor.length !== 11) {
      errores.push('RUC Proveedor (11 dígitos)');
      this.camposError['rucProveedor'] = true;
    }

    if (!this.matriz.proveedor.trim()) {
      errores.push('Nombre del Proveedor');
      this.camposError['proveedor'] = true;
    }

    if (!this.matriz.sectorProveedor) {
      errores.push('Sector del Proveedor');
      this.camposError['sectorProveedor'] = true;
    }

    // Financiamiento
    if (!this.matriz.financiamiento) {
      errores.push('Financiamiento');
      this.camposError['financiamiento'] = true;
    }

    if (
      this.matriz.montoCofinanciado === null ||
      this.matriz.montoCofinanciado === undefined ||
      this.matriz.montoCofinanciado <= 0
    ) {
      errores.push('Monto Cofinanciado');
      this.camposError['montoCofinanciado'] = true;
    }

    // Beneficiarios
    this.beneficiarios.forEach((b, i) => {
      if (
        !b.nombre.trim() ||
        !b.dni.trim() ||
        !b.genero ||
        !b.regimen.trim() ||
        !b.unidad.trim() ||
        !b.puesto.trim()
      ) {
        errores.push(`Beneficiario #${i + 1}: complete todos los campos`);
      }
    });

    // Modificación PDP
    if (this.matriz.modificacionPdp !== 'No' && !this.matriz.informeOrh.trim()) {
      errores.push('Informe ORH (requerido al haber modificación)');
      this.camposError['informeOrh'] = true;
    }
    console.log(this.camposError);
    if (errores.length > 0) {
      this.errorFormulario = errores.map((error) => `• ${error}`).join('\n');

      setTimeout(() => {
        document.querySelector('.error-validacion')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 50);

      return;
    }

    this.matriz.cantidadBeneficiarios = this.beneficiarios.length;

    localStorage.setItem('matrizPdp', JSON.stringify(this.matriz));

    localStorage.setItem('beneficiariosPdp', JSON.stringify(this.beneficiarios));

    alert(' Registro exitoso.\n\nLa Matriz de Ejecución PDP fue almacenada correctamente.');
  } // <- cierra guardarMatriz()
} // <- cierra la clase Sectorista
