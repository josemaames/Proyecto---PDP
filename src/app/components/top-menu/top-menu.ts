import { Component, EventEmitter, Output, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { rolesDe, homeDeRol } from '../../utils/roles.util';

interface ItemMenu {
  etiqueta: string;
  ruta: string;
  roles: string[]; // vacío = visible para cualquier rol logueado
  icono: string; // nombre clave, ver plantilla
}

// Roles con acceso, calcados 1:1 de las guardas reales en app.routes.ts —
// esta es la única fuente de verdad de "qué rol ve qué botón". No inventar
// accesos nuevos acá: si un rol no puede entrar a la ruta, tampoco debe ver
// el botón (antes cada página mostraba botones que igual rebotaban).
// SuperAdministrador ve todo lo que ve Administrador/Administrativo, más
// "Administración" — que a su vez es la ÚNICA opción exclusiva de ese rol.
const SUPERADMIN = ['SuperAdministrador'];
const ADMIN = ['Administrador', 'Administrativo', ...SUPERADMIN];
const SECTORISTA = ['Sectorista'];
const EJECUTOR = ['Ejecutor'];
const PRESUPUESTO = ['Presupuesto'];
const CONVENIOS = ['Convenios'];
const TODOS = [...ADMIN, ...SECTORISTA, ...EJECUTOR];

// El Sectorista tiene su propia pantalla de inicio (sectorista.ts) con una
// barra reducida a propósito (Inicio / Expedientes / Sindicatos, sin Salir).
// Las demás páginas (Personal, Participantes, Hoja de Ruta, Documentos,
// Historial) NO son parte de su flujo — solo Administrador/Ejecutor las ven.
const ADMIN_O_EJECUTOR = [...ADMIN, ...EJECUTOR];

const ITEMS: ItemMenu[] = [
  { etiqueta: 'Expedientes', ruta: '/expedientes', roles: TODOS, icono: 'expedientes' },
  { etiqueta: 'Sindicatos', ruta: '/sectorista?tab=sindicatos', roles: SECTORISTA, icono: 'sindicatos' },
  { etiqueta: 'Hoja de Ruta', ruta: '/hoja-ruta', roles: ADMIN_O_EJECUTOR, icono: 'hoja-ruta' },
  { etiqueta: 'Documentos', ruta: '/documentos', roles: ADMIN_O_EJECUTOR, icono: 'documentos' },
  { etiqueta: 'Personal', ruta: '/personal-pdp', roles: ADMIN_O_EJECUTOR, icono: 'personal' },
  {
    etiqueta: 'Participantes',
    ruta: '/lista-participantes',
    roles: ADMIN_O_EJECUTOR,
    icono: 'personal',
  },
  { etiqueta: 'Historial', ruta: '/historial', roles: ADMIN_O_EJECUTOR, icono: 'historial' },
  { etiqueta: 'Presupuesto', ruta: '/presupuesto', roles: [...ADMIN, ...PRESUPUESTO], icono: 'presupuesto' },
  { etiqueta: 'Convenios', ruta: '/convenios', roles: [...ADMIN, ...CONVENIOS], icono: 'convenios' },
  { etiqueta: 'Carpetas Drive', ruta: '/carpetas-drive', roles: ADMIN, icono: 'carpetas-drive' },
  { etiqueta: 'Administración', ruta: '/personal', roles: SUPERADMIN, icono: 'administracion' },
];

@Component({
  selector: 'app-top-menu',
  imports: [],
  templateUrl: './top-menu.html',
  styleUrl: './top-menu.css',
})
export class TopMenu {
  private router = inject(Router);

  // Ya no hay botón "Salir" en la barra (se usa el menú de perfil / avatar
  // en su lugar). Se deja este Output sin uso para no tener que tocar el
  // `(salir)="..."` que sigue puesto en cada página que usa este componente.
  @Output() salir = new EventEmitter<void>();

  usuario: any = JSON.parse(localStorage.getItem('usuario') || '{}');
  rutaActual = this.router.url;

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.rutaActual = e.urlAfterRedirects || e.url;
    });
  }

  get inicio(): { ruta: string } {
    return { ruta: homeDeRol(this.usuario?.rol) };
  }

  get itemsVisibles(): ItemMenu[] {
    const roles = rolesDe(this.usuario);
    return ITEMS.filter((item) => item.roles.length === 0 || item.roles.some((r) => roles.includes(r)));
  }

  esActivo(ruta: string): boolean {
    const [path] = ruta.split('?');
    const [rutaActualSinQuery] = this.rutaActual.split('?');
    return rutaActualSinQuery === path || rutaActualSinQuery.startsWith(path + '/');
  }

  ir(ruta: string) {
    this.router.navigateByUrl(ruta);
  }
}
