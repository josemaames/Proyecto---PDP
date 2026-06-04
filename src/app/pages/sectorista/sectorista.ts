import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ExpedienteService } from '../../services/expediente.service';

@Component({
  selector: 'app-sectorista',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './sectorista.html',
  styleUrl: './sectorista.css',
})
export class Sectorista implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private expedienteService = inject(ExpedienteService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';

  cargandoRuc = false;
  errorRuc = '';
  errorFormulario = '';

  // BÚSQUEDA DE EXPEDIENTES
  mostrarBusqueda = false;
  textoBusqueda = '';
  expedientes: any[] = [];
  expedienteDetalle: any = null;

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

    financiamiento: 'Sí',
    montoCofinanciado: 0,

    // MODIFICACIÓN PDP

    modificacionPdp: 'No',
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
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);
    this.expedientes = this.expedienteService.getExpedientes();
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

  // BÚSQUEDA DE EXPEDIENTES
  abrirBusqueda() {
    this.expedientes = this.expedienteService.getExpedientes();
    this.textoBusqueda = '';
    this.expedienteDetalle = null;
    this.mostrarBusqueda = true;
  }

  cerrarBusqueda() {
    this.mostrarBusqueda = false;
    this.expedienteDetalle = null;
  }

  get expedientesFiltrados(): any[] {
    const texto = this.textoBusqueda.toLowerCase().trim();
    if (!texto) return this.expedientes;
    return this.expedientes.filter(e =>
      e.expediente.toLowerCase().includes(texto) ||
      e.capacitacion.toLowerCase().includes(texto) ||
      e.responsable.toLowerCase().includes(texto) ||
      e.estado.toLowerCase().includes(texto)
    );
  }

  verDetalleExpediente(exp: any) {
    this.expedienteDetalle = exp;
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

    this.http.get<any>(`/api/sunat/ruc?numero=${ruc}`).subscribe({
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
    const errores: string[] = [];

    // Datos Generales
    if (!this.matriz.responsable.trim())        errores.push('Responsable ORH');
    if (!this.matriz.correo.trim())             errores.push('Correo ORH');
    if (!this.matriz.telefono.trim())           errores.push('Teléfono');

    // Capacitación
    if (!this.matriz.accionFormacion.trim())    errores.push('Acción de Formación');
    if (!this.matriz.tipoAccion)                errores.push('Tipo de Acción');
    if (!this.matriz.costoTotal || this.matriz.costoTotal <= 0) errores.push('Costo Total');

    // Duración
    if (!this.matriz.horasCapacitacion || this.matriz.horasCapacitacion <= 0)
      errores.push('Horas de capacitación');

    // Evaluación
    if (!this.matriz.nivelEvaluacion)           errores.push('Nivel de Evaluación');
    if (!this.matriz.resultadoAprendizaje.trim()) errores.push('Resultado de aprendizaje');
    if (!this.matriz.resultadoAplicacion.trim())  errores.push('Resultado de aplicación');

    // Proveedor
    if (!this.matriz.rucProveedor || this.matriz.rucProveedor.length !== 11)
      errores.push('RUC Proveedor (11 dígitos)');
    if (!this.matriz.proveedor.trim())          errores.push('Nombre del Proveedor');
    if (!this.matriz.sectorProveedor)           errores.push('Sector del Proveedor');

    // Beneficiarios
    this.beneficiarios.forEach((b, i) => {
      if (!b.nombre.trim() || !b.dni.trim() || !b.genero || !b.regimen.trim() || !b.unidad.trim() || !b.puesto.trim())
        errores.push(`Beneficiario #${i + 1}: complete todos los campos`);
    });

    // Modificación PDP
    if (this.matriz.modificacionPdp !== 'No' && !this.matriz.informeOrh.trim())
      errores.push('Informe ORH (requerido al haber modificación)');

    if (errores.length > 0) {
      this.errorFormulario = 'Campos incompletos: ' + errores.join(', ') + '.';
      setTimeout(() => {
        document.querySelector('.error-formulario')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    this.matriz.cantidadBeneficiarios = this.beneficiarios.length;
    localStorage.setItem('matrizPdp', JSON.stringify(this.matriz));
    localStorage.setItem('beneficiariosPdp', JSON.stringify(this.beneficiarios));
    alert('✅ Registro exitoso.\n\nLa Matriz de Ejecución PDP fue almacenada correctamente.');
  }
}
