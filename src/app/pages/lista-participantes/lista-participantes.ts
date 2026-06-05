import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface Participante {
  codigoAct: string;
  dniCe: string;
  codPlanilla: string;
  nombres: string;
  apellidos: string;
  sexo: string;
  redAsist: string;
  subPrograma: string;
  servicioArea: string;
  cargo: string;
  regimenLaboral: string;
}

@Component({
  selector: 'app-lista-participantes',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './lista-participantes.html',
  styleUrl: './lista-participantes.css',
})
export class ListaParticipantes implements OnInit {
  private router = inject(Router);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';

  busqueda = '';
  mostrarFormulario = false;
  errorFormulario = '';

  participantes: Participante[] = [];
  nuevo: Participante = this.vacio();

  get participantesFiltrados(): Participante[] {
    const q = this.busqueda.toLowerCase().trim();
    if (!q) return this.participantes;
    return this.participantes.filter(
      (p) =>
        p.nombres.toLowerCase().includes(q) ||
        p.apellidos.toLowerCase().includes(q) ||
        p.dniCe.includes(q) ||
        p.codigoAct.toLowerCase().includes(q) ||
        p.cargo.toLowerCase().includes(q)
    );
  }

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

    const stored = localStorage.getItem('pdp_participantes');
    if (stored) {
      this.participantes = JSON.parse(stored);
    }
  }

  toggleFormulario() {
    this.mostrarFormulario = !this.mostrarFormulario;
    this.errorFormulario = '';
    if (!this.mostrarFormulario) {
      this.nuevo = this.vacio();
    }
  }

  agregarParticipante() {
    if (!this.nuevo.nombres.trim() || !this.nuevo.apellidos.trim()) {
      this.errorFormulario = 'Los campos Nombres y Apellidos son obligatorios.';
      return;
    }
    this.participantes.push({ ...this.nuevo });
    localStorage.setItem('pdp_participantes', JSON.stringify(this.participantes));
    this.nuevo = this.vacio();
    this.mostrarFormulario = false;
    this.errorFormulario = '';
  }

  eliminarParticipante(index: number) {
    this.participantes.splice(index, 1);
    localStorage.setItem('pdp_participantes', JSON.stringify(this.participantes));
  }

  irA(ruta: string) {
    this.router.navigate([ruta]);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  private vacio(): Participante {
    return {
      codigoAct: '',
      dniCe: '',
      codPlanilla: '',
      nombres: '',
      apellidos: '',
      sexo: '',
      redAsist: '',
      subPrograma: '',
      servicioArea: '',
      cargo: '',
      regimenLaboral: '',
    };
  }
}
