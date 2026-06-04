import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatrizDncService } from '../../services/matriz-dnc.service';

@Component({
  selector: 'app-ejecutor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ejecutor.html',
  styleUrl: './ejecutor.css',
})
export class Ejecutor implements OnInit {
  private router = inject(Router);
  private matrizDncService = inject(MatrizDncService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';

  matrizDnc = {
    organo: '',
    centroAsistencial: '',
    servicio: '',

    problema: '',
    capacitacion: '',

    objetivoAprendizaje: '',
    objetivoDesempeno: '',

    cantidadBeneficiarios: 0,
    tipoAccion: '',
    prioridad: '',
    beneficio: '',

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

  ngOnInit() {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

    this.inicialUsuario = this.usuario?.nombre?.charAt(0)?.toUpperCase() || 'U';

    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);
  }

  irA(ruta: string) {
    this.router.navigate([ruta]);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

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
      next: (response) => {
        console.log('Matriz DNC guardada:', response);

        alert('✅ Matriz DNC guardada en PostgreSQL');
      },

      error: (error) => {
        console.error('Error al guardar:', error);

        alert('❌ Error al guardar en PostgreSQL');
      },
    });
  }
}
