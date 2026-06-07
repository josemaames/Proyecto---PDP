import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatrizDncService } from '../../services/matriz-dnc.service';
import { PdpDataService, Actividad } from '../../services/pdp-data.service';

@Component({
  selector: 'app-ejecutor',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './ejecutor.html',
  styleUrl: './ejecutor.css',
})
export class Ejecutor implements OnInit {
  private router          = inject(Router);
  private matrizDncService = inject(MatrizDncService);
  private http            = inject(HttpClient);
  private pdpData         = inject(PdpDataService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';
  buscandoRuc = false;
  errorRuc = '';

  // ── Tabla de actividades ───────────────────────
  actividades: Actividad[] = [];
  busquedaAct  = '';
  paginaAct    = 1;
  limitAct     = 50;
  totalAct     = 0;
  cargandoAct  = false;

  get totalPaginasAct(): number {
    return Math.max(1, Math.ceil(this.totalAct / this.limitAct));
  }

  // ── Formulario nueva actividad ─────────────────
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
    this.usuario       = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = this.usuario?.nombre?.charAt(0)?.toUpperCase() || 'U';
    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

    this.cargarActividades();
  }

  cargarActividades() {
    this.cargandoAct = true;
    this.pdpData.getActividades(this.busquedaAct, '', '', this.paginaAct, this.limitAct)
      .subscribe({
        next: (res) => {
          this.actividades  = res.data;
          this.totalAct     = res.total;
          this.cargandoAct  = false;
        },
        error: (err) => {
          console.error('Error al cargar actividades:', err);
          this.cargandoAct = false;
        }
      });
  }

  buscarAct() {
    this.paginaAct = 1;
    this.cargarActividades();
  }

  paginaActAnterior() {
    if (this.paginaAct > 1) { this.paginaAct--; this.cargarActividades(); }
  }

  paginaActSiguiente() {
    if (this.paginaAct < this.totalPaginasAct) { this.paginaAct++; this.cargarActividades(); }
  }

  irA(ruta: string) { this.router.navigate([ruta]); }

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
    this.http.get<any>(`https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`).subscribe({
      next: (data) => {
        this.formulario.nombreProveedor = data.nombre || '';
        this.buscandoRuc = false;
      },
      error: () => {
        this.errorRuc = 'No se encontró información para ese RUC.';
        this.buscandoRuc = false;
      },
    });
  }

  guardarFormulario() {
    const f = this.formulario;
    this.pdpData.crearActividad({
      codigo_act:           f.codigoAct,
      fecha_inicio:         f.fechaInicio || undefined,
      fecha_fin:            f.fechaFin || undefined,
      mes_termino:          f.mesTermino,
      red_asistencial:      f.redAsistencial,
      servicio_area:        f.servicioArea,
      nombre_actividad:     f.nombreActividad,
      total_horas:          f.totalHoras || undefined,
      horas_fuera_horario:  f.horasFueraHorario || undefined,
      frecuencia:           f.frecuencia,
      hora_inicio:          f.horaInicio || undefined,
      hora_termino:         f.horaTermino || undefined,
      modalidad:            f.modalidad,
      publico:              f.publico,
      nivel_evaluacion:     f.nivelEvaluacion,
      objetivo_estrategico: '',
      total_participantes:  f.totalParticipantes || undefined,
      ruc_proveedor:        f.rucProveedor,
      nombre_proveedor:     f.nombreProveedor,
      sector_proveedor:     f.sectorProveedor,
      presupuesto_ejecutado: f.presupuestoEjecutado || undefined,
      eje_tematico:         f.ejeTematico,
    }).subscribe({
      next: () => {
        alert('✅ Formulario guardado correctamente');
        this.cargarActividades();
      },
      error: () => alert('❌ Error al guardar el formulario'),
    });
  }
}
