import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';

import { MatrizDncService } from '../../services/matriz-dnc.service';

@Component({
  selector: 'app-ejecutor',
  standalone: true,
  imports: [FormsModule, NgFor, HttpClientModule],
  templateUrl: './ejecutor.html',
  styleUrl: './ejecutor.css',
})
export class Ejecutor {
  constructor(private matrizDncService: MatrizDncService) {}

  matrizDnc = {
    // IDENTIFICACIÓN
    organo: '',
    centroAsistencial: '',
    servicio: '',

    // NECESIDAD
    problema: '',
    capacitacion: '',

    // OBJETIVOS
    objetivoAprendizaje: '',
    objetivoDesempeno: '',

    // CAPACITACIÓN
    cantidadBeneficiarios: 0,
    tipoAccion: '',
    prioridad: '',
    beneficio: '',

    // COSTOS
    costoDirecto: 0,
    costoIndirecto: 0,
    costoTotal: 0,
  };

  participantes = [
    {
      dni: '',
      nombre: '',
      genero: '',
      regimen: '',
      puesto: '',
    },
  ];

  agregarParticipante() {
    this.participantes.push({
      dni: '',
      nombre: '',
      genero: '',
      regimen: '',
      puesto: '',
    });
  }

  eliminarParticipante(index: number) {
    if (this.participantes.length > 1) {
      this.participantes.splice(index, 1);
    }
  }

  calcularCostoTotal() {
    this.matrizDnc.costoTotal =
      Number(this.matrizDnc.costoDirecto) + Number(this.matrizDnc.costoIndirecto);
  }

  guardarDnc() {
    this.matrizDnc.cantidadBeneficiarios = this.participantes.length;

    this.calcularCostoTotal();

    this.matrizDncService.guardar(this.matrizDnc).subscribe({
      next: () => {
        alert('✅ Matriz DNC guardada en PostgreSQL');
      },

      error: (err: any) => {
        console.error(err);

        alert('❌ Error al guardar');
      },
    });
  }
}
