import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-sectorista',
  imports: [FormsModule],
  templateUrl: './sectorista.html',
  styleUrl: './sectorista.css',
})
export class Sectorista {
  matriz = {
    entidad: 'ESSALUD',
    ruc: '20131257750',
    responsable: '',
    correo: '',
    telefono: '',

    accionFormacion: '',
    tipoAccion: '',
    costoTotal: 0,
    beneficiarios: 0,

    proveedor: '',
    rucProveedor: '',

    financiamiento: 'Sí',
    montoCofinanciado: 0,

    modificacionPdp: 'No',
    informeOrh: '',
  };

  guardarMatriz() {
    localStorage.setItem('matrizPdp', JSON.stringify(this.matriz));

    alert('✅ Matriz PDP guardada correctamente');
  }
}
