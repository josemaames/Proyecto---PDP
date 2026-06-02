import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';

@Component({
  selector: 'app-ejecutor',
  standalone: true,
  imports: [FormsModule, NgFor],
  templateUrl: './ejecutor.html',
  styleUrl: './ejecutor.css',
})
export class Ejecutor {
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

    localStorage.setItem('matrizDnc', JSON.stringify(this.matrizDnc));

    localStorage.setItem('participantesDnc', JSON.stringify(this.participantes));

    alert('✅ Matriz DNC registrada correctamente');
  }
}
