import { Routes } from '@angular/router';

import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { HojaRuta } from './pages/hoja-ruta/hoja-ruta';
import { ExpedientesPdp } from './pages/expedientes-pdp/expedientes-pdp';

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
    path: 'hoja-ruta',
    component: HojaRuta,
  },

  {
    path: 'expedientes',
    component: ExpedientesPdp,
  },
];
