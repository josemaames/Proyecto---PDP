import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';
import { roleGuard } from './guards/role-guard';

import { Sectorista } from './pages/sectorista/sectorista';
import { Login } from './pages/login/login';
import { Sso } from './pages/sso/sso';
import { Dashboard } from './pages/dashboard/dashboard';
import { HojaRuta } from './pages/hoja-ruta/hoja-ruta';
import { ExpedientesPdp } from './pages/expedientes-pdp/expedientes-pdp';
import { Personal } from './pages/personal/personal';
import { Ejecutor } from './pages/ejecutor/ejecutor';
import { ListaParticipantes } from './pages/lista-participantes/lista-participantes';
import { PersonalPdp } from './pages/personal-pdp/personal-pdp';
import { Documentos } from './pages/documentos/documentos';
import { Presupuesto } from './pages/presupuesto/presupuesto';

const ADMIN = ['Administrador', 'Administrativo'];
const SECTORISTA = ['Sectorista'];
const EJECUTOR = ['Ejecutor'];
const PRESUPUESTO = ['Presupuesto'];
const TODOS = [...ADMIN, ...SECTORISTA, ...EJECUTOR];

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },

  {
    path: 'login',
    component: Login,
  },

  {
    path: 'sso',
    component: Sso,
  },

  {
    path: 'dashboard',
    component: Dashboard,
    canActivate: [authGuard, roleGuard(ADMIN)],
  },

  {
    path: 'sectorista',
    component: Sectorista,
    canActivate: [authGuard, roleGuard(SECTORISTA)],
  },

  {
    path: 'ejecutor',
    component: Ejecutor,
    canActivate: [authGuard, roleGuard(EJECUTOR)],
  },

  {
    path: 'expedientes',
    component: ExpedientesPdp,
    canActivate: [authGuard, roleGuard(TODOS)],
  },

  {
    path: 'hoja-ruta',
    component: HojaRuta,
    canActivate: [authGuard, roleGuard(TODOS)],
  },

  {
    path: 'hoja-ruta/:expediente',
    component: HojaRuta,
    canActivate: [authGuard, roleGuard(TODOS)],
  },

  {
    path: 'lista-participantes',
    component: ListaParticipantes,
    canActivate: [authGuard, roleGuard([...ADMIN, ...SECTORISTA, ...EJECUTOR])],
  },

  {
    path: 'personal-pdp',
    component: PersonalPdp,
    canActivate: [authGuard, roleGuard([...ADMIN, ...SECTORISTA, ...EJECUTOR])],
  },

  {
    path: 'personal',
    component: Personal,
    canActivate: [authGuard, roleGuard(ADMIN)],
  },

  {
    path: 'presupuesto',
    component: Presupuesto,
    canActivate: [authGuard, roleGuard([...ADMIN, ...PRESUPUESTO])],
  },

  {
    path: 'documentos',
    component: Documentos,
    canActivate: [authGuard, roleGuard(TODOS)],
  },

  {
    path: '**',
    redirectTo: 'login',
  },
];
