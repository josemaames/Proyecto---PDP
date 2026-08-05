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
  private router = inject(Router);
  private http = inject(HttpClient);
  private pdpData = inject(PdpDataService);

  usuarioActual: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';
  mostrarPerfilMenu = false;
  mostrarFormulario = false;
  modoEdicion = false;
  dniEditando = '';
  mostrarDetalle = false;
  usuarioSeleccionado: any = null;
  mostrarModalExito = false;
  tituloModalExito = '';
  mensajeModalExito = '';

  cerrarModalExito() {
    this.mostrarModalExito = false;
  }

  redesDisponibles: string[] = [];
  sedesSeleccionadas: string[] = [];
  rolesDisponibles = [
    'Administrador',
    'Sectorista',
    'Ejecutor',
    'Presupuesto',
    'Convenios',
    'Administrativo',
  ];
  rolesSeleccionados: string[] = [];
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
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

    this.cargarUsuarios();

    this.pdpData.getResumenRedes().subscribe({
      next: (redes) => {
        this.redesDisponibles = redes.map((r) => r.red).filter((r) => r !== 'Sin Red');
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
        this.errorUsuarios =
          'No se pudo conectar con el servidor. Verifique que el backend esté en ejecución.';
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

  nuevoUsuario() {
    this.nuevoUsuarioData = {
      dni: '',
      nombre: '',
      cargo: '',
      rol: 'Ejecutor',
      estado: 'Activo',
      sedes: '',
      password: '',
      email: '',
    };
    this.sedesSeleccionadas = [];
    this.rolesSeleccionados = [];
    this.mostrarPassword = false;
    this.modoEdicion = false;
    this.mostrarFormulario = true;
  }

  editarUsuario(dni: string) {
    const usuario = this.usuarios.find((u) => u.dni === dni);
    if (!usuario) return;

    const sedesStr = Array.isArray(usuario.sedes) ? usuario.sedes.join(',') : usuario.sedes || '';

    this.rolesSeleccionados =
      usuario.roles && String(usuario.roles).trim()
        ? String(usuario.roles)
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        : usuario.rol
          ? [usuario.rol]
          : [];

    this.nuevoUsuarioData = {
      dni: usuario.dni,
      nombre: usuario.nombre,
      cargo: usuario.cargo,
      rol: usuario.rol,
      estado: usuario.estado,
      sedes: this.rolesSeleccionados.includes('Ejecutor') ? sedesStr : '',
      password: usuario.password || '',
      email: usuario.email || '',
    };

    this.sedesSeleccionadas = this.rolesSeleccionados.includes('Sectorista')
      ? sedesStr
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
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
      next: () => {
        usuario.estado = nuevoEstado;
      },
    });
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
  }

  // Convenios es exclusivo de Administrador/Sectorista: no aplica si el usuario es Ejecutor.
  rolBloqueado(rol: string): boolean {
    return (
      rol === 'Convenios' &&
      this.rolesSeleccionados.includes('Ejecutor') &&
      !this.rolesSeleccionados.includes('Convenios')
    );
  }

  toggleRolSel(rol: string) {
    if (this.rolBloqueado(rol)) return;
    const i = this.rolesSeleccionados.indexOf(rol);
    if (i === -1) this.rolesSeleccionados.push(rol);
    else this.rolesSeleccionados.splice(i, 1);

    // Si se marca Ejecutor con Convenios ya activo, se retira Convenios (incompatibles).
    if (rol === 'Ejecutor' && this.rolesSeleccionados.includes('Ejecutor')) {
      const j = this.rolesSeleccionados.indexOf('Convenios');
      if (j !== -1) this.rolesSeleccionados.splice(j, 1);
    }
  }

  rolSelMarcado(rol: string): boolean {
    return this.rolesSeleccionados.includes(rol);
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
    if (this.rolesSeleccionados.length === 0) {
      alert('Seleccione al menos un rol.');
      return;
    }
    if (this.rolesSeleccionados.includes('Sectorista')) {
      this.nuevoUsuarioData.sedes = this.sedesSeleccionadas.join(',');
    } else if (!this.rolesSeleccionados.includes('Ejecutor')) {
      this.nuevoUsuarioData.sedes = '';
    }

    this.guardando = true;
    const payload = {
      dni: this.nuevoUsuarioData.dni,
      nombre: this.nuevoUsuarioData.nombre,
      password: this.nuevoUsuarioData.password,
      rol: this.rolesSeleccionados[0],
      roles: this.rolesSeleccionados,
      cargo: this.nuevoUsuarioData.cargo,
      estado: this.nuevoUsuarioData.estado,
      sedes: this.nuevoUsuarioData.sedes,
      numero_plantilla: this.nuevoUsuarioData.dni,
      email: this.nuevoUsuarioData.email,
    };

    const req$ = this.modoEdicion
      ? this.http.put<any>(`/api/usuarios/${this.dniEditando}`, payload)
      : this.http.post<any>('/api/usuarios', payload);

    req$.subscribe({
      next: () => {
        this.guardando = false;

        this.cargarUsuarios();

        this.tituloModalExito = this.modoEdicion ? 'Usuario actualizado' : 'Usuario registrado';

        this.mensajeModalExito = this.modoEdicion
          ? 'La información del usuario fue actualizada correctamente.'
          : 'El usuario fue registrado correctamente.';

        this.mostrarModalExito = true;

        this.nuevoUsuarioData = {
          dni: '',
          nombre: '',
          cargo: '',
          rol: 'Ejecutor',
          estado: 'Activo',
          sedes: '',
          password: '',
          email: '',
        };

        this.sedesSeleccionadas = [];
        this.rolesSeleccionados = [];
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
