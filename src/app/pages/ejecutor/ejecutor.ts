import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ejecutor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ejecutor.html',
  styleUrl: './ejecutor.css',
})
export class Ejecutor implements OnInit {
  private router = inject(Router);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';

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
    { dni: '', nombre: '', genero: '', regimen: '', puesto: '' },
  ];

  ngOnInit() {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = (this.usuario?.nombre as string)?.charAt(0)?.toUpperCase() || 'U';
    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);
  }

  irA(ruta: string) { this.router.navigate([ruta]); }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  agregarParticipante() {
    this.participantes.push({ dni: '', nombre: '', genero: '', regimen: '', puesto: '' });
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
