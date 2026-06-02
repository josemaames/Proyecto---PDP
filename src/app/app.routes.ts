import { Routes } from '@angular/router';

import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { HojaRuta } from './pages/hoja-ruta/hoja-ruta';
import { ExpedientesPdp } from './pages/expedientes-pdp/expedientes-pdp';
import { Personal } from './pages/personal/personal';

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
  },

  {
    path: 'expedientes',
    component: ExpedientesPdp,
  },

  {
    path: 'hoja-ruta',
    component: HojaRuta,
  },

  {
    path: 'personal',
    component: Personal,
  },

  // Ruta comodín (opcional pero recomendada)
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
