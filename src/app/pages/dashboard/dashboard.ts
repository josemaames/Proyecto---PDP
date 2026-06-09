import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { Subject, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { ExpedienteService } from '../../services/expediente.service';
import { PdpDataService } from '../../services/pdp-data.service';

type ResumenRed = {
  red: string;
  capacitaciones: number;
  horas: number;
  participantes: number;
  presupuesto: number;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, DecimalPipe, BaseChartDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private destroy$      = new Subject<void>();
  private busquedaSubject = new Subject<string>();

  nombre = '';
  rol = '';
  usuarioActual: any;
  esAdministrador = false;
  esSectorista = false;
  esEjecutor = false;
  fechaHoy = '';
  inicialUsuario = 'U';
  menuItems: string[] = [];

  // ── Perfil / Contraseña ───────────────────────
  mostrarHistorial = false;
  mostrarEditarPerfil = false;
  mostrarCambiarPassword = false;

  perfilEditado = { nombre: '', correo: '', telefono: '' };
  passwordData = { actual: '', nueva: '', confirmar: '' };
  historial: any[] = [];
  filtroHistorial = '';

  get historialFiltrado(): any[] {
    const t = this.filtroHistorial.toLowerCase().trim();
    if (!t) return this.historial;
    return this.historial.filter(
      (e) =>
        e.expediente?.toLowerCase().includes(t) ||
        e.usuario?.toLowerCase().includes(t) ||
        e.accion?.toLowerCase().includes(t) ||
        e.detalle?.toLowerCase().includes(t),
    );
  }

  // ── KPIs (datos reales de BD) ─────────────────
  statsGlobal = { actividades: 0, participantes: 0, presupuesto_total: 0, redes: 0 };
  cargandoKpis = false;

  // ── Resumen por Red Asistencial ───────────────
  resumenRedes: ResumenRed[] = [];
  cargandoResumen = false;
  busquedaRed = '';

  get filtrandoPorRed(): boolean { return !!this.busquedaRed.trim(); }

  get resumenRedesFiltrado(): ResumenRed[] {
    const q = this.busquedaRed.trim().toLowerCase();
    if (!q) return this.resumenRedes;
    return this.resumenRedes.filter(r => r.red.toLowerCase().includes(q));
  }

  get totalCapacitacionesFiltrado() { return this.resumenRedesFiltrado.reduce((s, r) => s + r.capacitaciones, 0); }
  get totalHorasFiltrado()          { return this.resumenRedesFiltrado.reduce((s, r) => s + Number(r.horas), 0); }
  get totalParticipantesFiltrado()  { return this.resumenRedesFiltrado.reduce((s, r) => s + r.participantes, 0); }
  get totalPresupuestoFiltrado()    { return this.resumenRedesFiltrado.reduce((s, r) => s + Number(r.presupuesto), 0); }

  get kpiCapacitaciones(): number {
    return this.filtrandoPorRed ? this.totalCapacitacionesFiltrado : this.statsGlobal.actividades;
  }
  get kpiParticipantes(): number {
    return this.filtrandoPorRed ? this.totalParticipantesFiltrado : this.statsGlobal.participantes;
  }
  get kpiPresupuesto(): number {
    return this.filtrandoPorRed ? this.totalPresupuestoFiltrado : this.statsGlobal.presupuesto_total;
  }
  get kpiRedes(): number {
    return this.filtrandoPorRed ? this.resumenRedesFiltrado.length : this.statsGlobal.redes;
  }

  // ── Gráficos ──────────────────────────────────
  chartConfigModalidad: any;
  chartConfigRedes: any;

  constructor(
    private router: Router,
    private expedienteService: ExpedienteService,
    private pdpData: PdpDataService,
  ) {}

  ngOnInit() {
    const raw = localStorage.getItem('usuario');

    if (!raw) {
      this.router.navigate(['/login']);
      return;
    }

    const datos = JSON.parse(raw);

    this.usuarioActual = datos;
    this.nombre = datos.nombre;
    this.rol = datos.rol;

    this.esAdministrador = ['Administrador', 'Administrativo'].includes(datos.rol);

    this.esSectorista = datos.rol === 'Sectorista';
    this.esEjecutor = datos.rol === 'Ejecutor';

    this.inicialUsuario = (datos.nombre as string)?.charAt(0)?.toUpperCase() || 'U';

    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

    this.cargarMenuPorRol();

    if (this.esAdministrador) {
      this.cargarDatosAdmin();

      this.busquedaSubject.pipe(
        debounceTime(350),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
      ).subscribe(q => this.refrescarPieChart(q));
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private cargarDatosAdmin() {
    this.cargandoKpis    = true;
    this.cargandoResumen = true;

    forkJoin({
      stats:   this.pdpData.getStats(),
      resumen: this.pdpData.getResumenRedes(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ stats, resumen }) => {
          this.statsGlobal     = stats;
          this.resumenRedes    = resumen;
          this.cargandoKpis    = false;
          this.cargandoResumen = false;
          this.construirGraficos(stats, resumen);
        },
        error: () => {
          this.cargandoKpis    = false;
          this.cargandoResumen = false;
        },
      });
  }

  private construirGraficos(stats: any, _resumen: ResumenRed[]) {
    this.reconstruirPieChart(stats);
    this.actualizarGraficoRedes();
  }

  private reconstruirPieChart(stats: any) {
    const porModalidad: { modalidad: string; total: number }[] = stats?.por_modalidad ?? [];
    this.chartConfigModalidad = {
      type: 'pie',
      data: {
        labels: porModalidad.map(m => m.modalidad || 'Sin modalidad'),
        datasets: [{
          data: porModalidad.map(m => Number(m.total)),
          backgroundColor: ['#36A2EB', '#4BC0C0', '#FFCE56', '#FF6384', '#9966FF', '#FF9F40'],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: 'Capacitaciones por Modalidad' },
        },
      },
    };
  }

  private refrescarPieChart(q: string) {
    this.chartConfigModalidad = null;
    this.pdpData.getStats(q)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  stats => this.reconstruirPieChart(stats),
        error: ()    => this.reconstruirPieChart(this.statsGlobal),
      });
  }

  onBusquedaChange(q: string) {
    this.actualizarGraficoRedes();
    if (!q.trim()) {
      this.reconstruirPieChart(this.statsGlobal);
    } else {
      this.busquedaSubject.next(q);
    }
  }

  actualizarGraficoRedes() {
    const redes = this.filtrandoPorRed
      ? this.resumenRedesFiltrado
      : this.resumenRedes.slice(0, 8);

    if (!redes.length) {
      this.chartConfigRedes = null;
      return;
    }

    const titulo = this.filtrandoPorRed
      ? `Resultado para "${this.busquedaRed.trim()}"`
      : 'Capacitaciones por Red Asistencial (Top 8)';

    this.chartConfigRedes = {
      type: 'bar',
      data: {
        labels: redes.map(r => r.red.replace('Red Asistencial ', '')),
        datasets: [
          {
            label: 'Capacitaciones',
            data: redes.map(r => r.capacitaciones),
            backgroundColor: '#005baa',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: titulo },
        },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    };
  }

  cargarMenuPorRol() {
    switch (this.rol) {
      case 'Administrador':
        this.menuItems = [
          'Inicio',
          'Expedientes',
          'Hoja de Ruta',
          'Personal',
          'Participantes',
          'Reportes',
          'Administración',
        ];
        break;
      case 'Sectorista':
        this.menuItems = ['Inicio', 'Expedientes', 'Hoja de Ruta', 'Reportes'];
        break;
      case 'Ejecutor':
        this.menuItems = ['Inicio', 'Expedientes', 'Hoja de Ruta'];
        break;
      default:
        this.menuItems = ['Dashboard'];
    }
  }

  irModulo(modulo: string) {
    switch (modulo) {
      case 'Inicio':
        this.router.navigate(['/dashboard']);
        break;
      case 'Expedientes':
        this.router.navigate(['/expedientes']);
        break;
      case 'Hoja de Ruta':
        this.router.navigate(['/hoja-ruta']);
        break;
      case 'Personal':
        this.router.navigate(['/personal-pdp']);
        break;
      case 'Participantes':
        this.router.navigate(['/lista-participantes']);
        break;
      case 'Historial':
        this.abrirHistorial();
        break;
      case 'Reportes':
        alert('🚧 Módulo Reportes en desarrollo');
        break;
      case 'Administración':
        this.router.navigate(['/personal']);
        break;
      default:
        alert(`🚧 El módulo "${modulo}" aún está en desarrollo`);
    }
  }

  abrirHistorial() {
    this.historial = this.expedienteService.getHistorial();
    this.filtroHistorial = '';
    this.mostrarHistorial = true;
  }
  cerrarHistorial() {
    this.mostrarHistorial = false;
  }

  abrirEditarPerfil() {
    this.perfilEditado = {
      nombre: this.usuarioActual?.nombre || '',
      correo: this.usuarioActual?.correo || '',
      telefono: this.usuarioActual?.telefono || '',
    };
    this.mostrarEditarPerfil = true;
  }
  cerrarEditarPerfil() {
    this.mostrarEditarPerfil = false;
  }

  abrirCambiarPassword() {
    this.passwordData = { actual: '', nueva: '', confirmar: '' };
    this.mostrarCambiarPassword = true;
  }
  cerrarCambiarPassword() {
    this.mostrarCambiarPassword = false;
  }

  guardarPerfil() {
    alert('Perfil actualizado correctamente');
    this.cerrarEditarPerfil();
  }

  guardarPassword() {
    if (this.passwordData.nueva !== this.passwordData.confirmar) {
      alert('Las contraseñas no coinciden');
      return;
    }
    alert('Contraseña actualizada correctamente');
    this.cerrarCambiarPassword();
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  get totalCapacitaciones() { return this.resumenRedes.reduce((s, r) => s + r.capacitaciones, 0); }
  get totalHoras()          { return this.resumenRedes.reduce((s, r) => s + Number(r.horas), 0); }
  get totalParticipantes()  { return this.resumenRedes.reduce((s, r) => s + r.participantes, 0); }
  get totalPresupuesto()    { return this.resumenRedes.reduce((s, r) => s + Number(r.presupuesto), 0); }

  formatMoneda(v: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
}
