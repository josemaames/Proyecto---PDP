import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { PdpDataService, Actividad, Participante } from '../../services/pdp-data.service';

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
    ]).subscribe({
      next: ([aprobadas, denegadas]) => {
        this.historial = [...aprobadas, ...denegadas].sort(
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
    };
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

    this.http.get<any[]>('http://localhost:3001/api/presupuesto-redes').subscribe({
      next: (data) => {
        this.presupuestoMiRed = sedes.length
          ? data.filter((p) =>
              sedes.some((s) => this.normalizarRedKey(s) === this.normalizarRedKey(p.red)),
            )
          : [];
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
      .put(`http://localhost:3001/api/solicitudes/${s.id}/revisar`, { estado: 'aprobado' })
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
        estado: 'denegado',
        motivo_rechazo: this.motivoRechazo.trim() || 'Sin motivo especificado',
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

  irA(ruta: string) {
    if (ruta === '/busqueda-expediente') {
      this.abrirBusqueda();
    } else {
      this.router.navigate([ruta]);
    }
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
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

    alert('✅ Registro exitoso.\n\nLa Matriz de Ejecución PDP fue almacenada correctamente.');
  } // <- cierra guardarMatriz()
} // <- cierra la clase Sectorista
