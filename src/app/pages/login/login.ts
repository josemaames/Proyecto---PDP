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
      // ADMINISTRADORES

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

      // SECTORISTA

      {
        id: 5,
        dni: '11111111',
        password: 'sector123',
        nombre: 'María Torres',
        numeroPlantilla: 'PL-0005',
        tipo: 'Sectorista',
        rol: 'Sectorista',
      },

      // EJECUTOR

      {
        id: 6,
        dni: '22222222',
        password: 'ejecutor123',
        nombre: 'Ricardo Mendoza',
        numeroPlantilla: 'PL-0006',
        tipo: 'Ejecutor',
        rol: 'Ejecutor',
      },
    ];

    const usuario = usuarios.find((u) => u.dni === this.dni && u.password === this.password);

    if (usuario) {
      localStorage.setItem('usuario', JSON.stringify(usuario));

      if (usuario.rol === 'Administrador') {
        this.router.navigate(['/dashboard']);
      } else if (usuario.rol === 'Sectorista') {
        this.router.navigate(['/sectorista']);
      } else if (usuario.rol === 'Ejecutor') {
        this.router.navigate(['/ejecutor']);
      }
    } else {
      this.error = 'DNI o contraseña incorrectos';
    }
  }
}
