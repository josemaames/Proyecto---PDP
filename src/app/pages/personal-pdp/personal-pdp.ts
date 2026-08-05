import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  PdpDataService,
  PersonalEssalud,
  ResultadoActualizarPersonal,
} from '../../services/pdp-data.service';

@Component({
  selector: 'app-personal-pdp',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './personal-pdp.html',
  styleUrl: './personal-pdp.css',
})
export class PersonalPdp implements OnInit {
  private router = inject(Router);
  private pdpData = inject(PdpDataService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';
  mostrarPerfilMenu = false;

  busqueda = '';
  regimenFiltro = '';
  pagina = 1;
  limit = 50;
  totalRegistros = 0;
  cargando = false;
  redFiltro = '';

  personal: PersonalEssalud[] = [];

  // ── Actualizar personal (solo Administrador) ─────
  mostrarModalActualizar = false;
  archivoActualizar: File | null = null;
  subiendoActualizar = false;
  errorActualizar = '';
  resultadoActualizar: ResultadoActualizarPersonal | null = null;

  get esAdministrador(): boolean {
    return this.usuario?.rol === 'Administrador';
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.totalRegistros / this.limit));
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

    this.redFiltro = this.pdpData.getRedFiltro();
    this.cargarPersonal();
  }

  cargarPersonal() {
    this.cargando = true;
    this.pdpData
      .getPersonalEssalud(
        this.busqueda,
        this.pagina,
        this.limit,
        this.redFiltro,
        this.regimenFiltro,
      )
      .subscribe({
        next: (res) => {
          this.personal = res.data;
          this.totalRegistros = res.total;
          this.cargando = false;
        },
        error: (err) => {
          console.error('Error al cargar personal:', err);
          this.cargando = false;
        },
      });
  }

  buscar() {
    this.pagina = 1;
    this.cargarPersonal();
  }

  paginaAnterior() {
    if (this.pagina > 1) {
      this.pagina--;
      this.cargarPersonal();
    }
  }

  paginaSiguiente() {
    if (this.pagina < this.totalPaginas) {
      this.pagina++;
      this.cargarPersonal();
    }
  }

  // ── Actualizar personal ──────────────────────
  abrirModalActualizar() {
    this.archivoActualizar = null;
    this.errorActualizar = '';
    this.resultadoActualizar = null;
    this.mostrarModalActualizar = true;
  }

  cerrarModalActualizar() {
    this.mostrarModalActualizar = false;
  }

  onArchivoActualizar(event: Event) {
    const input = event.target as HTMLInputElement;
    this.archivoActualizar = input.files?.[0] || null;
    this.errorActualizar = '';
  }

  subirActualizacion() {
    if (!this.archivoActualizar) {
      this.errorActualizar = 'Selecciona el archivo Excel del padrón de personal.';
      return;
    }
    this.subiendoActualizar = true;
    this.errorActualizar = '';
    this.pdpData
      .actualizarPersonal(
        this.archivoActualizar,
        this.usuario?.nombre || 'Administrador',
        this.usuario?.rol || '',
      )
      .subscribe({
        next: (res) => {
          this.subiendoActualizar = false;
          this.resultadoActualizar = res;
          this.cargarPersonal();
        },
        error: (err) => {
          this.subiendoActualizar = false;
          this.errorActualizar = err.error?.error || 'No se pudo actualizar el personal.';
        },
      });
  }

  irA(ruta: string) {
    this.router.navigate([ruta]);
  }

  togglePerfilMenu() {
    this.mostrarPerfilMenu = !this.mostrarPerfilMenu;
  }

  volverSomos() {
    window.location.href = 'http://localhost:4200/somosessalud/';
  }
}
