import { Component, OnInit, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgFor, NgClass, NgIf, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';
import { ExpedienteService } from '../../services/expediente.service';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgFor, NgClass, FormsModule, NgIf, DecimalPipe, BaseChartDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, AfterViewInit {
  nombre = '';
  rol = '';

  menuItems: string[] = [];

  textoBusqueda = '';
  expedienteSeleccionado: any = null;

  modoDetalle = false;

  estadisticasOriginales = {
    totalExpedientes: 0,
    presupuestoTotal: 0,
    beneficiariosTotal: 0,
  };

  // Configuraciones de gráficos
  chartConfigEstado: any;
  chartConfigSemaforo: any;
  chartConfigResponsable: any;

  // Datos para tablas
  expedientesConEstadisticas: any[] = [];

  cargarExpedientesLocalStorage() {
    const expedientesGuardados = localStorage.getItem('expedientes');

    if (expedientesGuardados) {
      this.expedientesConEstadisticas = JSON.parse(expedientesGuardados);
    }
  }

  calcularEstadisticas() {
    this.estadisticasTotales = {
      totalExpedientes: this.expedientesConEstadisticas.length,
      presupuestoTotal: this.expedientesConEstadisticas.reduce(
        (sum, e) => sum + (e.presupuesto || 0),
        0,
      ),
      beneficiariosTotal: this.expedientesConEstadisticas.reduce(
        (sum, e) => sum + (e.beneficiarios || 0),
        0,
      ),
    };
  }

  estadisticasPorResponsable: any[] = [];
  estadisticasTotales = {
    totalExpedientes: 0,
    presupuestoTotal: 0,
    beneficiariosTotal: 0,
  };

  expedientes = [
    {
      expediente: 'PDP-2026-001',
      capacitacion: 'GOBIERNO DIGITAL EN LA GESTIÓN PÚBLICA',
      estado: 'TDR',
      responsable: 'Oficina Central',
      semaforo: 'verde',
      beneficiarios: 30,
      presupuesto: 15000,
    },

    {
      expediente: 'PDP-2026-002',
      capacitacion: 'DERECHO ADMINISTRATIVO Y SEGURIDAD SOCIAL',
      estado: 'Logística',
      responsable: 'Red Rebagliati',
      semaforo: 'amarillo',
      beneficiarios: 19,
      presupuesto: 5000,
    },

    {
      expediente: 'PDP-2026-003',
      capacitacion: 'ARBITRAJE CON LA NUEVA LEY GENERAL DE CONTRATACIONES PUBLICAS',
      estado: 'Convocatoria',
      responsable: 'Red Almenara',
      semaforo: 'rojo',
      beneficiarios: 19,
      presupuesto: 5000,
    },

    {
      expediente: 'PDP-2026-004',
      capacitacion: 'REDACCION DE DOCUMENTOS TECNICOS',
      estado: 'TDR',
      responsable: 'Oficina Central',
      semaforo: 'verde',
      beneficiarios: 33,
      presupuesto: 15000,
    },

    {
      expediente: 'PDP-2026-005',
      capacitacion: 'TALLER EDUCACION INICIA: JUEGOS, INTERACCIONES Y PROYECTOS',
      estado: 'Finalizado',
      responsable: 'Red Vitarte',
      semaforo: 'verde',
      beneficiarios: 37,
      presupuesto: 5000,
    },
  ];

  expedientesFiltrados = [...this.expedientes];

  constructor(
    private router: Router,
    private expedienteService: ExpedienteService,
  ) {}

  ngOnInit() {
    const usuario = localStorage.getItem('usuario');

    if (usuario) {
      const datos = JSON.parse(usuario);

      this.nombre = datos.nombre;
      this.rol = datos.rol;

      this.cargarMenuPorRol();
      this.cargarExpedientesLocalStorage();

      // Cargar datos de expedientes
      const expedientes = this.expedienteService.getExpedientes();
      this.expedientesConEstadisticas = expedientes;
      this.calcularEstadisticas();
      this.cargarGraficos();
    } else {
      this.router.navigate(['/login']);
    }
  }

  ngAfterViewInit() {
    // Inicializar
  }

  cargarGraficos() {
    // Obtener datos del servicio
    const expedientes = this.expedienteService.getExpedientes();
    const estadoStats = this.expedienteService.getEstadisticasPorEstado();
    const semaforoStats = this.expedienteService.getEstadisticasSemaforo();
    const responsableStats = this.expedienteService.getEstadisticasPorResponsable();
    const presupuestoStats = this.expedienteService.getPresupuestoPorEstado();
    const beneficiarioStats = this.expedienteService.getBeneficiariosPorEstado();

    // Calcular totales
    this.estadisticasTotales.totalExpedientes = expedientes.length;
    this.estadisticasTotales.presupuestoTotal = expedientes.reduce(
      (sum, e) => sum + (e.presupuesto || 0),
      0,
    );
    this.estadisticasTotales.beneficiariosTotal = expedientes.reduce(
      (sum, e) => sum + (e.beneficiarios || 0),
      0,
    );

    this.estadisticasPorResponsable = responsableStats;

    this.estadisticasOriginales = {
      totalExpedientes: this.estadisticasTotales.totalExpedientes,
      presupuestoTotal: this.estadisticasTotales.presupuestoTotal,
      beneficiariosTotal: this.estadisticasTotales.beneficiariosTotal,
    };

    // Configuración de gráfico de pastel - Estados
    this.chartConfigEstado = {
      type: 'pie',
      data: {
        labels: estadoStats.map((s) => s.estado),
        datasets: [
          {
            data: estadoStats.map((s) => s.cantidad),
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
            borderColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
          title: {
            display: true,
            text: 'Expedientes por Estado',
          },
        },
      },
    };

    // Configuración de gráfico de pastel - Semáforo
    this.chartConfigSemaforo = {
      type: 'pie',
      data: {
        labels: semaforoStats.map((s) => s.color),
        datasets: [
          {
            data: semaforoStats.map((s) => s.cantidad),
            backgroundColor: ['#4CAF50', '#FFC107', '#F44336'],
            borderColor: ['#4CAF50', '#FFC107', '#F44336'],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
          title: {
            display: true,
            text: 'Estado de Cumplimiento',
          },
        },
      },
    };

    // Configuración de gráfico de barras - Responsable
    this.chartConfigResponsable = {
      type: 'bar',
      data: {
        labels: responsableStats.map((s) => s.responsable),
        datasets: [
          {
            label: 'Cantidad de Expedientes',
            data: responsableStats.map((s) => s.cantidad),
            backgroundColor: '#36A2EB',
            borderColor: '#36A2EB',
            borderWidth: 1,
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
          title: {
            display: true,
            text: 'Expedientes por Responsable',
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
            },
          },
        },
      },
    };
  }

  cargarMenuPorRol() {
    switch (this.rol) {
      case 'Administrador':
        this.menuItems = [
          'Dashboard',
          'Expedientes PDP',
          'Hoja de Ruta',
          'Personal de Salud',
          'Personal Administrativo',
          'Reportes',
          'Configuración',
        ];
        break;

      case 'Sectorista':
        this.menuItems = ['Dashboard', 'Expedientes PDP', 'Hoja de Ruta', 'Reportes'];
        break;

      case 'Ejecutor':
        this.menuItems = ['Dashboard', 'Expedientes PDP', 'Hoja de Ruta'];
        break;

      default:
        this.menuItems = ['Dashboard'];
    }
  }

  buscar() {
    const texto = this.textoBusqueda.toLowerCase().trim();

    if (!texto) {
      this.expedienteSeleccionado = null;
      this.modoDetalle = false;

      this.estadisticasTotales = {
        ...this.estadisticasOriginales,
      };

      this.cargarGraficos();

      return;
    }

    const encontrado = this.expedientesConEstadisticas.find(
      (e) =>
        e.expediente.toLowerCase().includes(texto) || e.capacitacion.toLowerCase().includes(texto),
    );

    if (encontrado) {
      this.expedienteSeleccionado = encontrado;
      this.modoDetalle = true;

      this.estadisticasTotales = {
        totalExpedientes: 1,
        presupuestoTotal: encontrado.presupuesto || 0,
        beneficiariosTotal: encontrado.beneficiarios || 0,
      };

      this.chartConfigEstado = {
        ...this.chartConfigEstado,
        data: {
          labels: [encontrado.estado],
          datasets: [
            {
              data: [1],
              backgroundColor: ['#36A2EB'],
            },
          ],
        },
      };

      this.chartConfigSemaforo = {
        ...this.chartConfigSemaforo,
        data: {
          labels: [encontrado.semaforo],
          datasets: [
            {
              data: [1],
              backgroundColor: [
                encontrado.semaforo === 'verde'
                  ? '#4CAF50'
                  : encontrado.semaforo === 'amarillo'
                    ? '#FFC107'
                    : '#F44336',
              ],
            },
          ],
        },
      };

      this.chartConfigResponsable = {
        ...this.chartConfigResponsable,
        data: {
          labels: [encontrado.responsable],
          datasets: [
            {
              label: 'Expedientes',
              data: [1],
              backgroundColor: '#36A2EB',
            },
          ],
        },
      };
    } else {
      alert('No se encontró el expediente');
    }
  }

  formatearMoneda(valor: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(valor);
  }

  irModulo(modulo: string) {
    if (modulo === 'Dashboard') {
      this.router.navigate(['/dashboard']);
      return;
    }

    if (modulo === 'Expedientes PDP') {
      this.router.navigate(['/expedientes']);
      return;
    }

    if (modulo === 'Hoja de Ruta') {
      this.router.navigate(['/hoja-ruta']);
      return;
    }

    alert(`🚧 El módulo "${modulo}" aún está en desarrollo`);
  }

  verRuta() {
    this.router.navigate(['/hoja-ruta']);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}
