import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
 selector: 'app-login',
 imports: [FormsModule],
 templateUrl: './login.html',
 styleUrl: './login.css',
})
export class Login {
 private http = inject(HttpClient);
 private router = inject(Router);

 vista: 'login' | 'registro' = 'login';

 // LOGIN
 dni = '';
 password = '';
 mostrarPassword = false;
 error = '';
 cargando = false;

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
 cargandoReg = false;

 ingresar() {
 this.error = '';
 if (!this.dni || !this.password) {
 this.error = 'Ingrese su DNI y contraseña.';
 return;
 }
 this.cargando = true;
 this.http.post<any>('/api/auth/login', { dni: this.dni, password: this.password }).subscribe({
 next: (usuario) => {
 this.cargando = false;
 localStorage.setItem('usuario', JSON.stringify(usuario));
 switch (usuario.rol) {
 case 'Administrador':
 case 'Administrativo':
 this.router.navigate(['/dashboard']); break;
 case 'Sectorista':
 this.router.navigate(['/sectorista']); break;
 case 'Ejecutor':
 this.router.navigate(['/ejecutor']); break;
 default:
 this.router.navigate(['/dashboard']);
 }
 },
 error: (err) => {
 this.cargando = false;
 this.error = err.error?.error || 'Documento de identidad o contraseña incorrectos.';
 },
 });
 }

 registrarse() {
 this.errorReg = '';

 if (!this.regDni || !this.regPlantilla || !this.regFechaNac ||
 !this.regCorreo || !this.regCelular || !this.regPassword || !this.regConfirm) {
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

 this.cargandoReg = true;
 this.http.post<any>('/api/usuarios', {
 dni: this.regDni,
 nombre: this.regDni,
 password: this.regPassword,
 rol: this.regRol,
 numero_plantilla: this.regPlantilla,
 estado: 'Activo',
 sedes: '',
 }).subscribe({
 next: () => {
 this.cargandoReg = false;
 this.exitoReg = true;
 setTimeout(() => {
 this.vista = 'login';
 this.exitoReg = false;
 this.regDni = this.regPlantilla = this.regFechaNac = '';
 this.regCorreo = this.regCelular = this.regPassword = this.regConfirm = '';
 this.regRol = 'Sectorista';
 }, 2000);
 },
 error: (err) => {
 this.cargandoReg = false;
 this.errorReg = err.error?.error || 'Error al registrar usuario.';
 },
 });
 }

 irALogin() {
 this.vista = 'login';
 this.errorReg = '';
 this.exitoReg = false;
 }
}
