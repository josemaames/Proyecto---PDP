import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PdpDataService, Participante } from '../../services/pdp-data.service';

@Component({
  selector: 'app-lista-participantes',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './lista-participantes.html',
  styleUrl: './lista-participantes.css',
})
export class ListaParticipantes implements OnInit {
  private router = inject(Router);
  private pdpData = inject(PdpDataService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';

  busqueda = '';
  codigoFiltro = '';
  regimenFiltro = '';
  pagina = 1;
  limit = 50;
  totalRegistros = 0;
  redFiltro = '';

  mostrarFormulario = false;
  errorFormulario = '';
  cargando = false;

  participantes: Participante[] = [];

  nuevo = this.vacio();

  // ── Ciclo de vida ─────────────────────────────
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
    console.log('USUARIO:', this.usuario);
    console.log('RED FILTRO:', this.redFiltro);
    this.cargarParticipantes();
  }

  // ── Carga desde API ───────────────────────────
  cargarParticipantes() {
    this.cargando = true;
    this.pdpData
      .getParticipantes(this.busqueda, this.codigoFiltro, this.pagina, this.limit, this.redFiltro, this.regimenFiltro)
      .subscribe({
        next: (res) => {
          this.participantes = res.data;
          this.totalRegistros = res.total;
          this.cargando = false;
        },
        error: (err) => {
          console.error('Error al cargar participantes:', err);
          this.cargando = false;
        },
      });
  }

  buscar() {
    this.pagina = 1;
    this.cargarParticipantes();
  }

  // ── Paginación ────────────────────────────────
  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.totalRegistros / this.limit));
  }

  paginaAnterior() {
    if (this.pagina > 1) {
      this.pagina--;
      this.cargarParticipantes();
    }
  }

  paginaSiguiente() {
    if (this.pagina < this.totalPaginas) {
      this.pagina++;
      this.cargarParticipantes();
    }
  }

  // ── Autocompletar por DNI ─────────────────────
  buscarPorDni() {
    if (this.nuevo.dni_ce && this.nuevo.dni_ce.length >= 8) {
      this.pdpData.getPersonalPorDni(this.nuevo.dni_ce).subscribe({
        next: (p) => {
          this.nuevo.apellidos = p.apellidos || '';
          this.nuevo.nombre = p.nombre || '';
          this.nuevo.cod_planilla = p.cod_planilla || '';
          this.nuevo.sexo = p.sexo || '';
          this.nuevo.red = p.red || '';
          this.nuevo.sub_programa = p.sub_programa || '';
          this.nuevo.servicio_area = p.servicio_area || '';
          this.nuevo.cargo = p.cargo || '';
          this.nuevo.regimen_laboral = p.regimen_laboral || '';
        },
        error: () => {
          /* DNI no encontrado, el usuario lo llena manualmente */
        },
      });
    }
  }

  // ── Formulario ────────────────────────────────
  toggleFormulario() {
    this.mostrarFormulario = !this.mostrarFormulario;
    this.errorFormulario = '';
    if (!this.mostrarFormulario) this.nuevo = this.vacio();
  }

  agregarParticipante() {
    if (!this.nuevo.nombre?.trim() || !this.nuevo.apellidos?.trim()) {
      this.errorFormulario = 'Los campos Nombres y Apellidos son obligatorios.';
      return;
    }
    if (!this.nuevo.codigo_act?.trim()) {
      this.errorFormulario = 'El Código ACT es obligatorio.';
      return;
    }

    this.pdpData.crearParticipante(this.nuevo).subscribe({
      next: () => {
        this.nuevo = this.vacio();
        this.mostrarFormulario = false;
        this.errorFormulario = '';
        this.cargarParticipantes();
      },
      error: (err) => {
        this.errorFormulario = 'Error al guardar: ' + (err.error?.error || err.message);
      },
    });
  }

  eliminarParticipante(id: number | undefined) {
    if (!id) return;
    if (!confirm('¿Eliminar este participante?')) return;
    this.pdpData.eliminarParticipante(id).subscribe(() => this.cargarParticipantes());
  }

  // ── Navegación ────────────────────────────────
  irA(ruta: string) {
    this.router.navigate([ruta]);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  private vacio(): Participante {
    return {
      codigo_act: '',
      dni_ce: '',
      cod_planilla: '',
      nombre: '',
      apellidos: '',
      sexo: '',
      red: '',
      sub_programa: '',
      servicio_area: '',
      cargo: '',
      regimen_laboral: '',
    };
  }
}
