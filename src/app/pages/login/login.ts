import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  vista: 'login' | 'registro' = 'login';

  // LOGIN
  dni = '';
  password = '';
  mostrarPassword = false;
  error = '';

  // REGISTRO
  regDni = '';
  regPlantilla = '';
  regFechaNac = '';
  regCorreo = '';
  regCelular = '';
  regPassword = '';
  regConfirm = '';
  regRol = 'Sectorista';
  mostrarRegPass = false;
  mostrarRegConfirm = false;
  errorReg = '';
  exitoReg = false;

  constructor(private router: Router) {}

  ingresar() {
    const base = [
      // ── ADMINISTRADORES ──────────────────────────
      {
        id: 1,
        dni: '90642735',
        password: 'admin123',
        nombre: 'José Manuel Ames Anapán',
        numeroPlantilla: 'PL-0001',
        tipo: 'Especialista PDP',
        rol: 'Administrador',
        sedes: [],
      },
      {
        id: 2,
        dni: '70435255',
        password: 'admin123',
        nombre: 'Víctor Gabriel Acero Garay',
        numeroPlantilla: 'PL-0002',
        tipo: 'Especialista PDP',
        rol: 'Administrador',
        sedes: [],
      },
      {
        id: 3,
        dni: '73456264',
        password: 'admin123',
        nombre: 'Fernando David Campos Quiroz',
        numeroPlantilla: 'PL-0003',
        tipo: 'Especialista PDP',
        rol: 'Administrador',
        sedes: [],
      },
      {
        id: 4,
        dni: '45611148',
        password: 'admin123',
        nombre: 'Sthywen Javier Muñoz Ruiz',
        numeroPlantilla: 'PL-0004',
        tipo: 'Especialista PDP',
        rol: 'Administrador',
        sedes: [],
      },
      // ── SECTORISTAS ──────────────────────────────
      {
        id: 5,
        dni: '11111111',
        password: 'sector123',
        nombre: 'María Torres Quispe',
        numeroPlantilla: 'PL-0005',
        tipo: 'Sectorista',
        rol: 'Sectorista',
        sedes: ['Red Asistencial Arequipa'],
      },
      {
        id: 7,
        dni: '33333333',
        password: 'sector123',
        nombre: 'Ana Sofía Paredes Quispe',
        numeroPlantilla: 'PL-0007',
        tipo: 'Sectorista',
        rol: 'Sectorista',
        sedes: ['Red Asistencial Cusco', 'Red Asistencial Arequipa', 'Red Asistencial Piura'],
      },
      // ── EJECUTORES ───────────────────────────────
      {
        id: 6,
        dni: '22222222',
        password: 'ejecutor123',
        nombre: 'Ricardo Mendoza García',
        numeroPlantilla: 'PL-0006',
        tipo: 'Ejecutor',
        rol: 'Ejecutor',
        sedes: ['Lurin'],
      },
      {
        id: 8,
        dni: '44444444',
        password: 'ejecutor123',
        nombre: 'Carlos Alberto Huanca Torres',
        numeroPlantilla: 'PL-0008',
        tipo: 'Ejecutor',
        rol: 'Ejecutor',
        sedes: ['Red Asistencial Arequipa'],
      },
    ];

    const registrados  = JSON.parse(localStorage.getItem('usuariosRegistrados') || '[]');
    const adminUsers   = JSON.parse(localStorage.getItem('usuarios') || '[]');

    // Usuarios del admin panel sobreescriben contraseña y datos del base array
    const mergedBase = base.map(b => {
      const override = adminUsers.find((a: any) => a.dni === b.dni);
      return override ? { ...b, ...override } : b;
    });

    // Usuarios nuevos creados por admin (no están en base) con contraseña asignada
    const baseDnis    = base.map(b => b.dni);
    const soloAdmins  = adminUsers
      .filter((a: any) => !baseDnis.includes(a.dni) && a.password)
      .map((a: any) => ({
        id: a.dni,
        dni: a.dni,
        password: a.password,
        nombre: a.nombre,
        numeroPlantilla: a.dni,
        tipo: a.cargo || a.rol,
        rol: a.rol,
        sedes: a.sedes
          ? (typeof a.sedes === 'string'
              ? a.sedes.split(',').map((s: string) => s.trim()).filter(Boolean)
              : a.sedes)
          : [],
      }));

    const todos = [...mergedBase, ...registrados, ...soloAdmins];
    const usuario = todos.find((u) => u.dni === this.dni && u.password === this.password);

    if (!usuario) {
      this.error = 'Documento de identidad o contraseña incorrectos.';
      return;
    }

    const usuariosAdmin: any[] = JSON.parse(localStorage.getItem('usuarios') || '[]');
    const estadoEnAdmin = usuariosAdmin.find((u: any) => u.dni === usuario.dni);
    if (estadoEnAdmin && estadoEnAdmin.estado === 'Inactivo') {
      this.error = 'Su cuenta ha sido desactivada. Contacte al administrador.';
      return;
    }

    localStorage.setItem('usuario', JSON.stringify(usuario));
    this.error = '';

    switch (usuario.rol) {
      case 'Administrador':
        this.router.navigate(['/dashboard']);
        break;
      case 'Sectorista':
        this.router.navigate(['/sectorista']);
        break;
      case 'Ejecutor':
        this.router.navigate(['/ejecutor']);
        break;
      case 'Administrativo':
        this.router.navigate(['/dashboard']);
        break;
      default:
        this.router.navigate(['/dashboard']);
    }
  }

  registrarse() {
    this.errorReg = '';

    if (
      !this.regDni ||
      !this.regPlantilla ||
      !this.regFechaNac ||
      !this.regCorreo ||
      !this.regCelular ||
      !this.regPassword ||
      !this.regConfirm
    ) {
      this.errorReg = 'Todos los campos son obligatorios.';
      return;
    }

    if (this.regPassword !== this.regConfirm) {
      this.errorReg = 'Las contraseñas no coinciden.';
      return;
    }

    if (this.regPassword.length < 6) {
      this.errorReg = 'La contraseña debe tener mínimo 6 caracteres.';
      return;
    }

    const registrados = JSON.parse(localStorage.getItem('usuariosRegistrados') || '[]');

    if (registrados.some((u: any) => u.dni === this.regDni)) {
      this.errorReg = 'Ya existe un usuario con ese documento de identidad.';
      return;
    }

    registrados.push({
      dni: this.regDni,
      password: this.regPassword,
      nombre: this.regDni,
      numeroPlantilla: this.regPlantilla,
      correo: this.regCorreo,
      celular: this.regCelular,
      fechaNac: this.regFechaNac,
      tipo: this.regRol,
      rol: this.regRol,

      sedes: [],
      sede: '',
    });

    localStorage.setItem('usuariosRegistrados', JSON.stringify(registrados));
    this.exitoReg = true;

    setTimeout(() => {
      this.vista = 'login';
      this.exitoReg = false;
      this.regDni = this.regPlantilla = this.regFechaNac = '';
      this.regCorreo = this.regCelular = this.regPassword = this.regConfirm = '';
      this.regRol = 'Sectorista';
    }, 2000);
  }

  irALogin() {
    this.vista = 'login';
    this.errorReg = '';
    this.exitoReg = false;
  }
}
