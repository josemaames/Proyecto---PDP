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
    this.expedientes = this.expedienteService.getExpedientes();
    this.expedienteService.getExpedientes$().subscribe((expedientes) => {
      this.expedientes = expedientes;
      if (!this.expedienteSeleccionado && expedientes.length) {
        this.expedienteSeleccionado = expedientes[0];
      }
    });
  }

  verRuta(expediente: string) {
    this.expedienteSeleccionado = this.expedientes.find((e) => e.expediente === expediente);
  }
}
