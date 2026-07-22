/** Helpers de roles (soporta múltiples roles por usuario). */

export function rolesDe(usuario: any): string[] {
  if (!usuario) return [];
  if (Array.isArray(usuario.roles) && usuario.roles.length) return usuario.roles;
  return usuario.rol ? [usuario.rol] : [];
}

export function tieneRol(usuario: any, rol: string): boolean {
  return rolesDe(usuario).includes(rol);
}

export function homeDeRol(rol: string): string {
  switch (rol) {
    case 'Administrador':
    case 'Administrativo':
      return '/dashboard';
    case 'Sectorista':
      return '/sectorista';
    case 'Ejecutor':
      return '/ejecutor';
    case 'Presupuesto':
      return '/presupuesto';
    case 'Convenios':
      return '/convenios';
    default:
      return '/dashboard';
  }
}

/** Normaliza el nombre de una red para emparejar entre tablas ("RP Almenara" == "Red Prestacional Almenara"). */
export function normalizarRedKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/^red (asistencial|prestacional)\s+/i, '')
    .replace(/^(ra|rp)\s+/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
