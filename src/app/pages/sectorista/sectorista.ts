import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { ExpedienteService } from '../../services/expediente.service';
import { PdpDataService } from '../../services/pdp-data.service';

@Component({
  selector: 'app-sectorista',
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './sectorista.html',
  styleUrl: './sectorista.css',
})
export class Sectorista implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private expedienteService = inject(ExpedienteService);
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
