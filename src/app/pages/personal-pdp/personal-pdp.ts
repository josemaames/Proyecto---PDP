import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface PersonalItem {
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
  selector: 'app-personal-pdp',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './personal-pdp.html',
  styleUrl: './personal-pdp.css',
})
export class PersonalPdp implements OnInit {
  private router = inject(Router);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';

  busqueda = '';
  mostrarFormulario = false;
  errorFormulario = '';

  personal: PersonalItem[] = [];
  nuevo: PersonalItem = this.vacio();

  get personalFiltrado(): PersonalItem[] {
    const q = this.busqueda.toLowerCase().trim();
    if (!q) return this.personal;
    return this.personal.filter(
      (p) =>
        p.nombres.toLowerCase().includes(q) ||
        p.apellidos.toLowerCase().includes(q) ||
        p.dniCe.includes(q) ||
        p.cargo.toLowerCase().includes(q) ||
        p.redAsist.toLowerCase().includes(q)
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

    const stored = localStorage.getItem('pdp_personal');
    if (stored) {
      this.personal = JSON.parse(stored);
    }
  }

  toggleFormulario() {
    this.mostrarFormulario = !this.mostrarFormulario;
    this.errorFormulario = '';
    if (!this.mostrarFormulario) {
      this.nuevo = this.vacio();
    }
  }

  agregarPersonal() {
    if (!this.nuevo.dniCe.trim()) {
      this.errorFormulario = 'El campo DNI / CE es obligatorio.';
      return;
    }
    if (!this.nuevo.nombres.trim() || !this.nuevo.apellidos.trim()) {
      this.errorFormulario = 'Los campos Nombres y Apellidos son obligatorios.';
      return;
    }
    this.personal.push({ ...this.nuevo });
    localStorage.setItem('pdp_personal', JSON.stringify(this.personal));
    this.nuevo = this.vacio();
    this.mostrarFormulario = false;
    this.errorFormulario = '';
  }

  eliminarPersonal(index: number) {
    this.personal.splice(index, 1);
    localStorage.setItem('pdp_personal', JSON.stringify(this.personal));
  }

  irA(ruta: string) {
    this.router.navigate([ruta]);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  private vacio(): PersonalItem {
    return {
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
