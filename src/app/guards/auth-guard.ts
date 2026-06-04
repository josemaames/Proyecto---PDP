import { CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  const usuario = localStorage.getItem('usuario');
  return !!usuario;
};