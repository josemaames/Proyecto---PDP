import { Component, OnInit } from '@angular/core';
import { NgFor } from '@angular/common';
import { ExpedienteService } from '../../services/expediente.service';

@Component({
  selector: 'app-hoja-ruta',
  imports: [NgFor],
  templateUrl: './hoja-ruta.html',
  styleUrl: './hoja-ruta.css',
})
export class HojaRuta implements OnInit {
  expedientes: any[] = [];
  expedienteSeleccionado: any = null;

  constructor(private expedienteService: ExpedienteService) {}

  ngOnInit() {
    this.expedientes = this.expedienteService.getExpedientesPorRol();

    this.expedienteService.getExpedientes$().subscribe(() => {
      this.expedientes = this.expedienteService.getExpedientesPorRol();

      if (!this.expedienteSeleccionado && this.expedientes.length) {
        this.expedienteSeleccionado = this.expedientes[0];
      }
    });
  }

  verRuta(expediente: string) {
    this.expedienteSeleccionado = this.expedientes.find((e) => e.expediente === expediente);
  }
}
