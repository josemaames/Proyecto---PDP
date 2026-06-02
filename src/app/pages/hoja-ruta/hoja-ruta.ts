import { Component, OnInit } from '@angular/core';
import { NgFor } from '@angular/common';

@Component({
  selector: 'app-hoja-ruta',
  imports: [NgFor],
  templateUrl: './hoja-ruta.html',
  styleUrl: './hoja-ruta.css',
})
export class HojaRuta implements OnInit {
  expedientes: any[] = [];
  expedienteSeleccionado: any = null;

  ngOnInit() {
    const expedientesGuardados = localStorage.getItem('expedientes');

    if (expedientesGuardados) {
      this.expedientes = JSON.parse(expedientesGuardados);
      this.expedienteSeleccionado = this.expedientes[0];
    }

    console.log('Expedientes LocalStorage:', this.expedientes);
  }

  verRuta(expediente: string) {
    this.expedienteSeleccionado = this.expedientes.find((e) => e.expediente === expediente);
  }
}
