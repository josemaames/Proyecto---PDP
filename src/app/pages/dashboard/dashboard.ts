import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgFor, NgClass, NgIf, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ChartConfiguration,
  ChartEvent,
  registerables,
} from 'chart.js';
import { ExpedienteService } from '../../services/expediente.service';

// Registrar todos los elementos de Chart.js
Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  imports: [NgFor, NgClass, FormsModule, NgIf, BaseChartDirective, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements AfterViewInit {
  nombre = '';
  rol = '';

  menuItems: string[] = [];

  textoBusqueda = '';

  @ViewChild('pieChartEstado') pieChartEstado: BaseChartDirective | undefined;
  @ViewChild('pieChartSemaforo') pieChartSemaforo: BaseChartDirective | undefined;
  @ViewChild('barChartResponsable')
  barChartResponsable: BaseChartDirective | undefined;

  // Datos para gráficos
  pieChartDataEstado: any;
  pieChartLabelEstado: string[] = [];
  pieChartOptionsEstado: ChartConfiguration['options'];

  pieChartDataSemaforo: any;
  pieChartLabelSemaforo: string[] = [];
  pieChartOptionsSemaforo: ChartConfiguration['options'];

  barChartDataResponsable: any;
  barChartLabelResponsable: string[] = [];
  barChartOptionsResponsable: ChartConfiguration['options'];

  // Datos para tablas
  expedientesConEstadisticas: any[] = [];
  estadisticasPorResponsable: any[] = [];
  estadisticasTotales = {
    totalExpedientes: 0,
    presupuestoTotal: 0,
    beneficiariosTotal: 0,
  };

  expedientes = [
    {
      expediente: 'PDP-2026-001',
      capacitacion: 'Seguridad del Paciente',
      estado: 'TDR',
      responsable: 'Oficina Central',
      semaforo: 'verde',
    },

    {
      expediente: 'PDP-2026-002',
      capacitacion: 'Atención al Usuario',
      estado: 'Logística',
      responsable: 'Red Rebagliati',
      semaforo: 'amarillo',
    },

    {
      expediente: 'PDP-2026-003',
      capacitacion: 'Gestión Hospitalaria',
      estado: 'Convocatoria',
      responsable: 'Red Almenara',
      semaforo: 'rojo',
    },
  ];

  expedientesFiltrados = [...this.expedientes];

  constructor(
    private router: Router,
    private expedienteService: ExpedienteService,
  ) {
    this.pieChartOptionsEstado = {
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
    };

    this.pieChartOptionsSemaforo = {
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
    };

    this.barChartOptionsResponsable = {
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
    };
  }

  ngOnInit() {
    const usuario = localStorage.getItem('usuario');

    if (usuario) {
      const datos = JSON.parse(usuario);

      this.nombre = datos.nombre;
      this.rol = datos.rol;

      this.cargarMenuPorRol();

      // Cargar datos de gráficos si es Administrador
      if (this.rol === 'Administrador') {
        this.cargarGraficos();
      }
    } else {
      this.router.navigate(['/login']);
    }
  }

  ngAfterViewInit() {
    // Los gráficos se inicializan automáticamente
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

    // Preparar datos para gráfico de pastel - Estados
    this.pieChartLabelEstado = estadoStats.map((s) => s.estado);
    this.pieChartDataEstado = {
      labels: this.pieChartLabelEstado,
      datasets: [
        {
          data: estadoStats.map((s) => s.cantidad),
          backgroundColor: [
            '#FF6384',
            '#36A2EB',
            '#FFCE56',
            '#4BC0C0',
            '#9966FF',
            '#FF9F40',
          ],
          borderColor: [
            '#FF6384',
            '#36A2EB',
            '#FFCE56',
            '#4BC0C0',
            '#9966FF',
            '#FF9F40',
          ],
          borderWidth: 1,
        },
      ],
    };

    // Preparar datos para gráfico de pastel - Semáforo
    this.pieChartLabelSemaforo = semaforoStats.map((s) => s.color);
    this.pieChartDataSemaforo = {
      labels: this.pieChartLabelSemaforo,
      datasets: [
        {
          data: semaforoStats.map((s) => s.cantidad),
          backgroundColor: ['#4CAF50', '#FFC107', '#F44336'],
          borderColor: ['#4CAF50', '#FFC107', '#F44336'],
          borderWidth: 1,
        },
      ],
    };

    // Preparar datos para gráfico de barras - Responsable
    this.barChartLabelResponsable = responsableStats.map((s) => s.responsable);
    this.barChartDataResponsable = {
      labels: this.barChartLabelResponsable,
      datasets: [
        {
          label: 'Cantidad de Expedientes',
          data: responsableStats.map((s) => s.cantidad),
          backgroundColor: '#36A2EB',
          borderColor: '#36A2EB',
          borderWidth: 1,
        },
      ],
    };

    // Preparar datos para tabla
    this.expedientesConEstadisticas = expedientes;
    this.estadisticasPorResponsable = responsableStats.map((r) => {
      const presupuesto = presupuestoStats.find(
        (p) => p.estado === r.responsable,
      )?.presupuesto || 0;
      const beneficiarios = beneficiarioStats.find(
        (b) => b.estado === r.responsable,
      )?.beneficiarios || 0;
      return {
        ...r,
        presupuesto,
        beneficiarios,
      };
    });
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
    const texto = this.textoBusqueda.toLowerCase();

    this.expedientesFiltrados = this.expedientes.filter(
      (e) =>
        e.expediente.toLowerCase().includes(texto) ||
        e.capacitacion.toLowerCase().includes(texto) ||
        e.estado.toLowerCase().includes(texto) ||
        e.responsable.toLowerCase().includes(texto),
    );
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
