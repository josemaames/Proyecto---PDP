import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-login',
  imports: [FormsModule, CommonModule, HttpClientModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  dni = '';
  password = '';
  error = '';

  private apiUrl = 'http://localhost:8080/api/auth/login';

  constructor(
    private router: Router,
    private http: HttpClient,
  ) {}

  ingresar() {
    this.error = '';

    const body = {
      dni: this.dni,
      password: this.password,
    };

    this.http.post<any>(this.apiUrl, body).subscribe({
      next: (usuario) => {
        localStorage.setItem('usuario', JSON.stringify(usuario));

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

          default:
            this.router.navigate(['/dashboard']);
            break;
        }
      },

      error: () => {
        this.error = 'DNI o contraseña incorrectos';
      },
    });
  }
}
