import { Component } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-expedientes-pdp',
  imports: [NgFor, NgIf, FormsModule],
  templateUrl: './expedientes-pdp.html',
  styleUrl: './expedientes-pdp.css',
})
export class ExpedientesPdp {
  mostrarFormulario = false;

  nuevoExpediente = {
    expediente: '',
    capacitacion: '',
    responsable: '',
    estado: 'TDR',
    presupuesto: 0,
    beneficiarios: 0,
  };

  expedientes = [
    {
      expediente: 'PDP-2026-001',
      capacitacion: 'Seguridad del Paciente',
      responsable: 'Oficina Central',
      estado: 'TDR',
      presupuesto: 25000,
      beneficiarios: 120,
    },
    {
      expediente: 'PDP-2026-002',
      capacitacion: 'Atención al Usuario',
      responsable: 'Red Rebagliati',
      estado: 'Logística',
      presupuesto: 18000,
      beneficiarios: 90,
    },
    {
      expediente: 'PDP-2026-003',
      capacitacion: 'Gestión Hospitalaria',
      responsable: 'Red Almenara',
      estado: 'Convocatoria',
      presupuesto: 32000,
      beneficiarios: 150,
    },
  ];

  ngOnInit() {
    const expedientesGuardados = localStorage.getItem('expedientes');

    if (expedientesGuardados) {
      this.expedientes = JSON.parse(expedientesGuardados);
    }
  }

  abrirFormulario() {
    this.mostrarFormulario = true;
  }

  cancelar() {
    this.mostrarFormulario = false;
  }

  guardarExpediente() {
    this.expedientes.push({
      ...this.nuevoExpediente,
    });

    localStorage.setItem('expedientes', JSON.stringify(this.expedientes));

    this.nuevoExpediente = {
      expediente: '',
      capacitacion: '',
      responsable: '',
      estado: 'TDR',
      presupuesto: 0,
      beneficiarios: 0,
    };

    this.mostrarFormulario = false;
  }

  verExpediente(expediente: string) {
    alert(`Ver expediente: ${expediente}`);
  }

  editarExpediente(expediente: string) {
    alert(`Editar expediente: ${expediente}`);
  }
}
