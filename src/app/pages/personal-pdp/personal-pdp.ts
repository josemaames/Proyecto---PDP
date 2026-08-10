import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  PdpDataService,
  PersonalEssalud,
  ResultadoActualizarPersonal,
} from '../../services/pdp-data.service';
import { TopMenu } from '../../components/top-menu/top-menu';

@Component({
  selector: 'app-personal-pdp',
  standalone: true,
  imports: [FormsModule, TopMenu],
  templateUrl: './personal-pdp.html',
  styleUrl: './personal-pdp.css',
})
export class PersonalPdp implements OnInit {
  private router = inject(Router);
  private pdpData = inject(PdpDataService);

  usuarioActual: any = {};
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
  // Filtros manuales (solo disponibles para Administrador/Administrativo —
  // Sectorista/Ejecutor ya vienen restringidos por `redFiltro`, derivado de su
  // red asignada, y no deben poder ver otras redes).
  redSeleccionada = '';
  subProgramaFiltro = '';
  servicioAreaFiltro = '';
  redesDisponibles: string[] = [];
  subProgramasDisponibles: string[] = [];
  serviciosAreaDisponibles: string[] = [];

  personal: PersonalEssalud[] = [];

  // ── Actualizar personal (solo Administrador) ─────
  mostrarModalActualizar = false;
  archivoActualizar: File | null = null;
  subiendoActualizar = false;
  errorActualizar = '';
  resultadoActualizar: ResultadoActualizarPersonal | null = null;

  get esAdministrador(): boolean {
    return this.usuarioActual?.rol === 'Administrador' || this.usuarioActual?.rol === 'SuperAdministrador';
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.totalRegistros / this.limit));
  }

  ngOnInit() {
    this.usuarioActual = JSON.parse(localStorage.getItem('usuario') || '{}');

    this.inicialUsuario = this.usuarioActual?.nombre?.charAt(0)?.toUpperCase() || 'U';

    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

    this.redFiltro = this.pdpData.getRedFiltro();

    this.cargarPersonal();

    // Sectorista/Ejecutor ya tienen su red fija en `redFiltro`; el desplegable
    // manual de red solo aplica cuando no hay esa restricción (Administrador).
    this.pdpData.getFiltrosPersonal().subscribe({
      next: (r) => {
        if (!this.redFiltro) this.redesDisponibles = r.redes;
        this.subProgramasDisponibles = r.subProgramas;
        this.serviciosAreaDisponibles = r.serviciosArea;
      },
    });
  }

  irModulo(modulo: string) {
    switch (modulo) {
      case 'Inicio':
        this.router.navigate(['/dashboard']);
        break;
      case 'Expedientes':
        this.router.navigate(['/expedientes']);
        break;
      case 'Hoja de Ruta':
        this.router.navigate(['/hoja-ruta']);
        break;
      case 'Documentos':
        this.router.navigate(['/documentos']);
        break;
      case 'Personal':
        this.router.navigate(['/personal-pdp']);
        break;
      case 'Participantes':
        this.router.navigate(['/lista-participantes']);
        break;

      case 'Reportes':
        alert(' Módulo Reportes en desarrollo');
        break;

      case 'Presupuesto':
        this.router.navigate(['/presupuesto']);
        break;

      case 'Convenios':
        this.router.navigate(['/convenios']);
        break;

      case 'Carpetas Drive':
        this.router.navigate(['/carpetas-drive']);
        break;

      case 'Administración':
        this.router.navigate(['/personal']);
        break;
      default:
        alert(` El módulo "${modulo}" aún está en desarrollo`);
    }
  }

  cargarPersonal() {
    this.cargando = true;
    this.pdpData
      .getPersonalEssalud(
        this.busqueda,
        this.pagina,
        this.limit,
        this.redFiltro || this.redSeleccionada,
        this.regimenFiltro,
        this.subProgramaFiltro,
        this.servicioAreaFiltro,
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
        this.usuarioActual?.nombre || 'Administrador',
        this.usuarioActual?.rol || '',
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
    window.location.replace('http://localhost:4200/somosessalud/');
  }
}
