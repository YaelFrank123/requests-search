import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'requests' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login-page/login-page.component').then((m) => m.LoginPageComponent)
  },
  {
    path: 'requests',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/request-search/request-search-page/request-search-page.component').then(
        (m) => m.RequestSearchPageComponent
      )
  }
];
