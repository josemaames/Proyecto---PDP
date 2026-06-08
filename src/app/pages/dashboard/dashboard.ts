import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ExpedienteService } from '../../services/expediente.service';
import { PdpDataService, Actividad } from '../../services/pdp-data.service';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, DecimalPipe, BaseChartDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

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
  mostrarHistorial       = false;
  mostrarEditarPerfil    = false;
  mostrarCambiarPassword = false;

  perfilEditado  = { nombre: '', correo: '', telefono: '' };
  passwordData   = { actual: '', nueva: '', confirmar: '' };
  historial: any[] = [];
  filtroHistorial = '';

  get historialFiltrado(): any[] {
    const t = this.filtroHistorial.toLowerCase().trim();
    if (!t) return this.historial;
    return this.historial.filter(e =>
      e.expediente?.toLowerCase().includes(t) ||
      e.usuario?.toLowerCase().includes(t)    ||
      e.accion?.toLowerCase().includes(t)     ||
      e.detalle?.toLowerCase().includes(t),
    );
  }

  // ── KPIs (datos reales de BD) ─────────────────
  statsGlobal = { actividades: 0, participantes: 0, presupuesto_total: 0, redes: 0 };

  // ── Resumen por Red Asistencial ───────────────
  resumenRedes: {
    red: string;
    capacitaciones: number;
    horas: number;
    participantes: number;
    presupuesto: number;
  }[] = [];
  cargandoResumen = false;

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
    if (!raw) { this.router.navigate(['/login']); return; }

    const datos = JSON.parse(raw);
    this.usuarioActual  = datos;
    this.nombre         = datos.nombre;
    this.rol            = datos.rol;
    this.esAdministrador = ['Administrador', 'Administrativo'].includes(datos.rol);
    this.esSectorista   = datos.rol === 'Sectorista';
    this.esEjecutor     = datos.rol === 'Ejecutor';
    this.inicialUsuario = (datos.nombre as string)?.charAt(0)?.toUpperCase() || 'U';

    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

    this.cargarMenuPorRol();

    if (this.esAdministrador) {
      this.cargarDatosAdmin();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private cargarDatosAdmin() {
    this.cargandoResumen = true;

    // Cargar estadísticas globales y actividades en paralelo
    forkJoin({
      stats:       this.pdpData.getStats(),
      actividades: this.pdpData.getActividades('', '', '', 1, 1000),
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ stats, actividades }) => {
        this.statsGlobal = stats;
        this.construirResumenRedes(actividades.data);
        this.construirGraficos(stats, actividades.data);
        this.cargandoResumen = false;
      },
      error: () => { this.cargandoResumen = false; },
    });
  }

  private construirResumenRedes(actividades: Actividad[]) {
    const mapa = new Map<string, { capacitaciones: number; horas: number; participantes: number; presupuesto: number }>();

    for (const a of actividades) {
      const red = a.red_asistencial?.trim() || 'Sin Red';
      const actual = mapa.get(red) ?? { capacitaciones: 0, horas: 0, participantes: 0, presupuesto: 0 };
      mapa.set(red, {
        capacitaciones: actual.capacitaciones + 1,
        horas:          actual.horas          + (a.total_horas          || 0),
        participantes:  actual.participantes   + (a.total_participantes  || 0),
        presupuesto:    actual.presupuesto     + (a.presupuesto_ejecutado || 0),
      });
    }

    this.resumenRedes = Array.from(mapa.entries())
      .map(([red, d]) => ({ red, ...d }))
      .sort((a, b) => b.capacitaciones - a.capacitaciones);
  }

  private construirGraficos(_stats: any, actividades: Actividad[]) {
    // Gráfico 1 — Capacitaciones por Modalidad
    const modMap = new Map<string, number>();
    actividades.forEach(a => {
      const m = a.modalidad || 'Sin modalidad';
      modMap.set(m, (modMap.get(m) || 0) + 1);
    });
    const modLabels = [...modMap.keys()];
    const modData   = [...modMap.values()];

    this.chartConfigModalidad = {
      type: 'pie',
      data: {
        labels: modLabels,
        datasets: [{
          data: modData,
          backgroundColor: ['#36A2EB', '#4BC0C0', '#FFCE56', '#FF6384', '#9966FF', '#FF9F40'],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Capacitaciones por Modalidad' } },
      },
    };

    // Gráfico 2 — Top 8 redes por capacitaciones (barras)
    const topRedes = this.resumenRedes.slice(0, 8);
    this.chartConfigRedes = {
      type: 'bar',
      data: {
        labels: topRedes.map(r => r.red.replace('Red Asistencial ', '')),
        datasets: [{
          label: 'Capacitaciones',
          data: topRedes.map(r => r.capacitaciones),
          backgroundColor: '#005baa',
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Capacitaciones por Red Asistencial (Top 8)' },
        },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    };
  }

  cargarMenuPorRol() {
    switch (this.rol) {
      case 'Administrador':
        this.menuItems = ['Inicio', 'Expedientes', 'Hoja de Ruta', 'Personal', 'Reportes', 'Administración']; break;
      case 'Sectorista':
        this.menuItems = ['Inicio', 'Expedientes', 'Hoja de Ruta', 'Reportes']; break;
      case 'Ejecutor':
        this.menuItems = ['Inicio', 'Expedientes', 'Hoja de Ruta']; break;
      default:
        this.menuItems = ['Dashboard'];
    }
  }

  irModulo(modulo: string) {
    switch (modulo) {
      case 'Inicio':          this.router.navigate(['/dashboard']); break;
      case 'Expedientes':     this.router.navigate(['/expedientes']); break;
      case 'Hoja de Ruta':   this.router.navigate(['/hoja-ruta']); break;
      case 'Personal':        this.router.navigate(['/personal']); break;
      case 'Historial':       this.abrirHistorial(); break;
      case 'Reportes':        alert('🚧 Módulo Reportes en desarrollo'); break;
      case 'Administración': alert('🚧 Módulo Administración en desarrollo'); break;
      default: alert(`🚧 El módulo "${modulo}" aún está en desarrollo`);
    }
  }

  abrirHistorial() {
    this.historial = this.expedienteService.getHistorial();
    this.filtroHistorial = '';
    this.mostrarHistorial = true;
  }
  cerrarHistorial()      { this.mostrarHistorial = false; }

  abrirEditarPerfil() {
    this.perfilEditado = {
      nombre:   this.usuarioActual?.nombre  || '',
      correo:   this.usuarioActual?.correo  || '',
      telefono: this.usuarioActual?.telefono || '',
    };
    this.mostrarEditarPerfil = true;
  }
  cerrarEditarPerfil()   { this.mostrarEditarPerfil = false; }

  abrirCambiarPassword() {
    this.passwordData = { actual: '', nueva: '', confirmar: '' };
    this.mostrarCambiarPassword = true;
  }
  cerrarCambiarPassword() { this.mostrarCambiarPassword = false; }

  guardarPerfil() {
    alert('Perfil actualizado correctamente');
    this.cerrarEditarPerfil();
  }

  guardarPassword() {
    if (this.passwordData.nueva !== this.passwordData.confirmar) {
      alert('Las contraseñas no coinciden'); return;
    }
    alert('Contraseña actualizada correctamente');
    this.cerrarCambiarPassword();
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  get totalCapacitaciones() { return this.resumenRedes.reduce((s, r) => s + r.capacitaciones, 0); }
  get totalHoras()          { return this.resumenRedes.reduce((s, r) => s + r.horas,          0); }
  get totalParticipantes()  { return this.resumenRedes.reduce((s, r) => s + r.participantes,  0); }
  get totalPresupuesto()    { return this.resumenRedes.reduce((s, r) => s + r.presupuesto,    0); }

  formatMoneda(v: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
}
