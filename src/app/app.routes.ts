import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';

import { Sectorista } from './pages/sectorista/sectorista';
import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { HojaRuta } from './pages/hoja-ruta/hoja-ruta';
import { ExpedientesPdp } from './pages/expedientes-pdp/expedientes-pdp';
import { Personal } from './pages/personal/personal';
import { Ejecutor } from './pages/ejecutor/ejecutor';
import { ListaParticipantes } from './pages/lista-participantes/lista-participantes';
import { PersonalPdp } from './pages/personal-pdp/personal-pdp';

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
    path: 'dashboard',
    component: Dashboard,
    canActivate: [authGuard],
  },

  {
    path: 'hoja-ruta/:expediente',
    component: HojaRuta,
    canActivate: [authGuard],
  },

  {
    path: 'expedientes',
    component: ExpedientesPdp,
    canActivate: [authGuard],
  },

  {
    path: 'hoja-ruta',
    component: HojaRuta,
    canActivate: [authGuard],
  },

  {
    path: 'personal',
    component: Personal,
    canActivate: [authGuard],
  },

  {
    path: 'sectorista',
    component: Sectorista,
    canActivate: [authGuard],
  },

  {
    path: 'ejecutor',
    component: Ejecutor,
    canActivate: [authGuard],
  },

  {
    path: 'lista-participantes',
    component: ListaParticipantes,
    canActivate: [authGuard],
  },

  {
    path: 'personal-pdp',
    component: PersonalPdp,
    canActivate: [authGuard],
  },

  {
    path: '**',
    redirectTo: 'login',
  },
];
