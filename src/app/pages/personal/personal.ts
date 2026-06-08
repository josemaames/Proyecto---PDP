import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-personal',
  imports: [FormsModule],
  templateUrl: './personal.html',
  styleUrl: './personal.css',
})
export class Personal implements OnInit {
  private router = inject(Router);

  usuarioActual: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';
  mostrarFormulario = false;
  modoEdicion = false;
  dniEditando = '';
  mostrarDetalle = false;
  usuarioSeleccionado: any = null;

  nuevoUsuarioData = {
    dni: '',
    nombre: '',
    cargo: '',
    rol: 'Ejecutor',
    estado: 'Activo',
    sedes: '',
  };

  usuarios: any[] = [
    // ADMINISTRADORES
    {
      dni: '90642735',
      nombre: 'José Manuel Ames Anapán',
      cargo: 'Analista PDP',
      rol: 'Administrador',
      estado: 'Activo',
      foto: 'jose-ames.png',
      sedes: '',
    },
    {
      dni: '70435255',
      nombre: 'Víctor Gabriel Acero Garay',
      cargo: 'Analista PDP',
      rol: 'Administrador',
      estado: 'Activo',
      sedes: '',
    },
    {
      dni: '73456264',
      nombre: 'Fernando David Campos Quiroz',
      cargo: 'Especialista PDP',
      rol: 'Administrador',
      estado: 'Activo',
      sedes: '',
    },
    {
      dni: '45611148',
      nombre: 'Sthywen Javier Muñoz Ruiz',
      cargo: 'Especialista PDP',
      rol: 'Administrador',
      estado: 'Activo',
      foto: 'sthywen-munoz.png',
      sedes: '',
    },

    // SECTORISTAS
    {
      dni: '11111111',
      nombre: 'María Torres Quispe',
      cargo: 'Sectorista Red Arequipa',
      rol: 'Sectorista',
      estado: 'Activo',
      sedes: 'Red Asistencial Arequipa',
    },
    {
      dni: '33333333',
      nombre: 'Ana Sofía Paredes Quispe',
      cargo: 'Sectorista Redes Sur-Centro',
      rol: 'Sectorista',
      estado: 'Activo',
      sedes: 'Red Asistencial Cusco,Red Asistencial Arequipa,Red Asistencial Piura',
    },
    {
      dni: '48562134',
      nombre: 'María Elena Torres Salazar',
      cargo: 'Sectorista Red Rebagliati',
      rol: 'Sectorista',
      estado: 'Activo',
      sedes: 'Red Asistencial Rebagliati',
    },
    {
      dni: '71234589',
      nombre: 'Luis Alberto Sánchez Rojas',
      cargo: 'Sectorista Red Almenara',
      rol: 'Sectorista',
      estado: 'Activo',
      sedes: 'Red Asistencial Almenara',
    },

    // EJECUTORES
    {
      dni: '22222222',
      nombre: 'Ricardo Mendoza García',
      cargo: 'Ejecutor Red Lurin',
      rol: 'Ejecutor',
      estado: 'Activo',
      sedes: 'Lurin',
    },
    {
      dni: '44444444',
      nombre: 'Carlos Alberto Huanca Torres',
      cargo: 'Ejecutor Red Arequipa',
      rol: 'Ejecutor',
      estado: 'Activo',
      sedes: 'Red Asistencial Arequipa',
    },
    {
      dni: '59874123',
      nombre: 'Ana Lucía Rodríguez Vargas',
      cargo: 'Ejecutor de Capacitación',
      rol: 'Ejecutor',
      estado: 'Activo',
      sedes: '',
    },
    {
      dni: '74125896',
      nombre: 'Carmen Rosa Delgado Silva',
      cargo: 'Ejecutor Administrativo',
      rol: 'Ejecutor',
      estado: 'Inactivo',
      sedes: '',
    },
  ];

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

    const VERSION = 'v2';
    if (localStorage.getItem('usuariosVersion') !== VERSION) {
      localStorage.removeItem('usuarios');
      localStorage.setItem('usuariosVersion', VERSION);
    }

    const usuariosGuardados = localStorage.getItem('usuarios');
    if (usuariosGuardados) {
      const guardados: any[] = JSON.parse(usuariosGuardados);
      this.usuarios = this.usuarios.map((base) => {
        const guardado = guardados.find((g: any) => g.dni === base.dni);
        return guardado ? { ...base, ...guardado } : base;
      });
      const dniBase = this.usuarios.map((u) => u.dni);
      guardados.filter((g: any) => !dniBase.includes(g.dni)).forEach((extra: any) => this.usuarios.push(extra));
    }
  }

  irA(ruta: string) { this.router.navigate([ruta]); }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  nuevoUsuario() {
    this.mostrarFormulario = true;
  }

  editarUsuario(dni: string) {
    const usuario = this.usuarios.find((u) => u.dni === dni);

    if (!usuario) return;

    this.nuevoUsuarioData = {
      dni: usuario.dni,
      nombre: usuario.nombre,
      cargo: usuario.cargo,
      rol: usuario.rol,
      estado: usuario.estado,
      sedes: this.sedesTexto(usuario) === '—' ? '' : this.sedesTexto(usuario),
    };

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

    if (usuario) {
      usuario.estado = usuario.estado === 'Activo' ? 'Inactivo' : 'Activo';

      localStorage.setItem('usuarios', JSON.stringify(this.usuarios));
    }
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
  }

  guardarUsuario() {
    if (this.modoEdicion) {
      const index = this.usuarios.findIndex((u) => u.dni === this.dniEditando);
      if (index !== -1) {
        this.usuarios[index] = { ...this.nuevoUsuarioData };
      }
    } else {
      this.usuarios.push({ ...this.nuevoUsuarioData });
    }

    localStorage.setItem('usuarios', JSON.stringify(this.usuarios));

    this.nuevoUsuarioData = {
      dni: '',
      nombre: '',
      cargo: '',
      rol: 'Ejecutor',
      estado: 'Activo',
      sedes: '',
    };

    this.mostrarFormulario = false;
    this.modoEdicion = false;
    this.dniEditando = '';
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
