import { Component } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpedienteService } from '../../services/expediente.service';

@Component({
  selector: 'app-expedientes-pdp',
  imports: [NgFor, NgIf, FormsModule],
  templateUrl: './expedientes-pdp.html',
  styleUrl: './expedientes-pdp.css',
})
export class ExpedientesPdp {
  mostrarFormulario = false;
  modoEdicion = false;
  expedienteOriginal = '';

  nuevoExpediente = {
    expediente: '',
    capacitacion: '',
    responsable: '',
    estado: 'TDR',
    presupuesto: 0,
    beneficiarios: 0,
    horasLectivas: 0,
    horasCronologicas: 0,
  };

  expedientes: any[] = [];

  constructor(private expedienteService: ExpedienteService) {}

  ngOnInit() {
    this.expedientes = this.expedienteService.getExpedientes();
    this.expedienteService.getExpedientes$().subscribe((expedientes) => {
      this.expedientes = expedientes;
    });
  }

  abrirFormulario() {
    this.mostrarFormulario = true;
  }

  cancelar() {
    this.mostrarFormulario = false;
  }

  guardarExpediente() {
    if (this.modoEdicion) {
      this.expedienteService.updateExpediente(
        {
          ...this.nuevoExpediente,
        },
        this.expedienteOriginal,
      );
    } else {
      this.expedienteService.addExpediente({
        ...this.nuevoExpediente,
      });
    }

    this.resetFormulario();
  }

  editarExpediente(expedienteCodigo: string) {
    const expediente = this.expedientes.find((item) => item.expediente === expedienteCodigo);
    if (!expediente) {
      return;
    }

    this.modoEdicion = true;
    this.expedienteOriginal = expediente.expediente;
    this.nuevoExpediente = {
      expediente: expediente.expediente,
      capacitacion: expediente.capacitacion,
      responsable: expediente.responsable,
      estado: expediente.estado,
      presupuesto: expediente.presupuesto,
      beneficiarios: expediente.beneficiarios,
      horasLectivas: expediente.horasLectivas || 0,
      horasCronologicas: expediente.horasCronologicas || 0,
    };
    this.mostrarFormulario = true;
  }

  eliminarExpediente(expedienteCodigo: string) {
    if (confirm(`¿Eliminar expediente ${expedienteCodigo}?`)) {
      this.expedienteService.deleteExpediente(expedienteCodigo);
    }
  }

  verExpediente(expedienteCodigo: string) {
    const expediente = this.expedientes.find((item) => item.expediente === expedienteCodigo);
    if (!expediente) {
      alert('Expediente no encontrado');
      return;
    }
    alert(`Expediente: ${expediente.expediente}\nCapacitación: ${expediente.capacitacion}\nResponsable: ${expediente.responsable}\nEstado: ${expediente.estado}\nPresupuesto: S/. ${expediente.presupuesto}\nBeneficiarios: ${expediente.beneficiarios}`);
  }

  resetFormulario() {
    this.mostrarFormulario = false;
    this.modoEdicion = false;
    this.expedienteOriginal = '';
    this.nuevoExpediente = {
      expediente: '',
      capacitacion: '',
      responsable: '',
      estado: 'TDR',
      presupuesto: 0,
      beneficiarios: 0,
      horasLectivas: 0,
      horasCronologicas: 0,
    };
  }
}
