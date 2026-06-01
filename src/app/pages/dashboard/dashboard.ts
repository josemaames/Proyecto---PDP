import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NgFor, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  imports: [NgFor, NgClass, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  nombre = '';
  rol = '';

  menuItems: string[] = [];

  textoBusqueda = '';

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

  constructor(private router: Router) {}

  ngOnInit() {
    const usuario = localStorage.getItem('usuario');

    if (usuario) {
      const datos = JSON.parse(usuario);

      this.nombre = datos.nombre;
      this.rol = datos.rol;

      this.cargarMenuPorRol();
    } else {
      this.router.navigate(['/login']);
    }
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

      case 'Capacitación':
        this.menuItems = ['Dashboard', 'Expedientes PDP', 'Hoja de Ruta', 'Reportes'];
        break;

      case 'Logística':
        this.menuItems = ['Dashboard', 'Expedientes PDP', 'Convocatorias', 'Hoja de Ruta'];
        break;

      case 'Gerencia':
        this.menuItems = ['Dashboard', 'Reportes', 'Indicadores'];
        break;

      case 'Médico':
        this.menuItems = ['Mis Capacitaciones', 'Estado de Solicitudes'];
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

  verRuta() {
    this.router.navigate(['/hoja-ruta']);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}
