import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export function roleGuard(rolesPermitidos: string[]): CanActivateFn {
  return () => {
    const router = inject(Router);
    const raw = localStorage.getItem('usuario');
    if (!raw) { router.navigate(['/login']); return false; }

    const usuario = JSON.parse(raw);
    if (rolesPermitidos.includes(usuario.rol)) return true;

    // Redirigir al home correcto según el rol real
    switch (usuario.rol) {
      case 'Administrador':
      case 'Administrativo':
        router.navigate(['/dashboard']); break;
      case 'Sectorista':
        router.navigate(['/sectorista']); break;
      case 'Ejecutor':
        router.navigate(['/ejecutor']); break;
      default:
        router.navigate(['/login']);
    }
    return false;
  };
}
