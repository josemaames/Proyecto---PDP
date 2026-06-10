import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { PdpDataService, Actividad } from '../../services/pdp-data.service';

@Component({
  selector: 'app-expedientes-pdp',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './expedientes-pdp.html',
  styleUrl: './expedientes-pdp.css',
})
export class ExpedientesPdp implements OnInit {
  private pdpData = inject(PdpDataService);

  capacitaciones: Actividad[] = [];
  seleccionada: Actividad | null = null;

  busqueda = '';
  filtrored = '';
  filtroMod = '';
  pagina = 1;
  limit = 20;
  total = 0;
  cargando = false;
  redFiltro = '';

  // Gestión de ejecutores (solo sectorista)
  rolUsuario = '';
  mostrarModalAsignar = false;
  redesSectorista: string[] = [];
  ejecutoresDisponibles: any[] = [];
  asignaciones: { red: string; ejecutorDni: string; ejecutorNombre: string }[] = [];
  asignRedSeleccionada = '';
  asignEjecutorDni = '';
  asigExito = false;

  private readonly BASE_EJECUTORES = [
    { dni: '22222222', nombre: 'Ricardo Mendoza García', rol: 'Ejecutor', estado: 'Activo' },
    { dni: '44444444', nombre: 'Carlos Alberto Huanca Torres', rol: 'Ejecutor', estado: 'Activo' },
    { dni: '59874123', nombre: 'Ana Lucía Rodríguez Vargas', rol: 'Ejecutor', estado: 'Activo' },
    { dni: '74125896', nombre: 'Carmen Rosa Delgado Silva', rol: 'Ejecutor', estado: 'Inactivo' },
  ];

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  get redesAsignadas(): string[] {
    return this.redFiltro
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }

  ngOnInit() {
    this.redFiltro = this.pdpData.getRedFiltro();
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.rolUsuario = usuario.rol || '';
    if (this.rolUsuario === 'Sectorista') {
      this.redesSectorista = this.redFiltro
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      this.cargarEjecutores();
      this.cargarAsignaciones();
    }
    this.cargar();
  }

  private cargarEjecutores() {
    const adminUsers: any[] = JSON.parse(localStorage.getItem('usuarios') || '[]');
    const merged = this.BASE_EJECUTORES.map((b) => {
      const override = adminUsers.find((a: any) => a.dni === b.dni);
      return override ? { ...b, ...override } : b;
    });
    const nuevos = adminUsers.filter(
      (a: any) => !this.BASE_EJECUTORES.some((b) => b.dni === a.dni) && a.rol === 'Ejecutor',
    );
    this.ejecutoresDisponibles = [...merged, ...nuevos].filter(
      (u) => u.rol === 'Ejecutor' && u.estado !== 'Inactivo',
    );
  }

  private cargarAsignaciones() {
    this.asignaciones = JSON.parse(localStorage.getItem('asignacionesEjecutor') || '[]');
  }

  abrirModalAsignar() {
    this.cargarEjecutores();
    this.cargarAsignaciones();
    this.asignRedSeleccionada = '';
    this.asignEjecutorDni = '';
    this.asigExito = false;
    this.mostrarModalAsignar = true;
  }

  cerrarModalAsignar() {
    this.mostrarModalAsignar = false;
    this.asignRedSeleccionada = '';
    this.asignEjecutorDni = '';
  }

  getEjecutorAsignado(red: string): { nombre: string; dni: string } | null {
    const asig = this.asignaciones.find((a) => a.red === red);
    return asig ? { nombre: asig.ejecutorNombre, dni: asig.ejecutorDni } : null;
  }

  prepararAsignacion(red: string) {
    this.asignRedSeleccionada = red;
    const actual = this.asignaciones.find((a) => a.red === red);
    this.asignEjecutorDni = actual ? actual.ejecutorDni : '';
    this.asigExito = false;
  }

  guardarAsignacion() {
    if (!this.asignRedSeleccionada || !this.asignEjecutorDni) return;
    const ejecutor = this.ejecutoresDisponibles.find((e) => e.dni === this.asignEjecutorDni);
    if (!ejecutor) return;

    const idx = this.asignaciones.findIndex((a) => a.red === this.asignRedSeleccionada);
    const nuevaAsig = {
      red: this.asignRedSeleccionada,
      ejecutorDni: this.asignEjecutorDni,
      ejecutorNombre: ejecutor.nombre,
    };
    if (idx === -1) this.asignaciones.push(nuevaAsig);
    else this.asignaciones[idx] = nuevaAsig;
    localStorage.setItem('asignacionesEjecutor', JSON.stringify(this.asignaciones));

    const usuarios: any[] = JSON.parse(localStorage.getItem('usuarios') || '[]');
    const eidx = usuarios.findIndex((u: any) => u.dni === this.asignEjecutorDni);
    if (eidx !== -1) {
      usuarios[eidx] = { ...usuarios[eidx], sedes: this.asignRedSeleccionada };
    } else {
      usuarios.push({
        dni: this.asignEjecutorDni,
        nombre: ejecutor.nombre,
        rol: 'Ejecutor',
        estado: 'Activo',
        sedes: this.asignRedSeleccionada,
      });
    }
    localStorage.setItem('usuarios', JSON.stringify(usuarios));

    this.asignRedSeleccionada = '';
    this.asignEjecutorDni = '';
    this.asigExito = true;
    setTimeout(() => {
      this.asigExito = false;
    }, 2500);
  }

  quitarAsignacion(red: string) {
    this.asignaciones = this.asignaciones.filter((a) => a.red !== red);
    localStorage.setItem('asignacionesEjecutor', JSON.stringify(this.asignaciones));
    if (this.asignRedSeleccionada === red) {
      this.asignRedSeleccionada = '';
      this.asignEjecutorDni = '';
    }
  }

  cargar() {
    this.cargando = true;
    const red = this.filtrored || this.redFiltro;
    this.pdpData
      .getActividades(this.busqueda, red, this.filtroMod, this.pagina, this.limit)
      .subscribe({
        next: (res) => {
          this.capacitaciones = res.data;
          this.total = res.total;
          this.cargando = false;
        },
        error: () => {
          this.cargando = false;
        },
      });
  }

  buscar() {
    this.pagina = 1;
    this.cargar();
  }

  anterior() {
    if (this.pagina > 1) {
      this.pagina--;
      this.cargar();
    }
  }
  siguiente() {
    if (this.pagina < this.totalPaginas) {
      this.pagina++;
      this.cargar();
    }
  }

  ver(cap: Actividad) {
    this.seleccionada = cap;
  }
  cerrarModal() {
    this.seleccionada = null;
  }

  formatMoneda(v: number | undefined): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
}
