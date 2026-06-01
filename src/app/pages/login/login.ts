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
    const usuarios = [
      {
        id: 1,
        dni: '90642735',
        password: 'admin123',
        nombre: 'Administrador General',
        numeroPlantilla: 'PL-0001',
        tipo: 'Administrativo',
        rol: 'Administrador',
      },

      {
        id: 2,
        dni: '70435255',
        password: 'admin123',
        nombre: 'Administrador Secundario',
        numeroPlantilla: 'PL-0002',
        tipo: 'Administrativo',
        rol: 'Administrador',
      },

      {
        id: 2,
        dni: '11111111',
        password: 'sector123',
        nombre: 'María Torres',
        numeroPlantilla: 'PL-0002',
        tipo: 'Sectorista',
        rol: 'Sectorista',
      },

      {
        id: 3,
        dni: '22222222',
        password: 'ejecutor123',
        nombre: 'José Manuel Ames Anapan',
        numeroPlantilla: 'PL-0003',
        tipo: 'Ejecutor',
        rol: 'Ejecutor',
      },
    ];

    const usuario = usuarios.find((u) => u.dni === this.dni && u.password === this.password);

    if (usuario) {
      localStorage.setItem('usuario', JSON.stringify(usuario));

      this.router.navigate(['/dashboard']);
    } else {
      this.error = 'DNI o contraseña incorrectos';
    }
  }
}
