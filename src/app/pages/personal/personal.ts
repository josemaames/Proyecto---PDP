import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { PdpDataService } from '../../services/pdp-data.service';

@Component({
  selector: 'app-personal',
  imports: [FormsModule],
  templateUrl: './personal.html',
  styleUrl: './personal.css',
})
export class Personal implements OnInit {
  private router   = inject(Router);
  private http     = inject(HttpClient);
  private pdpData  = inject(PdpDataService);

  usuarioActual: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';
  mostrarFormulario = false;
  modoEdicion = false;
  dniEditando = '';
  mostrarDetalle = false;
  usuarioSeleccionado: any = null;

  redesDisponibles: string[] = [];
  sedesSeleccionadas: string[] = [];
  mostrarPassword = false;

  nuevoUsuarioData = {
    dni: '',
    nombre: '',
    cargo: '',
    rol: 'Ejecutor',
    estado: 'Activo',
    sedes: '',
    password: '',
    email: '',
  };

  usuarios: any[] = [];
  guardando = false;
  cargandoUsuarios = false;
  errorUsuarios = '';

  textoBusqueda = '';
  filtroRol = 'Todos';
  filtroEstado = 'Todos';

  ngOnInit() {
    this.usuarioActual = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = (this.usuarioActual?.nombre as string)?.charAt(0)?.toUpperCase() || 'U';
    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

    this.cargarUsuarios();

    this.pdpData.getResumenRedes().subscribe({
      next: (redes) => {
        this.redesDisponibles = redes.map(r => r.red).filter(r => r !== 'Sin Red');
      },
    });
  }

  cargarUsuarios() {
    this.cargandoUsuarios = true;
    this.errorUsuarios = '';
    this.http.get<any[]>('/api/usuarios').subscribe({
      next: (data) => {
        this.usuarios = data;
        this.cargandoUsuarios = false;
      },
      error: () => {
        this.cargandoUsuarios = false;
        this.errorUsuarios = 'No se pudo conectar con el servidor. Verifique que el backend esté en ejecución.';
      },
    });
  }

  irA(ruta: string) { this.router.navigate([ruta]); }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  nuevoUsuario() {
    this.nuevoUsuarioData = { dni: '', nombre: '', cargo: '', rol: 'Ejecutor', estado: 'Activo', sedes: '', password: '', email: '' };
    this.sedesSeleccionadas = [];
    this.mostrarPassword = false;
    this.modoEdicion = false;
    this.mostrarFormulario = true;
  }

  editarUsuario(dni: string) {
    const usuario = this.usuarios.find((u) => u.dni === dni);
    if (!usuario) return;

    const sedesStr = Array.isArray(usuario.sedes)
      ? usuario.sedes.join(',')
      : (usuario.sedes || '');

    this.nuevoUsuarioData = {
      dni:      usuario.dni,
      nombre:   usuario.nombre,
      cargo:    usuario.cargo,
      rol:      usuario.rol,
      estado:   usuario.estado,
      sedes:    usuario.rol === 'Ejecutor' ? sedesStr : '',
      password: usuario.password || '',
      email:    usuario.email || '',
    };

    this.sedesSeleccionadas = usuario.rol === 'Sectorista'
      ? sedesStr.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    this.mostrarPassword = false;
    this.dniEditando = dni;
    this.modoEdicion = true;
    this.mostrarFormulario = true;
  }

  verUsuario(dni: string) {
    const usuario = this.usuarios.find((u) => u.dni === dni);

    if (usuario) {
      this.usuarioSeleccionado = usuario;
      this.mostrarDetalle = true;
    }
  }

  cambiarEstado(dni: string) {
    const usuario = this.usuarios.find((u) => u.dni === dni);
    if (!usuario) return;
    const nuevoEstado = usuario.estado === 'Activo' ? 'Inactivo' : 'Activo';
    this.http.put<any>(`/api/usuarios/${dni}`, { estado: nuevoEstado }).subscribe({
      next: () => { usuario.estado = nuevoEstado; },
    });
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
  }

  toggleSede(red: string) {
    const idx = this.sedesSeleccionadas.indexOf(red);
    if (idx === -1) this.sedesSeleccionadas.push(red);
    else this.sedesSeleccionadas.splice(idx, 1);
  }

  sedeSeleccionada(red: string): boolean {
    return this.sedesSeleccionadas.includes(red);
  }

  guardarUsuario() {
    const rol = this.nuevoUsuarioData.rol;
    if (rol === 'Sectorista') {
      this.nuevoUsuarioData.sedes = this.sedesSeleccionadas.join(',');
    } else if (rol === 'Administrador' || rol === 'Administrativo') {
      this.nuevoUsuarioData.sedes = '';
    }

    this.guardando = true;
    const payload = {
      dni:              this.nuevoUsuarioData.dni,
      nombre:           this.nuevoUsuarioData.nombre,
      password:         this.nuevoUsuarioData.password,
      rol:              this.nuevoUsuarioData.rol,
      cargo:            this.nuevoUsuarioData.cargo,
      estado:           this.nuevoUsuarioData.estado,
      sedes:            this.nuevoUsuarioData.sedes,
      numero_plantilla: this.nuevoUsuarioData.dni,
      email:            this.nuevoUsuarioData.email,
    };

    const req$ = this.modoEdicion
      ? this.http.put<any>(`/api/usuarios/${this.dniEditando}`, payload)
      : this.http.post<any>('/api/usuarios', payload);

    req$.subscribe({
      next: () => {
        this.guardando = false;
        this.cargarUsuarios();
        this.nuevoUsuarioData = { dni: '', nombre: '', cargo: '', rol: 'Ejecutor', estado: 'Activo', sedes: '', password: '', email: '' };
        this.sedesSeleccionadas = [];
        this.mostrarPassword = false;
        this.mostrarFormulario = false;
        this.modoEdicion = false;
        this.dniEditando = '';
      },
      error: (err) => {
        this.guardando = false;
        alert(err.error?.error || 'Error al guardar el usuario.');
      },
    });
  }

  sedesTexto(usuario: any): string {
    if (!usuario.sedes) return '—';
    if (Array.isArray(usuario.sedes)) return usuario.sedes.join(', ') || '—';
    return usuario.sedes || '—';
  }

  cancelarUsuario() {
    this.mostrarFormulario = false;
  }

  get usuariosFiltrados() {
    return this.usuarios.filter((usuario) => {
      const coincideTexto =
        usuario.nombre.toLowerCase().includes(this.textoBusqueda.toLowerCase()) ||
        usuario.dni.includes(this.textoBusqueda);

      const coincideRol = this.filtroRol === 'Todos' || usuario.rol === this.filtroRol;

      const coincideEstado = this.filtroEstado === 'Todos' || usuario.estado === this.filtroEstado;

      return coincideTexto && coincideRol && coincideEstado;
    });
  }

  get totalAdministradores() {
    return this.usuarios.filter((u) => u.rol === 'Administrador').length;
  }

  get totalSectoristas() {
    return this.usuarios.filter((u) => u.rol === 'Sectorista').length;
  }

  get totalEjecutores() {
    return this.usuarios.filter((u) => u.rol === 'Ejecutor').length;
  }

  get totalActivos() {
    return this.usuarios.filter((u) => u.estado === 'Activo').length;
  }

  get totalInactivos() {
    return this.usuarios.filter((u) => u.estado === 'Inactivo').length;
  }
}
