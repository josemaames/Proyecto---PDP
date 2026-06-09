import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatrizDncService } from '../../services/matriz-dnc.service';
import { ExpedienteService } from '../../services/expediente.service';

@Component({
  selector: 'app-ejecutor',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './ejecutor.html',
  styleUrl: './ejecutor.css',
})
export class Ejecutor implements OnInit {
  private router = inject(Router);
  private matrizDncService = inject(MatrizDncService);
  private http = inject(HttpClient);
  private expedienteService = inject(ExpedienteService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';
  buscandoRuc = false;
  errorRuc = '';
  errorFormulario = '';
  camposInvalidos: string[] = [];

  // BÚSQUEDA DE EXPEDIENTES
  mostrarBusqueda = false;
  textoBusqueda = '';
  expedientes: any[] = [];
  expedienteDetalle: any = null;

  // TABLA DE ACTIVIDADES
  actividades: any[] = [];
  busquedaAct = '';
  paginaAct = 1;
  limitAct = 50;
  totalAct = 0;
  cargandoAct = false;

  get totalPaginasAct(): number {
    return Math.max(1, Math.ceil(this.totalAct / this.limitAct));
  }

  formulario = {
    codigoAct: '',
    fechaInicio: '',
    fechaFin: '',
    mesTermino: '',
    redAsistencial: '',
    servicioArea: '',
    nombreActividad: '',
    totalHoras: 0,
    horasFueraHorario: 0,
    frecuencia: '',
    horaInicio: '',
    horaTermino: '',
    modalidad: '',
    publico: '',
    nivelEvaluacion: '',
    totalParticipantes: 0,
    ejeTematico: '',
    rucProveedor: '',
    nombreProveedor: '',
    sectorProveedor: '',
    presupuestoEjecutado: 0,
  };

  ngOnInit() {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

    this.inicialUsuario = this.usuario?.nombre?.charAt(0)?.toUpperCase() || 'U';

    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

    this.cargarActividades();
  }

  abrirBusqueda() {
    this.expedientes = this.expedienteService.getExpedientesPorRol();

    console.log('EXPEDIENTES EJECUTOR:', this.expedientes);

    this.textoBusqueda = '';
    this.expedienteDetalle = null;
    this.mostrarBusqueda = true;
  }

  cerrarBusqueda() {
    this.mostrarBusqueda = false;
    this.expedienteDetalle = null;
  }

  verDetalleExpediente(exp: any) {
    this.expedienteDetalle = exp;
  }

  get expedientesFiltrados(): any[] {
    const texto = this.textoBusqueda.toLowerCase().trim();

    if (!texto) {
      return this.expedientes;
    }

    return this.expedientes.filter(
      (e) =>
        e.expediente.toLowerCase().includes(texto) ||
        e.capacitacion.toLowerCase().includes(texto) ||
        e.responsable.toLowerCase().includes(texto) ||
        e.estado.toLowerCase().includes(texto),
    );
  }

  cargarActividades() {
    this.actividades = [];
    this.totalAct = 0;
    this.cargandoAct = false;
  }

  buscarAct() {
    this.paginaAct = 1;
  }

  paginaActAnterior() {
    if (this.paginaAct > 1) {
      this.paginaAct--;
    }
  }

  paginaActSiguiente() {
    if (this.paginaAct < this.totalPaginasAct) {
      this.paginaAct++;
    }
  }

  irA(ruta: string) {
    if (ruta === '/busqueda-expediente') {
      this.abrirBusqueda();
      return;
    }

    this.router.navigate([ruta]);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  buscarRuc() {
    const ruc = this.formulario.rucProveedor.trim();

    if (ruc.length !== 11 || !/^\d+$/.test(ruc)) {
      this.errorRuc = 'El RUC debe tener exactamente 11 dígitos numéricos.';
      return;
    }

    this.errorRuc = '';
    this.buscandoRuc = true;

    this.http.get<any>(`http://localhost:3001/api/sunat/ruc?numero=${ruc}`).subscribe({
      next: (data) => {
        this.formulario.nombreProveedor = data.razon_social || data.razonSocial || data.nombre || '';
        this.buscandoRuc = false;
      },
      error: () => {
        this.errorRuc = 'No se encontró información para ese RUC.';
        this.buscandoRuc = false;
      },
    });
  }

  guardarFormulario() {
    this.errorFormulario = '';
    this.camposInvalidos = [];

    const f = this.formulario;
    const errores: string[] = [];

    if (!f.codigoAct.trim())         errores.push('Código de actividad');
    if (!f.fechaInicio)               errores.push('Fecha de inicio');
    if (!f.fechaFin)                  errores.push('Fecha de finalización');
    if (!f.mesTermino)                errores.push('Mes de término');
    if (!f.redAsistencial.trim())     errores.push('Red asistencial / Unidad orgánica');
    if (!f.nombreActividad.trim())    errores.push('Nombre de la actividad');
    if (!f.totalHoras || f.totalHoras <= 0) errores.push('Total horas ejecutadas');
    if (!f.frecuencia)                errores.push('Frecuencia de desarrollo');
    if (!f.modalidad)                 errores.push('Modalidad');
    if (!f.nivelEvaluacion)           errores.push('Nivel de evaluación');
    if (!f.totalParticipantes || f.totalParticipantes <= 0) errores.push('Total de participantes');

    if (errores.length > 0) {
      this.camposInvalidos = errores;
      this.errorFormulario = 'Debe completar los siguientes campos obligatorios:';
      setTimeout(() => {
        document.querySelector('.error-formulario-ej')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    alert('✅ Formulario guardado correctamente');
  }
}
