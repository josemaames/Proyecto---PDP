import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { ExpedienteService } from '../../services/expediente.service';
import { PdpDataService } from '../../services/pdp-data.service';
import * as echarts from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { HttpClient } from '@angular/common/http';

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
  imports: [FormsModule, DecimalPipe, BaseChartDirective, NgxEchartsDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  echarts = echarts;

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

  // ── Filtro temático ───────────────────────────
  filtroTematico = '';
  readonly ejesTematicos = [
    'Atención Especializada',
    'Atención primaria',
    'Control interno o auditoría',
    'Ética, integridad, lucha contra la corrupción',
    'Gestión institucional',
    'Salud Mental',
    'Otros',
  ];

  filtrarPorRed(red: string) {
    this.busquedaRed = red;
    this.actualizarGraficos();
  }

  filtrarPorTema(tema: string) {
    this.filtroTematico = tema;
    this.actualizarGraficos();
  }

  actualizarGraficos() {
    forkJoin({
      stats: this.pdpData.getStats(this.busquedaRed, this.filtroTematico),
      resumen: this.pdpData.getResumenRedes('', this.filtroTematico),
      dashboard: this.pdpData.getDashboard(this.busquedaRed, this.filtroTematico),
    }).subscribe(({ stats, resumen, dashboard }) => {
      this.resumenRedes = resumen;
      this.construirGraficos(stats, this.resumenRedesFiltrado);
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

    this.chartConfigParticipantesRed = {
      type: 'bar',
      data: {
        labels: this.resumenRedes
          .sort((a: any, b: any) => b.participantes - a.participantes)
          .slice(0, 10)
          .map((r: any) => r.red),

        datasets: [
          {
            label: 'Participantes',
            data: this.resumenRedes
              .sort((a: any, b: any) => b.participantes - a.participantes)
              .slice(0, 10)
              .map((r: any) => Number(r.participantes)),

            backgroundColor: '#16a34a',
            borderRadius: 8,
          },
        ],
      },

      options: {
        indexAxis: 'y',

        responsive: true,
        maintainAspectRatio: true,

        plugins: {
          legend: {
            display: false,
          },
        },
      },
    };

    this.chartConfigPresupuestoRed = {
      type: 'bar',
      data: {
        labels: this.resumenRedes.slice(0, 8).map((r: any) => r.red),

        datasets: [
          {
            label: 'Presupuesto (S/.)',
            data: this.resumenRedes.slice(0, 8).map((r: any) => Number(r.presupuesto)),

            backgroundColor: '#f59e0b',
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
          },
        },
      },
    };

    this.chartConfigEficienciaRed = {
      type: 'scatter',

      data: {
        datasets: [
          {
            label: 'Redes Asistenciales',

            data: [
              { name: 'LIMA', value: 5000 },
              { name: 'AREQUIPA', value: 3000 },
              { name: 'PIURA', value: 2000 },
            ],

            backgroundColor: '#2563eb',
            pointRadius: 8,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: true,

        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `Participantes: ${ctx.raw.x} | Presupuesto: S/ ${ctx.raw.y}`,
            },
          },
        },

        scales: {
          x: {
            title: {
              display: true,
              text: 'Participantes',
            },
          },
          y: {
            title: {
              display: true,
              text: 'Presupuesto (S/)',
            },
          },
        },
      },
    };

    this.chartConfigCostoParticipante = {
      type: 'bar',
      data: {
        labels: this.resumenRedes.slice(0, 8).map((r: any) => r.red),

        datasets: [
          {
            label: 'Costo por Participante (S/.)',

            data: this.resumenRedes
              .slice(0, 8)
              .map((r: any) =>
                r.participantes > 0 ? Number(r.presupuesto) / Number(r.participantes) : 0,
              ),

            backgroundColor: '#8b5cf6',
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
          },
        },
      },
    };

    console.log('CREANDO PARTICIPANTES RED');
    console.log(this.chartConfigParticipantesRed);

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
      options: { responsive: true, maintainAspectRatio: true },
    };
    // 🏆 Mejor Red
    const mejorRed = [...this.resumenRedes].sort((a, b) => b.participantes - a.participantes)[0];

    this.mejorRed = mejorRed?.red || '';
    this.mejorRedParticipantes = mejorRed?.participantes || 0;

    // 📅 Mejor Mes
    const mejorMes = [...dashboard.actividadesMes].sort(
      (a: any, b: any) => Number(b.total) - Number(a.total),
    )[0];

    this.mejorMes = mejorMes?.mes_termino || '';
    this.mejorMesActividades = Number(mejorMes?.total || 0);

    // 🎯 Modalidad dominante
    const modalidadTop = [...this.modalidadesResumen].sort(
      (a, b) => b.porcentaje - a.porcentaje,
    )[0];

    this.modalidadDominante = modalidadTop?.nombre || '';
    this.modalidadDominantePorcentaje = modalidadTop?.porcentaje || 0;

    // 👥 Promedio participantes por actividad
    this.promedioParticipantesActividad =
      this.totalCapacitaciones > 0
        ? Math.round(this.totalParticipantes / this.totalCapacitaciones)
        : 0;
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
  // ── Techo presupuestal ───────────────────────────
  presupuestoRedes: any[] = [];

  get presupuestoConEjecutado() {
    return this.presupuestoRedes.map(p => {
      const keyP = this.normalizarRedKey(p.red);
      const resumen = this.resumenRedes.find(r => this.normalizarRedKey(r.red) === keyP);
      const ejecutado = resumen ? Number(resumen.presupuesto) : 0;
      const techo = Number(p.techo);
      const disponible = techo - ejecutado;
      const porcentaje = techo > 0 ? Math.min(Math.round((ejecutado / techo) * 100), 100) : 0;
      return { ...p, techo, ejecutado, disponible, porcentaje };
    });
  }

  get totalTechoPresupuestal() {
    return this.presupuestoRedes.reduce((s, p) => s + Number(p.techo), 0);
  }

  private normalizarRedKey(s: string): string {
    return (s || '').toLowerCase()
      .replace(/^red (asistencial|prestacional)\s+/i, '')
      .replace(/^(ra|rp)\s+/i, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim();
  }

  // ── Gráficos ──────────────────────────────────
  chartConfigModalidad: any;
  chartConfigRedes: any;
  chartConfigSexo: any;
  chartConfigMeses: any;
  chartConfigParticipantesRed: any;
  chartConfigPresupuestoRed: any;
  chartConfigCostoParticipante: any;
  chartConfigEficienciaRed: any;
  modalidadesResumen: any[] = [];
  chartConfigMapaPeru: any;
  topDepartamentos: any[] = [];

  mejorRed = '';
  mejorRedParticipantes = 0;

  mejorMes = '';
  mejorMesActividades = 0;

  modalidadDominante = '';
  modalidadDominantePorcentaje = 0;

  promedioParticipantesActividad = 0;

  metaParticipantes = Number(localStorage.getItem('metaParticipantes')) || 15000;
  porcentajeMeta = 0;

  mostrarModalMeta = false;
  nuevaMeta = 0;

  constructor(
    private http: HttpClient,
    private router: Router,
    private expedienteService: ExpedienteService,
    private pdpData: PdpDataService,
  ) {}

  private cargarMapaPeru() {
    console.log('ENTRO A CARGAR MAPA');

    this.http.get('/maps/peru.geojson').subscribe((geoJson: any) => {
      console.log('GEOJSON CARGADO', geoJson);
      console.log('FEATURES', geoJson.features?.length);

      console.log(
        'DEPARTAMENTOS GEOJSON',
        geoJson.features.forEach((f: any) => (f.properties.name = f.properties.NOMBDEP)),
      );

      geoJson.features.forEach((f: any) => {
        if (f.properties.NOMBDEP.includes('CALLAO')) {
          console.log('CALLAO FEATURE', f.properties);
        }
      });

      echarts.registerMap('peru', geoJson);

      console.table(
        this.resumenRedes.map((r: any) => ({
          red: r.red,
          departamento: this.obtenerDepartamento(r.red),
          participantes: r.participantes,
        })),
      );

      console.table(
        this.resumenRedes
          .map((r: any) => ({
            red: r.red,
            departamento: this.obtenerDepartamento(r.red),
          }))
          .filter((x: any) => !x.departamento),
      );

      const departamentosAgrupados: Record<string, number> = {};
      console.log(
        'SABOGAL',
        this.resumenRedes.filter((r: any) => r.red?.includes('SABOGAL')),
      );

      console.log('CALLAO AGRUPADO', departamentosAgrupados['CALLAO']);

      console.table(
        this.resumenRedes.map((r: any) => ({
          red: r.red,
          participantes: r.participantes,
        })),
      );

      this.resumenRedes.forEach((r: any) => {
        const dep = this.obtenerDepartamento(r.red);

        console.log('CALLAO AGRUPADO', departamentosAgrupados['CALLAO']);
        console.log('LIMA AGRUPADO', departamentosAgrupados['LIMA']);

        console.table(departamentosAgrupados);

        console.table(this.resumenRedes.filter((r: any) => r.red?.includes('SABOGAL')));

        if (!dep) return;

        departamentosAgrupados[dep] = (departamentosAgrupados[dep] || 0) + Number(r.participantes);
      });

      const dataMapa = Object.entries(departamentosAgrupados).map(([name, value]) => ({
        name,
        value,
      }));

      // TOP 5 DEPARTAMENTOS
      this.topDepartamentos = [...dataMapa]
        .sort((a: any, b: any) => Number(b.value) - Number(a.value))
        .slice(0, 5);

      console.table(dataMapa);
      console.table(this.topDepartamentos);

      console.table(dataMapa);

      this.chartConfigMapaPeru = {
        tooltip: {
          trigger: 'item',

          formatter: (params: any) => `
<div style="padding:8px">
  <strong>${params.name}</strong><br/>
  👥 Participantes: <b>${params.value || 0}</b>
</div>
  `,
        },

        visualMap: {
          min: 0,
          max: 2000,
          zoom: 1.5,
          left: 'left',
          bottom: '20px',
          text: ['Alto', 'Bajo'],
          calculable: true,
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 1.5,
          },
          emphasis: {
            itemStyle: {
              areaColor: '#f59e0b',
            },
          },

          inRange: {
            color: ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8'],
          },
        },

        series: [
          {
            type: 'map',
            map: 'peru',

            roam: true,

            label: {
              show: false,
              formatter: '{b}',
              color: '#000',
              fontSize: 9,
            },

            data: dataMapa,
          },
        ],
      };

      console.log('MAPA CONFIG', this.chartConfigMapaPeru);
    });
  }

  private obtenerDepartamento(red: string): string {
    const mapa: Record<string, string> = {
      'RA ANCASH': 'ANCASH',
      'RA AREQUIPA': 'AREQUIPA',
      'RA AYACUCHO': 'AYACUCHO',
      'RA CAJAMARCA': 'CAJAMARCA',
      'RA CUSCO': 'CUSCO',
      'RA HUANCAVELICA': 'HUANCAVELICA',
      'RA HUANUCO': 'HUANUCO',
      'RA ICA': 'ICA',
      'RA JUNIN': 'JUNIN',
      'RA LA LIBERTAD': 'LA LIBERTAD',
      'RA LAMBAYEQUE': 'LAMBAYEQUE',
      'RA LORETO': 'LORETO',
      'RA MOQUEGUA': 'MOQUEGUA',
      'RA PASCO': 'PASCO',
      'RA PIURA': 'PIURA',
      'RA PUNO': 'PUNO',
      'RA TACNA': 'TACNA',
      'RA TUMBES': 'TUMBES',
      'RA UCAYALI': 'UCAYALI',

      'RP ALMENARA': 'LIMA',
      'RP REBAGLIATI': 'LIMA',
      'RP SABOGAL': 'CALLAO',
    };

    return mapa[red] || '';
  }

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
      presupuesto: this.http.get<any[]>('http://localhost:3001/api/presupuesto-redes').pipe(
        catchError(() => of([]))
      ),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ stats, resumen, dashboard, presupuesto }) => {
          this.presupuestoRedes = presupuesto;
          console.log('SEXO', dashboard.participantesSexo);
          console.log('MESES', dashboard.actividadesMes);

          this.statsGlobal = stats;
          this.resumenRedes = resumen;
          this.redesDisponibles = [...new Set(resumen.map((r) => r.red))].sort();
          this.dashboardData = dashboard;

          this.porcentajeMeta = Math.round(
            (this.totalParticipantesFiltrado / this.metaParticipantes) * 100,
          );
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

          this.cargarMapaPeru();

          this.actualizarChartsDesdesDashboard(dashboard);
        },
        error: () => {
          this.cargandoKpis = false;
          this.cargandoResumen = false;
        },
      });
  }

  private construirGraficos(stats: any, resumen: ResumenRed[]) {
    // Normalizar y fusionar duplicados de modalidad
    const modalidadMap: Record<string, number> = {};
    for (const x of stats.por_modalidad || []) {
      const key = (x.modalidad || 'Sin modalidad')
        .toUpperCase()
        .replace(/SEMI\s+PRESENCIAL/g, 'SEMIPRESENCIAL');
      modalidadMap[key] = (modalidadMap[key] || 0) + Number(x.total);
    }

    const totalMod = Object.values(modalidadMap).reduce((s, v) => s + v, 0);

    this.modalidadesResumen = Object.entries(modalidadMap)
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, count]) => ({
        nombre,
        porcentaje: Math.round((count / totalMod) * 100),
      }));

    this.chartConfigModalidad = {
      type: 'pie',
      data: {
        labels: Object.keys(modalidadMap),
        datasets: [
          {
            data: Object.values(modalidadMap),
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
    this.chartConfigRedes = {
      type: 'bar',

      data: {
        labels: resumen
          .sort((a: any, b: any) => b.capacitaciones - a.capacitaciones)
          .slice(0, 10)
          .map((r: any) => r.red),

        datasets: [
          {
            label: 'Capacitaciones',

            data: resumen
              .sort((a: any, b: any) => b.capacitaciones - a.capacitaciones)
              .slice(0, 10)
              .map((r: any) => Number(r.capacitaciones)),

            backgroundColor: '#2563eb',
            borderRadius: 8,
          },
        ],
      },

      options: {
        indexAxis: 'y',

        responsive: true,
        maintainAspectRatio: true,

        plugins: {
          legend: {
            display: false,
          },
        },
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

  get resumenRedesOrdenado() {
    return [...this.resumenRedes].sort((a: any, b: any) => b.participantes - a.participantes);
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

  cambiarMeta() {
    this.nuevaMeta = this.metaParticipantes;
    this.mostrarModalMeta = true;
  }

  guardarMeta() {
    if (!this.nuevaMeta || this.nuevaMeta <= 0) {
      alert('Ingrese una meta válida');
      return;
    }

    this.metaParticipantes = this.nuevaMeta;

    localStorage.setItem('metaParticipantes', this.metaParticipantes.toString());

    this.porcentajeMeta = Math.round((this.totalParticipantes / this.metaParticipantes) * 100);

    this.mostrarModalMeta = false;
  }

  cerrarModalMeta() {
    this.mostrarModalMeta = false;
  }

  formatMoneda(v: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
}
