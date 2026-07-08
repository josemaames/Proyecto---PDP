import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { rolesDe, homeDeRol } from '../utils/roles.util';

export function roleGuard(rolesPermitidos: string[]): CanActivateFn {
  return () => {
    const router = inject(Router);
    const raw = localStorage.getItem('usuario');
    if (!raw) { router.navigate(['/login']); return false; }

    const usuario = JSON.parse(raw);
    const roles = rolesDe(usuario);

    // Permite si el usuario tiene AL MENOS uno de los roles requeridos
    if (roles.some((r) => rolesPermitidos.includes(r))) return true;

    // Si no, lo mandamos al home de su primer rol
    router.navigate([homeDeRol(roles[0])]);
    return false;
  };
}
