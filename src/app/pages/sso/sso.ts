import { Component, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
<<<<<<< HEAD
=======
import { rolesDe, homeDeRol } from '../../utils/roles.util';
>>>>>>> a80a6f488cc5dc2839edc28c40612c09b2bc27d5

/**
 * Aterrizaje del SSO desde SOMOS.
 * El backend valida el token contra SOMOS y redirige aquí con la sesión
 * codificada en base64 (query param `u`). Aquí se guarda en localStorage
 * (igual que el login normal) y se envía al home según el rol.
 */
@Component({
  selector: 'app-sso',
  standalone: true,
  template: `<div class="sso-cargando">{{ mensaje }}</div>`,
  styles: [`
    .sso-cargando {
      display: flex; height: 100vh; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif; font-size: 16px; color: #555;
    }
  `],
})
export class Sso implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  mensaje = 'Ingresando…';

  ngOnInit(): void {
    const u = this.route.snapshot.queryParamMap.get('u');
    if (!u) {
      this.mensaje = 'Enlace de ingreso inválido.';
      this.router.navigate(['/login']);
      return;
    }
    try {
      // base64 -> UTF-8 (los nombres traen tildes/ñ)
      const json = decodeURIComponent(escape(atob(u)));
      const usuario = JSON.parse(json);
      localStorage.setItem('usuario', JSON.stringify(usuario));
<<<<<<< HEAD
      this.redirigir(usuario.rol);
=======
      const rolPrincipal = rolesDe(usuario)[0];
      this.router.navigate([homeDeRol(rolPrincipal)]);
>>>>>>> a80a6f488cc5dc2839edc28c40612c09b2bc27d5
    } catch {
      this.mensaje = 'No se pudo procesar el ingreso.';
      this.router.navigate(['/login']);
    }
  }
<<<<<<< HEAD

  private redirigir(rol: string): void {
    switch (rol) {
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
  }
=======
>>>>>>> a80a6f488cc5dc2839edc28c40612c09b2bc27d5
}
