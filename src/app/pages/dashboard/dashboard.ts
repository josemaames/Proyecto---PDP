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
import { CommonModule } from '@angular/common';

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
  imports: [
    FormsModule,
    DecimalPipe,
    BaseChartDirective,
    NgxEchartsDirective,
    CommonModule,
    FormsModule,
  ],
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
        e.descripcion?.toLowerCase().includes(t) ||
        e.actor_nombre?.toLowerCase().includes(t) ||
        e.actor_rol?.toLowerCase().includes(t) ||
        e.referencia?.toLowerCase().includes(t) ||
        e.tipo?.toLowerCase().includes(t),
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

  cambiarAnio() {
    this.cargarDatosAdmin();
  }

  actualizarGraficos() {
    const anio = String(this.anioSeleccionado);
    forkJoin({
      stats: this.pdpData.getStats(this.busquedaRed, this.filtroTematico, anio),
      resumen: this.pdpData.getResumenRedes('', this.filtroTematico, anio),
      dashboard: this.pdpData.getDashboard(this.busquedaRed, this.filtroTematico, anio),
    }).subscribe(({ stats, resumen, dashboard }) => {
      console.log('TOTAL REDES API', resumen.length);
      console.log('TOTAL REDES COMPONENTE', this.resumenRedes.length);
      this.resumenRedes = resumen;
      console.log('RESUMEN API', resumen.length);
      console.log(resumen);
      console.log('RESUMEN REDES', this.resumenRedes.length);
      console.log('RESUMEN FILTRADO', this.resumenRedesFiltrado.length);
      console.log('BUSQUEDA RED', this.busquedaRed);
      console.log('FILTRADO', this.resumenRedesFiltrado.length);
      this.construirGraficos(stats, this.resumenRedesFiltrado);
      console.log('ENTRANDO A actualizarChartsDesdesDashboard', this.resumenRedes.length);
      this.actualizarChartsDesdesDashboard(dashboard);
    });
  }

  private actualizarChartsDesdesDashboard(dashboard: any) {
    const registrosSexo = dashboard.participantesSexo ?? [];

    const sexoAgrupado: any = {};

    registrosSexo.forEach((x: any) => {
      const raw = (x.sexo || '').toUpperCase().trim();
      const sexo = raw === 'F' ? 'FEMENINO' : raw === 'M' ? 'MASCULINO' : raw || 'Sin dato';
      sexoAgrupado[sexo] = (sexoAgrupado[sexo] || 0) + Number(x.total);
    });
    const coloresSexo: any = { MASCULINO: '#3b82f6', FEMENINO: '#ec4899' };
    this.chartConfigSexo = {
      type: 'doughnut',
      data: {
        labels: Object.keys(sexoAgrupado),
        datasets: [
          {
            data: Object.values(sexoAgrupado),
            backgroundColor: Object.keys(sexoAgrupado).map((s) => coloresSexo[s] || '#9ca3af'),
          },
        ],
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
            borderRadius: 10,
            maxBarThickness: 28,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        scales: {
          x: {
            title: {
              display: true,
              text: 'Participantes',
            },
            ticks: {
              stepSize: 100,
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
    console.log('ANTES DE PRESUPUESTO', this.resumenRedes.length);
    console.log('RESUMEN REDES EN GRAFICO');
    console.table(this.resumenRedes);
    console.log('REDES UNICAS', [...new Set(this.resumenRedes.map((r: any) => r.red))].length);
    this.chartConfigPresupuestoRed = {
      type: 'bar',

      data: {
        labels: this.resumenRedes.map((r: any) => r.red),

        datasets: [
          {
            label: 'Presupuesto (S/.)',

            data: this.resumenRedes.map((r: any) => Number(r.presupuesto)),

            backgroundColor: '#f59e0b',
            borderRadius: 10,
            maxBarThickness: 55,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            display: true,
          },
        },

        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: any) => `S/ ${Number(value).toLocaleString()}`,
            },
          },
        },
      },
    };

    console.log('LABELS GRAFICO', this.chartConfigPresupuestoRed.data.labels.length);

    this.chartConfigEficienciaRed = {
      type: 'scatter',

      data: {
        datasets: [
          {
            label: 'Redes Asistenciales',

            data: this.resumenRedes.map((r: any) => ({
              x: Number(r.participantes),
              y: Number(r.presupuesto),
              red: r.red,
            })),

            backgroundColor: 'rgba(37, 99, 235, 0.75)',
            pointRadius: 6,
            pointHoverRadius: 8,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            display: false,
          },

          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const punto = ctx.raw;

                return [
                  `${punto.red}`,
                  `Participantes: ${punto.x.toLocaleString()}`,
                  `Presupuesto: S/ ${punto.y.toLocaleString()}`,
                ];
              },
            },
          },
        },

        scales: {
          x: {
            ticks: {
              autoSkip: false,
              maxRotation: 90,
              minRotation: 90,
            },
          },

          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: any) => `S/ ${Number(value).toLocaleString()}`,
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
            borderRadius: 10,
            maxBarThickness: 60,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            display: true,
          },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `S/ ${ctx.parsed.y.toFixed(2)}`,
            },
          },
        },

        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: any) => `S/ ${value}`,
            },
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
    return this.presupuestoRedes.map((p) => {
      const keyP = this.normalizarRedKey(p.red);
      const resumen = this.resumenRedes.find((r) => this.normalizarRedKey(r.red) === keyP);
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
    return (s || '')
      .toLowerCase()
      .replace(/^red (asistencial|prestacional)\s+/i, '')
      .replace(/^(ra|rp)\s+/i, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
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
  chartConfigDepartamentos: any;
  departamentoLider: any;
  departamentoSeleccionado: any = null;
  redesDepartamento: any[] = [];
  chartInstance: any;
  topEjecucion: any[] = [];
  topEficiencia: any[] = [];

  coberturaNacional = {
    departamentos: 25,
    redes: 32,
    participantes: 0,
    capacitaciones: 0,
  };

  mejorRed = '';
  mejorRedParticipantes = 0;

  mejorMes = '';
  mejorMesActividades = 0;

  modalidadDominante = '';
  modalidadDominantePorcentaje = 0;

  promedioParticipantesActividad = 0;

  metaParticipantes = Number(localStorage.getItem('metaParticipantes')) || 15000;
  porcentajeMeta = 0;

  anioSeleccionado = 2025;
  aniosDisponibles = [2025, 2026];

  mostrarModalMeta = false;
  nuevaMeta = 0;

  constructor(
    private http: HttpClient,
    private router: Router,
    private expedienteService: ExpedienteService,
    private pdpData: PdpDataService,
  ) {}

  seleccionarDepartamentoDesdeRed() {
    const redSeleccionada = this.busquedaRed;

    const infoRed = this.resumenRedes.find((r: any) => r.red === redSeleccionada);

    const departamento = this.obtenerDepartamento(redSeleccionada);

    const infoDepartamento = this.chartConfigMapaPeru?.series?.[0]?.data?.find(
      (d: any) => d.name === departamento,
    );

    const ranking = this.topDepartamentos.findIndex((d: any) => d.name === departamento) + 1;

    const participantesRed = Number(infoRed?.participantes || 0);

    const participantesDepartamento = Number(infoDepartamento?.value || 0);

    const porcentajeNacional =
      this.totalParticipantesFiltrado > 0
        ? (participantesRed * 100) / this.totalParticipantesFiltrado
        : 0;

    this.departamentoSeleccionado = {
      red: redSeleccionada,
      nombre: departamento,
      participantesRed,
      participantes: participantesDepartamento,
      porcentajeNacional,
      ranking: ranking > 0 ? ranking : '-',
    };

    console.log('RED', redSeleccionada);
    console.log('DEP', departamento);
    console.log('PARTICIPANTES RED', participantesRed);
    console.log('PARTICIPANTES DEP', participantesDepartamento);
    console.log('TOTAL NACIONAL', this.totalParticipantesFiltrado);
    console.log('PORCENTAJE', porcentajeNacional);

    this.cargarRedesDepartamento(departamento);

    if (this.chartInstance) {
      this.chartInstance.dispatchAction({
        type: 'downplay',
        seriesIndex: 0,
      });

      this.chartInstance.dispatchAction({
        type: 'highlight',
        seriesIndex: 0,
        name: departamento,
      });

      this.chartInstance.dispatchAction({
        type: 'showTip',
        seriesIndex: 0,
        name: departamento,
      });
    }
  }

  onChartInit(ec: any) {
    this.chartInstance = ec;

    ec.off('click');

    ec.on('click', (params: any) => {
      const dep = params.name;

      const ranking =
        this.topDepartamentos.findIndex((x: any) => x.name?.toUpperCase() === dep?.toUpperCase()) +
        1;

      this.departamentoSeleccionado = {
        nombre: dep,
        participantes: Number(params.value || 0),
        ranking: ranking > 0 ? ranking : '-',
      };
      this.cargarRedesDepartamento(dep);
    });
  }

  onCambioRed() {
    this.filtrarPorRed(this.busquedaRed);
    this.seleccionarDepartamentoDesdeRed();

    console.log('RED', this.busquedaRed);
  }

  private cargarMapaPeru() {
    console.log('ENTRO A CARGAR MAPA');

    this.http.get('/maps/peru.geojson').subscribe((geoJson: any) => {
      geoJson.features.forEach((f: any) => {
        f.properties.name = f.properties.NOMBDEP;
      });

      echarts.registerMap('peru', geoJson);

      const departamentosAgrupados: Record<string, number> = {};

      this.resumenRedes.forEach((r: any) => {
        const dep = this.obtenerDepartamento(r.red);

        if (!dep) return;

        departamentosAgrupados[dep] = (departamentosAgrupados[dep] || 0) + Number(r.participantes);
      });

      const dataMapa = Object.entries(departamentosAgrupados).map(([name, value]) => ({
        name,
        value,
      }));

      this.topDepartamentos = [...dataMapa]
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 10);

      if (this.topDepartamentos.length > 0) {
        this.departamentoSeleccionado = {
          nombre: this.topDepartamentos[0].name,
          participantes: this.topDepartamentos[0].value,
          ranking: 1,
        };
      }

      // TOP 5 DEPARTAMENTOS
      this.topDepartamentos = [...dataMapa]
        .sort((a: any, b: any) => Number(b.value) - Number(a.value))
        .slice(0, 5);
      this.topDepartamentos = [...dataMapa].sort((a: any, b: any) => b.value - a.value).slice(0, 5);
      this.departamentoLider = this.topDepartamentos[0];
      this.coberturaNacional = {
        departamentos: dataMapa.length,
        redes: this.redesDisponibles.length,
        participantes: this.totalParticipantesFiltrado,
        capacitaciones: this.statsGlobal.actividades,
      };

      const departamentosOrdenados = [...dataMapa].sort((a: any, b: any) => b.value - a.value);

      this.chartConfigDepartamentos = {
        type: 'bar',

        data: {
          labels: departamentosOrdenados.map((x: any) => x.name),

          datasets: [
            {
              label: 'Participantes',
              data: departamentosOrdenados.map((x: any) => x.value),

              backgroundColor: '#2563eb',
              borderRadius: 8,
            },
          ],
        },

        options: {
          indexAxis: 'y',

          responsive: true,

          plugins: {
            legend: {
              display: false,
            },
          },
        },
      };

      console.table(dataMapa);
      console.table(this.topDepartamentos);

      console.table(dataMapa);

      this.chartConfigMapaPeru = {
        selectedMode: 'single',
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
      // Redes Prestacionales Lima/Callao
      'RP ALMENARA': 'LIMA',
      'RP REBAGLIATI': 'LIMA',
      'RP SABOGAL': 'CALLAO',
      'RP LAMBAYEQUE': 'LAMBAYEQUE',

      INCOR: 'LIMA',
      CNSR: 'LIMA',

      // Redes Asistenciales
      'RA AMAZONAS': 'AMAZONAS',
      'RA ANCASH': 'ANCASH',
      'RA APURIMAC': 'APURIMAC',
      'RA AREQUIPA': 'AREQUIPA',
      'RA AYACUCHO': 'AYACUCHO',
      'RA CAJAMARCA': 'CAJAMARCA',
      'RA CUSCO': 'CUSCO',
      'RA HUANCAVELICA': 'HUANCAVELICA',
      'RA HUANUCO': 'HUANUCO',
      'RA HUARAZ': 'ANCASH',
      'RA ICA': 'ICA',
      'RA JAEN': 'CAJAMARCA',
      'RA JULIACA': 'PUNO',
      'RA JUNIN': 'JUNIN',
      'RA LA LIBERTAD': 'LA LIBERTAD',
      'RA LAMBAYEQUE': 'LAMBAYEQUE',
      'RA LORETO': 'LORETO',
      'RA MADRE DE DIOS': 'MADRE DE DIOS',
      'RA MOQUEGUA': 'MOQUEGUA',
      'RA MOYOBAMBA': 'SAN MARTIN',
      'RA PASCO': 'PASCO',
      'RA PIURA': 'PIURA',
      'RA PUNO': 'PUNO',
      'RA TACNA': 'TACNA',
      'RA TARAPOTO': 'SAN MARTIN',
      'RA TUMBES': 'TUMBES',
      'RA UCAYALI': 'UCAYALI',
    };

    return mapa[red] || '';
  }

  private cargarRedesDepartamento(departamento: string) {
    this.redesDepartamento = this.resumenRedes
      .filter((r: any) => this.obtenerDepartamento(r.red) === departamento)
      .sort((a: any, b: any) => b.participantes - a.participantes);
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
    const anio = String(this.anioSeleccionado);

    forkJoin({
      stats: this.pdpData.getStats('', '', anio),
      resumen: this.pdpData.getResumenRedes('', '', anio),
      dashboard: this.pdpData.getDashboard('', '', anio),
      presupuesto: this.http
        .get<any[]>('http://localhost:3001/api/presupuesto-redes')
        .pipe(catchError(() => of([]))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ stats, resumen, dashboard, presupuesto }) => {
          this.presupuestoRedes = presupuesto;
          console.log('PRESUPUESTO REDES', presupuesto);
          console.log('SEXO', dashboard.participantesSexo);
          console.log('MESES', dashboard.actividadesMes);

          this.statsGlobal = stats;
          console.log('RESUMEN LLEGADO DEL API', resumen.length);
          console.log(resumen);
          this.resumenRedes = resumen;
          console.log('RESUMEN REDES', this.resumenRedes);
          this.redesDisponibles = [...new Set(resumen.map((r) => r.red))].sort();
          this.dashboardData = dashboard;

          this.porcentajeMeta = Math.round(
            (this.totalParticipantesFiltrado / this.metaParticipantes) * 100,
          );
          // Participantes por sexo
          // Agrupar sexo (FEMENINO/Femenino)
          const sexoAgrupado: any = {};

          dashboard.participantesSexo.forEach((x: any) => {
            const raw = (x.sexo || '').toUpperCase().trim();
            const sexo = raw === 'F' ? 'FEMENINO' : raw === 'M' ? 'MASCULINO' : raw || 'Sin dato';

            sexoAgrupado[sexo] = (sexoAgrupado[sexo] || 0) + Number(x.total);
          });

          const coloresSexo: any = { MASCULINO: '#3b82f6', FEMENINO: '#ec4899' };
          this.chartConfigSexo = {
            type: 'doughnut',
            data: {
              labels: Object.keys(sexoAgrupado),
              datasets: [
                {
                  data: Object.values(sexoAgrupado),
                  backgroundColor: Object.keys(sexoAgrupado).map(
                    (s) => coloresSexo[s] || '#9ca3af',
                  ),
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
          this.construirGraficos(stats, this.resumenRedesFiltrado);

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

  editarMeta(): void {
    const nuevaMeta = prompt(
      'Ingrese la nueva meta de participantes',
      this.metaParticipantes.toString(),
    );

    if (!nuevaMeta) {
      return;
    }

    const valor = Number(nuevaMeta);

    if (isNaN(valor) || valor <= 0) {
      alert('Ingrese una cantidad válida mayor a 0');
      return;
    }

    this.metaParticipantes = valor;
  }

  abrirModalMeta(): void {
    this.nuevaMeta = this.metaParticipantes;
    this.mostrarModalMeta = true;
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

  cargandoHistorial = false;

  abrirHistorial() {
    this.filtroHistorial = '';
    this.mostrarHistorial = true;
    this.cargandoHistorial = true;

    this.http.get<any[]>('http://localhost:3001/api/audit-log?limit=300').subscribe({
      next: (apiLogs) => {
        // Combinar con registros locales de expedientes (conversión al formato unificado)
        const locales = this.expedienteService.getHistorial().map((e: any) => ({
          id: null,
          tipo: 'expediente_editado',
          descripcion: `${e.usuario} ${e.accion.toLowerCase()} el expediente ${e.expediente}${e.detalle ? ' — ' + e.detalle : ''}`,
          actor_nombre: e.usuario,
          actor_rol: e.rol || 'Usuario',
          referencia: e.expediente,
          created_at: e.timestamp,
        }));

        const todos = [...apiLogs, ...locales].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        this.historial = todos;
        this.cargandoHistorial = false;
      },
      error: () => {
        // Fallback a solo locales si el backend no responde
        this.historial = this.expedienteService.getHistorial().map((e: any) => ({
          tipo: 'expediente_editado',
          descripcion: `${e.usuario} ${e.accion.toLowerCase()} el expediente ${e.expediente}`,
          actor_nombre: e.usuario,
          actor_rol: e.rol || 'Usuario',
          referencia: e.expediente,
          created_at: e.timestamp,
        }));
        this.cargandoHistorial = false;
      },
    });
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

  actualizarCumplimientoPresupuesto(): void {
    const normalizar = (texto: string) =>
      texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();

    console.log('RED SELECCIONADA', this.redSeleccionada);

    if (!this.redSeleccionada) {
      this.presupuestoAsignado = this.presupuestoRedes.reduce(
        (total, item) => total + Number(item.techo || 0),
        0,
      );

      this.presupuestoEjecutado = this.resumenRedes.reduce(
        (total, item) => total + Number(item.presupuesto || 0),
        0,
      );
    } else {
      const techo = this.presupuestoRedes.find((p) => {
        const nombrePresupuesto = normalizar(p.red);

        const nombreResumen = normalizar(
          this.redSeleccionada.replace('RA ', '').replace('RP ', '').trim(),
        );

        return nombrePresupuesto.includes(nombreResumen);
      });

      const ejecutado = this.resumenRedes.find((r) => r.red === this.redSeleccionada);

      console.log('TECHO ENCONTRADO', techo);
      console.log('EJECUTADO ENCONTRADO', ejecutado);

      this.presupuestoAsignado = Number(techo?.techo || 0);
      this.presupuestoEjecutado = Number(ejecutado?.presupuesto || 0);
    }

    this.saldoDisponible = this.presupuestoAsignado - this.presupuestoEjecutado;

    this.porcentajeCumplimiento =
      this.presupuestoAsignado > 0
        ? (this.presupuestoEjecutado / this.presupuestoAsignado) * 100
        : 0;

    const lider = [...this.resumenRedes].sort(
      (a, b) => Number(b.presupuesto || 0) - Number(a.presupuesto || 0),
    )[0];

    this.redLider = lider?.red || '';
  }

  getColorCumplimiento(): string {
    if (this.porcentajeCumplimiento < 50) {
      return '#ef4444'; // rojo
    }

    if (this.porcentajeCumplimiento < 80) {
      return '#f59e0b'; // amarillo
    }

    if (this.porcentajeCumplimiento <= 100) {
      return '#22c55e'; // verde
    }

    return '#2563eb'; // azul
  }

  private construirRankingPresupuesto(): void {
    this.topEjecucion = [];
    this.topEficiencia = [];

    const normalizar = (texto: string) =>
      texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();

    this.resumenRedes.forEach((red) => {
      console.log('BUSCANDO', red.red);

      const techo = this.presupuestoRedes.find((p) => {
        const nombrePresupuesto = normalizar(p.red);

        const nombreResumen = normalizar(red.red.replace('RA ', '').replace('RP ', '').trim());

        return nombrePresupuesto.includes(nombreResumen);
      });

      console.log('ENCONTRO', techo);

      if (!techo) {
        return;
      }

      const presupuesto = Number(red.presupuesto || 0);
      const techoRed = Number(techo.techo || 0);
      const participantes = Number(red.participantes || 0);

      const porcentaje = techoRed > 0 ? (presupuesto / techoRed) * 100 : 0;

      const costo = participantes > 0 ? presupuesto / participantes : 0;

      this.topEjecucion.push({
        red: red.red,
        porcentaje,
      });

      this.topEficiencia.push({
        red: red.red,
        costo,
        participantes,
      });
    });

    this.topEjecucion = this.topEjecucion.sort((a, b) => b.porcentaje - a.porcentaje).slice(0, 5);

    this.topEficiencia = this.topEficiencia.sort((a, b) => a.costo - b.costo).slice(0, 5);
  }

  nombreRedPresupuesto: Record<string, string> = {
    'RP ALMENARA': 'Red Prestacional Almenara',
    'RP REBAGLIATI': 'Red Prestacional Rebagliati',
    'RP SABOGAL': 'Red Prestacional Sabogal',

    'RA ANCASH': 'Red Asistencial Ancash',
    'RA LA LIBERTAD': 'Red Asistencial La Libertad',
    'RA JUNIN': 'Red Asistencial Junin',
    'RA TACNA': 'Red Asistencial Tacna',
  };

  metaPresupuestoRed: Record<string, number> = {
    'RP ALMENARA': 200000,
    'RA ANCASH': 110000,
    'RP REBAGLIATI': 400000,
    INCOR: 35000,
    'RA LA LIBERTAD': 160000,
    'RA JUNIN': 45000,
    'RP SABOGAL': 140000,
    'RA TACNA': 90000,
  };

  redSeleccionada = '';

  presupuestoAsignado = 2500000;
  presupuestoEjecutado = 1845320;

  porcentajeCumplimiento = 73.8;

  saldoDisponible = 654680;
  redLider = '';
  redes: string[] = [
    'RP ALMENARA',
    'RA ANCASH',
    'RP REBAGLIATI',
    'INCOR',
    'RA LA LIBERTAD',
    'RA JUNIN',
    'RP SABOGAL',
    'RA TACNA',
  ];

  cerrarModalMeta() {
    this.mostrarModalMeta = false;
  }

  formatMoneda(v: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
}
