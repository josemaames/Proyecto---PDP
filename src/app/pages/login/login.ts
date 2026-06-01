import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  dni = '';
  password = '';
  error = '';

  constructor(private router: Router) {}

  ingresar() {
    console.log('DNI ingresado:', this.dni);
    console.log('Password ingresado:', this.password);

    const usuarios = [
      {
        id: 1,
        dni: '99999999',
        password: 'admin123',
        nombre: 'Administrador General',
        numeroPlantilla: 'PL-0001',
        tipo: 'Administrativo',
        rol: 'Administrador',
      },
      {
        id: 2,
        dni: '11111111',
        password: 'capa123',
        nombre: 'María Torres',
        numeroPlantilla: 'PL-0002',
        tipo: 'Administrativo',
        rol: 'Capacitación',
      },
      {
        id: 3,
        dni: '22222222',
        password: 'logi123',
        nombre: 'José Manuel Ames Anapan',
        numeroPlantilla: 'PL-0003',
        tipo: 'Administrativo',
        rol: 'Logística',
      },
      {
        id: 4,
        dni: '33333333',
        password: 'geren123',
        nombre: 'Carlos Rodríguez',
        numeroPlantilla: 'PL-0004',
        tipo: 'Administrativo',
        rol: 'Gerencia',
      },
      {
        id: 5,
        dni: '44444444',
        password: 'salud123',
        nombre: 'Dra. Ana Pérez',
        numeroPlantilla: 'PL-0005',
        tipo: 'Personal de Salud',
        rol: 'Médico',
      },
    ];

    const usuario = usuarios.find((u) => u.dni === this.dni && u.password === this.password);

    console.log('Usuario encontrado:', usuario);

    if (usuario) {
      localStorage.setItem('usuario', JSON.stringify(usuario));

      console.log('Guardado en localStorage');

      this.router.navigate(['/dashboard']);
    } else {
      this.error = 'DNI o contraseña incorrectos';

      console.error('No se encontró el usuario');
    }
  }
}
