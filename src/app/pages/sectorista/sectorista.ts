import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';

@Component({
  selector: 'app-sectorista',
  imports: [FormsModule, NgFor],
  templateUrl: './sectorista.html',
  styleUrl: './sectorista.css',
})
export class Sectorista {
  matriz = {
    // DATOS GENERALES

    entidad: 'ESSALUD',
    ruc: '20131257750',
    responsable: '',
    correo: '',
    telefono: '',

    // CAPACITACIÓN

    accionFormacion: '',
    tipoAccion: '',
    costoTotal: 0,
    cantidadBeneficiarios: 0,

    // DURACIÓN

    horasCapacitacion: 0,
    horasFueraJornada: 0,

    // EVALUACIÓN

    nivelEvaluacion: '',
    resultadoAprendizaje: '',
    resultadoAplicacion: '',

    // PROVEEDOR

    proveedor: '',
    rucProveedor: '',
    sectorProveedor: '',

    // FINANCIAMIENTO

    financiamiento: 'Sí',
    montoCofinanciado: 0,

    // MODIFICACIÓN PDP

    modificacionPdp: 'No',
    informeOrh: '',
  };

  // BENEFICIARIOS

  beneficiarios = [
    {
      nombre: '',
      dni: '',
      genero: '',
      regimen: '',
      unidad: '',
      puesto: '',
    },
  ];

  agregarBeneficiario() {
    this.beneficiarios.push({
      nombre: '',
      dni: '',
      genero: '',
      regimen: '',
      unidad: '',
      puesto: '',
    });

    this.matriz.cantidadBeneficiarios = this.beneficiarios.length;
  }

  eliminarBeneficiario(index: number) {
    if (this.beneficiarios.length > 1) {
      this.beneficiarios.splice(index, 1);

      this.matriz.cantidadBeneficiarios = this.beneficiarios.length;
    }
  }

  guardarMatriz() {
    this.matriz.cantidadBeneficiarios = this.beneficiarios.length;

    localStorage.setItem('matrizPdp', JSON.stringify(this.matriz));

    localStorage.setItem('beneficiariosPdp', JSON.stringify(this.beneficiarios));

    alert(
      '✅ Registro exitoso.\n\nLa información de la Matriz de Ejecución PDP fue almacenada correctamente.',
    );
  }
}
