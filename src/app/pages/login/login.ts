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
      {
        id: 1,
        dni: '90642735',
        password: 'admin123',
        nombre: 'José Manuel Ames Anapán',
        numeroPlantilla: 'PL-0001',
        tipo: 'Especialista PDP',
        rol: 'Administrador',
      },
      {
        id: 2,
        dni: '70435255',
        password: 'admin123',
        nombre: 'Víctor Gabriel Acero Garay',
        numeroPlantilla: 'PL-0002',
        tipo: 'Especialista PDP',
        rol: 'Administrador',
      },
      {
        id: 3,
        dni: '73456264',
        password: 'admin123',
        nombre: 'Fernando David Campos Quiroz',
        numeroPlantilla: 'PL-0003',
        tipo: 'Especialista PDP',
        rol: 'Administrador',
      },
      {
        id: 4,
        dni: '45611148',
        password: 'admin123',
        nombre: 'Sthywen Javier Muñoz Ruiz',
        numeroPlantilla: 'PL-0004',
        tipo: 'Especialista PDP',
        rol: 'Administrador',
      },
      {
        id: 5,
        dni: '11111111',
        password: 'sector123',
        nombre: 'María Torres',
        numeroPlantilla: 'PL-0005',
        tipo: 'Sectorista',
        rol: 'Sectorista',
        sedes: ['Arequipa'],
      },
      {
        id: 6,
        dni: '22222222',
        password: 'ejecutor123',
        nombre: 'Ricardo Mendoza',
        numeroPlantilla: 'PL-0006',
        tipo: 'Ejecutor',
        rol: 'Ejecutor',
        sedes: 'Lurin',
      },
    ];

    const registrados = JSON.parse(localStorage.getItem('usuariosRegistrados') || '[]');
    const todos = [...base, ...registrados];
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
