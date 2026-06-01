import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-expedientes-pdp',
  imports: [NgFor, FormsModule],
  templateUrl: './expedientes-pdp.html',
  styleUrl: './expedientes-pdp.css',
})
export class ExpedientesPdp {
  textoBusqueda = '';

  expedientes = [
    {
      codigo: 'PDP-2026-001',
      accion: 'Seguridad del Paciente',
      estado: 'TDR',
      responsable: 'Oficina Central',
    },

    {
      codigo: 'PDP-2026-002',
      accion: 'Atención al Usuario',
      estado: 'Logística',
      responsable: 'Red Rebagliati',
    },

    {
      codigo: 'PDP-2026-003',
      accion: 'Gestión Hospitalaria',
      estado: 'Convocatoria',
      responsable: 'Red Almenara',
    },
  ];

  expedientesFiltrados = [...this.expedientes];

  constructor(private router: Router) {}

  buscar() {
    const texto = this.textoBusqueda.toLowerCase();

    this.expedientesFiltrados = this.expedientes.filter(
      (e) =>
        e.codigo.toLowerCase().includes(texto) ||
        e.accion.toLowerCase().includes(texto) ||
        e.estado.toLowerCase().includes(texto) ||
        e.responsable.toLowerCase().includes(texto),
    );
  }

  verRuta() {
    this.router.navigate(['/hoja-ruta']);
  }

  nuevoExpediente() {
    alert('Próximamente: Registro de nuevo expediente');
  }
}
