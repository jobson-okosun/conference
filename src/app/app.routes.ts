import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./onboard/onboard') },
  { path: 'preview/:roomId', loadComponent: () => import('./waiting-room/waiting-room') },
  { path: 'meeting/:roomId', loadComponent: () => import('./meeting/meeting') }
];
