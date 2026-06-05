import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
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
  private http = inject(HttpClient);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';
  buscandoRuc = false;
  errorRuc = '';

  formulario = {
    codigoAct: '',
    fechaInicio: '',
    fechaFin: '',
    mesTermino: '',
    redAsistencial: '',
    servicioArea: '',
    nombreActividad: '',
    totalHoras: 0,
    horasFueraHorario: 0,
    frecuencia: '',
    horaInicio: '',
    horaTermino: '',
    modalidad: '',
    publico: '',
    nivelEvaluacion: '',
    totalParticipantes: 0,
    ejeTematico: '',
    rucProveedor: '',
    nombreProveedor: '',
    sectorProveedor: '',
    presupuestoEjecutado: 0,
  };

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

  buscarRuc() {
    const ruc = this.formulario.rucProveedor.trim();
    if (ruc.length !== 11 || !/^\d+$/.test(ruc)) {
      this.errorRuc = 'El RUC debe tener exactamente 11 dígitos numéricos.';
      return;
    }
    this.errorRuc = '';
    this.buscandoRuc = true;
    this.http.get<any>(`https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`).subscribe({
      next: (data) => {
        this.formulario.nombreProveedor = data.nombre || '';
        this.buscandoRuc = false;
      },
      error: () => {
        this.errorRuc = 'No se encontró información para ese RUC.';
        this.buscandoRuc = false;
      },
    });
  }

  guardarFormulario() {
    this.matrizDncService.guardar(this.formulario).subscribe({
      next: () => alert('✅ Formulario guardado correctamente'),
      error: () => alert('❌ Error al guardar el formulario'),
    });
  }
}
