import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
<<<<<<< HEAD
import { Chart, registerables } from 'chart.js';
import { Subject } from 'rxjs';
=======
import { ChartData, ChartOptions } from 'chart.js';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
>>>>>>> 1628c46b1c517e83466119f1e34648838608ac81
import { ExpedienteService } from '../../services/expediente.service';
import { forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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

  // ── Filtro y resumen por Red Asistencial ─────
  filtroRed = '';
  redesDisponibles: string[] = [];
  resumenRedes: ResumenRed[] = [];
  cargandoResumen = false;

  private readonly LC_KEY = 'dash_admin_cache';
  private readonly LC_TTL = 3 * 60 * 1000;

  // ── Gráficos ──────────────────────────────────
  readonly pieType = 'pie' as const;
  readonly barType = 'bar' as const;
  pieData: ChartData<'pie'> | null = null;
  barData: ChartData<'bar'> | null = null;
  pieOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { position: 'bottom' } },
  };
  barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
  };

  constructor(
    private router: Router,
    private expedienteService: ExpedienteService,
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

    this.cargandoResumen = false;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private cargarDatosAdmin(red = '') {
    // Mostrar caché local inmediatamente si existe
    const cacheKey = `${this.LC_KEY}:${red}`;
    const cached = this.leerCache(cacheKey);
    if (cached) {
      this.aplicarDatos(cached.stats, cached.resumen);
      // Si el caché tiene menos de TTL, no hace falta ir a la red
      if (Date.now() - cached.ts < this.LC_TTL) return;
    }

    // Sin caché → mostrar spinner; con caché → actualizar silenciosamente
    this.cargandoResumen = !cached;

<<<<<<< HEAD
    forkJoin({})
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ stats, resumen }: any) => {
          this.statsGlobal = stats;
          this.resumenRedes = resumen;
          this.construirGraficos(stats, resumen);
          this.cargandoResumen = false;
        },
        error: () => {
          this.cargandoResumen = false;
        },
      });
  }

  private construirGraficos(stats: any, resumen: ResumenRed[]) {
    // Gráfico 1 — Capacitaciones por Modalidad (viene ya agrupado del servidor)
    const modLabels = (stats.por_modalidad as { modalidad: string; total: number }[]).map(
      (m) => m.modalidad || 'Sin modalidad',
    );
    const modData = (stats.por_modalidad as { modalidad: string; total: number }[]).map((m) =>
      Number(m.total),
    );

    this.chartConfigModalidad = {
      type: 'pie',
      data: {
        labels: modLabels,
        datasets: [
          {
            data: modData,
            backgroundColor: ['#36A2EB', '#4BC0C0', '#FFCE56', '#FF6384', '#9966FF', '#FF9F40'],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: 'Capacitaciones por Modalidad' },
        },
      },
=======
    forkJoin({
      stats:   this.pdpData.getStats(red),
      resumen: this.pdpData.getResumenRedes(red),
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ stats, resumen }) => {
        this.aplicarDatos(stats, resumen);
        this.guardarCache(cacheKey, stats, resumen);
        this.cargandoResumen = false;
      },
      error: () => { this.cargandoResumen = false; },
    });
  }

  private aplicarDatos(stats: any, resumen: ResumenRed[]) {
    this.statsGlobal  = stats;
    this.resumenRedes = resumen;
    if (!this.redesDisponibles.length) {
      this.redesDisponibles = resumen.map(r => r.red);
    }
    this.construirGraficos(stats, resumen);
  }

  private leerCache(key: string): { stats: any; resumen: ResumenRed[]; ts: number } | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private guardarCache(key: string, stats: any, resumen: ResumenRed[]) {
    try {
      localStorage.setItem(key, JSON.stringify({ stats, resumen, ts: Date.now() }));
    } catch { /* ignora errores de cuota */ }
  }

  aplicarFiltroRed(red: string) {
    this.filtroRed = red;
    this.cargarDatosAdmin(red);
  }

  private construirGraficos(stats: any, resumen: ResumenRed[]) {
    const porModalidad: { modalidad: string; total: number }[] = stats.por_modalidad ?? [];

    this.pieData = {
      labels: porModalidad.map(m => m.modalidad || 'Sin modalidad'),
      datasets: [{
        data: porModalidad.map(m => Number(m.total)),
        backgroundColor: ['#36A2EB', '#4BC0C0', '#FFCE56', '#FF6384', '#9966FF', '#FF9F40'],
        borderWidth: 1,
      }],
>>>>>>> 1628c46b1c517e83466119f1e34648838608ac81
    };

    const topRedes = resumen.slice(0, 8);
<<<<<<< HEAD
    this.chartConfigRedes = {
      type: 'bar',
      data: {
        labels: topRedes.map((r) => r.red.replace('Red Asistencial ', '')),
        datasets: [
          {
            label: 'Capacitaciones',
            data: topRedes.map((r) => r.capacitaciones),
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
          title: { display: true, text: 'Capacitaciones por Red Asistencial (Top 8)' },
        },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
=======
    this.barData = {
      labels: topRedes.map(r => r.red.replace('Red Asistencial ', '')),
      datasets: [{
        label: 'Capacitaciones',
        data: topRedes.map(r => r.capacitaciones),
        backgroundColor: '#005baa',
        borderRadius: 6,
      }],
>>>>>>> 1628c46b1c517e83466119f1e34648838608ac81
    };
  }

  cargarMenuPorRol() {
    switch (this.rol) {
      case 'Administrador':
<<<<<<< HEAD
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
=======
        this.menuItems = ['Inicio', 'Expedientes', 'Hoja de Ruta', 'Personal', 'Participantes', 'Reportes', 'Administración']; break;
>>>>>>> 1628c46b1c517e83466119f1e34648838608ac81
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
<<<<<<< HEAD
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
=======
      case 'Inicio':          this.router.navigate(['/dashboard']); break;
      case 'Expedientes':     this.router.navigate(['/expedientes']); break;
      case 'Hoja de Ruta':   this.router.navigate(['/hoja-ruta']); break;
      case 'Personal':        this.router.navigate(['/personal-pdp']); break;
      case 'Participantes':   this.router.navigate(['/lista-participantes']); break;
      case 'Historial':       this.abrirHistorial(); break;
      case 'Reportes':        alert('🚧 Módulo Reportes en desarrollo'); break;
      case 'Administración':  this.router.navigate(['/personal']); break;
      default: alert(`🚧 El módulo "${modulo}" aún está en desarrollo`);
>>>>>>> 1628c46b1c517e83466119f1e34648838608ac81
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

  get totalCapacitaciones() {
    return this.resumenRedes.reduce((s, r) => s + r.capacitaciones, 0);
  }
  get totalHoras() {
    return this.resumenRedes.reduce((s, r) => s + r.horas, 0);
  }
  get totalParticipantes() {
    return this.resumenRedes.reduce((s, r) => s + r.participantes, 0);
  }
  get totalPresupuesto() {
    return this.resumenRedes.reduce((s, r) => s + r.presupuesto, 0);
  }

  formatMoneda(v: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
}
