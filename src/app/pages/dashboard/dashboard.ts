import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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
  dashboardData: any;

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

  // ── Lista de redes para el selector ─────────
  redesDisponibles: string[] = [];

  filtrarPorRed(red: string) {
    this.busquedaRed = red;
    this.actualizarGraficos();
  }

  actualizarGraficos() {
    const total = this.totalParticipantesFiltrado;

    const mujeres = Math.round(total * 0.73);
    const hombres = total - mujeres;

    this.pdpData.getStats(this.busquedaRed).subscribe((stats) => {
      this.construirGraficos(stats, this.resumenRedesFiltrado);
    });

    this.pdpData.getDashboard(this.busquedaRed).subscribe((dashboard) => {
      const redEncontrada = this.resumenRedes.find((r) =>
        r.red.toLowerCase().includes(this.busquedaRed.toLowerCase()),
      );

      const redExacta = redEncontrada?.red || '';

      this.pdpData.getDashboard(redExacta);

      const ordenMeses = [
        'ENERO',
        'FEBRERO',
        'MARZO',
        'ABRIL',
        'MAYO',
        'JUNIO',
        'JULIO',
        'AGOSTO',
        'SETIEMBRE',
        'OCTUBRE',
        'NOVIEMBRE',
        'DICIEMBRE',
      ];

      const sexoAgrupado: any = {};

      dashboard.participantesSexo.forEach((x: any) => {
        const sexo = (x.sexo || 'Sin dato').toUpperCase();
        sexoAgrupado[sexo] = (sexoAgrupado[sexo] || 0) + Number(x.total);
      });

      this.chartConfigSexo = {
        type: 'doughnut',
        data: {
          labels: Object.keys(sexoAgrupado),
          datasets: [
            {
              data: Object.values(sexoAgrupado),
              backgroundColor: ['#ec4899', '#3b82f6'],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
        },
      };

      const mesesOrdenados = [...dashboard.actividadesMes].sort(
        (a: any, b: any) =>
          ordenMeses.indexOf((a.mes_termino || '').toUpperCase()) -
          ordenMeses.indexOf((b.mes_termino || '').toUpperCase()),
      );

      this.chartConfigMeses = {
        type: 'line',
        data: {
          labels: mesesOrdenados.map((x: any) => x.mes_termino),
          datasets: [
            {
              label: 'Actividades',
              data: mesesOrdenados.map((x: any) => Number(x.total)),
              borderColor: '#005baa',
              backgroundColor: '#005baa',
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
        },
      };
    });

    if (!this.busquedaRed) {
      this.construirGraficos(this.statsGlobal, this.resumenRedes);
    } else {
      this.pdpData.getStats(this.busquedaRed).subscribe((stats) => {
        this.construirGraficos(stats, this.resumenRedesFiltrado);
      });
    }

    this.pdpData.getDashboard(this.busquedaRed).subscribe((dashboard) => {
      this.actualizarChartsDesdesDashboard(dashboard);
    });
  }

  private actualizarChartsDesdesDashboard(dashboard: any) {
    const sexoAgrupado: any = {};
    dashboard.participantesSexo.forEach((x: any) => {
      const sexo = (x.sexo || 'Sin dato').toUpperCase();
      sexoAgrupado[sexo] = (sexoAgrupado[sexo] || 0) + Number(x.total);
    });
    this.chartConfigSexo = {
      type: 'doughnut',
      data: {
        labels: Object.keys(sexoAgrupado),
        datasets: [{ data: Object.values(sexoAgrupado), backgroundColor: ['#ec4899', '#3b82f6'] }],
      },
      options: { responsive: true, maintainAspectRatio: true },
    };

    const ordenMeses = [
      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
    ];
    const mesesOrdenados = [...dashboard.actividadesMes].sort(
      (a: any, b: any) =>
        ordenMeses.indexOf((a.mes_termino || '').toUpperCase()) -
        ordenMeses.indexOf((b.mes_termino || '').toUpperCase()),
    );
    this.chartConfigMeses = {
      type: 'line',
      data: {
        labels: mesesOrdenados.map((x: any) => x.mes_termino),
        datasets: [{
          label: 'Actividades',
          data: mesesOrdenados.map((x: any) => Number(x.total)),
          borderColor: '#005baa',
          backgroundColor: '#005baa',
          tension: 0.3,
        }],
      },
      options: { responsive: true, maintainAspectRatio: true },
    };
  }

  get resumenRedesFiltrado(): ResumenRed[] {
    const q = this.busquedaRed.trim().toLowerCase();
    if (!q) return this.resumenRedes;
    return this.resumenRedes.filter((r) => r.red.toLowerCase().includes(q));
  }

  get totalCapacitacionesFiltrado() {
    return this.resumenRedesFiltrado.reduce((s, r) => s + r.capacitaciones, 0);
  }
  get totalHorasFiltrado() {
    return this.resumenRedesFiltrado.reduce((s, r) => s + Number(r.horas), 0);
  }
  get totalParticipantesFiltrado() {
    return this.resumenRedesFiltrado.reduce((s, r) => s + r.participantes, 0);
  }
  get totalPresupuestoFiltrado() {
    return this.resumenRedesFiltrado.reduce((s, r) => s + Number(r.presupuesto), 0);
  }

  // ── Gráficos ──────────────────────────────────
  chartConfigModalidad: any;
  chartConfigRedes: any;
  chartConfigSexo: any;
  chartConfigMeses: any;

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
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private cargarDatosAdmin() {
    this.cargandoKpis = true;
    this.cargandoResumen = true;

    forkJoin({
      stats: this.pdpData.getStats(),
      resumen: this.pdpData.getResumenRedes(),
      dashboard: this.pdpData.getDashboard(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ stats, resumen, dashboard }) => {
          console.log('SEXO', dashboard.participantesSexo);
          console.log('MESES', dashboard.actividadesMes);

          this.statsGlobal = stats;
          this.resumenRedes = resumen;
          this.redesDisponibles = [...new Set(resumen.map((r) => r.red))].sort();
          // Participantes por sexo
          // Agrupar sexo (FEMENINO/Femenino)
          const sexoAgrupado: any = {};

          dashboard.participantesSexo.forEach((x: any) => {
            const sexo = (x.sexo || 'Sin dato').toUpperCase();

            sexoAgrupado[sexo] = (sexoAgrupado[sexo] || 0) + Number(x.total);
          });

          this.chartConfigSexo = {
            type: 'doughnut',
            data: {
              labels: Object.keys(sexoAgrupado),
              datasets: [
                {
                  data: Object.values(sexoAgrupado),
                  backgroundColor: ['#ec4899', '#3b82f6'],
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
            },
          };

          // Ordenar meses correctamente
          const ordenMeses = [
            'Enero',
            'Febrero',
            'Marzo',
            'Abril',
            'Mayo',
            'Junio',
            'Julio',
            'Agosto',
            'Setiembre',
            'Octubre',
            'Noviembre',
            'Diciembre',
          ];

          const mesesOrdenados = [...dashboard.actividadesMes].sort(
            (a: any, b: any) =>
              ordenMeses.indexOf(a.mes_termino) - ordenMeses.indexOf(b.mes_termino),
          );

          this.chartConfigMeses = {
            type: 'line',
            data: {
              labels: mesesOrdenados.map((x: any) => x.mes_termino),
              datasets: [
                {
                  label: 'Actividades',
                  data: mesesOrdenados.map((x: any) => Number(x.total)),
                  borderColor: '#005baa',
                  backgroundColor: '#005baa',
                  tension: 0.3,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
            },
          };
          this.cargandoKpis = false;
          this.cargandoResumen = false;
          this.construirGraficos(stats, resumen);
        },
        error: () => {
          this.cargandoKpis = false;
          this.cargandoResumen = false;
        },
      });
  }

  private construirGraficos(stats: any, resumen: ResumenRed[]) {
    const porModalidad: { modalidad: string; total: number }[] = stats?.por_modalidad ?? [];
    const modLabels = porModalidad.map((m) => m.modalidad || 'Sin modalidad');
    const modData = porModalidad.map((m) => Number(m.total));

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
    };

    // Gráfico 2 — Top 8 redes por capacitaciones (barras)

    const topRedes = this.busquedaRed ? this.resumenRedesFiltrado : resumen.slice(0, 8);
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

  get totalCapacitaciones() {
    return this.resumenRedes.reduce((s, r) => s + r.capacitaciones, 0);
  }
  get totalHoras() {
    return this.resumenRedes.reduce((s, r) => s + Number(r.horas), 0);
  }
  get totalParticipantes() {
    return this.resumenRedes.reduce((s, r) => s + r.participantes, 0);
  }
  get totalPresupuesto() {
    return this.resumenRedes.reduce((s, r) => s + Number(r.presupuesto), 0);
  }

  get porcentajeFemenino() {
    return 73;
  }

  get porcentajeMasculino() {
    return 27;
  }

  formatMoneda(v: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
}
