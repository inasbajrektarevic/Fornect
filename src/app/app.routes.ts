import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { deviceLoadedResolver } from './core/guards/device-loaded.resolver';
import {
  agencyGuard,
  homeModeGuard,
  hospitalityGuard,
  proModeGuard,
} from './core/guards/mode.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, homeModeGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'pro',
    canActivate: [authGuard, proModeGuard],
    loadComponent: () =>
      import('./features/pro-dashboard/pro-dashboard').then((m) => m.ProDashboard),
  },
  {
    path: 'pro/guests',
    canActivate: [authGuard, proModeGuard, hospitalityGuard],
    loadComponent: () =>
      import('./features/pro-hospitality/pro-hospitality').then((m) => m.ProHospitality),
  },
  {
    path: 'pro/monitoring',
    canActivate: [authGuard, proModeGuard, agencyGuard],
    loadComponent: () => import('./features/pro-agency/pro-agency').then((m) => m.ProAgency),
  },
  {
    path: 'pro/upgrade',
    canActivate: [authGuard, proModeGuard],
    loadComponent: () => import('./features/pro-upgrade/pro-upgrade').then((m) => m.ProUpgrade),
  },
  {
    path: 'new-devices',
    canActivate: [authGuard, homeModeGuard],
    loadComponent: () =>
      import('./features/new-devices/new-devices').then((m) => m.NewDevices),
  },
  {
    path: 'devices',
    canActivate: [authGuard],
    loadComponent: () => import('./features/devices/devices').then((m) => m.Devices),
  },
  {
    path: 'devices/:id',
    canActivate: [authGuard],
    resolve: { devicesLoaded: deviceLoadedResolver },
    loadComponent: () =>
      import('./features/device-details/device-details').then((m) => m.DeviceDetails),
  },
  {
    path: 'devices/:id/schedule',
    canActivate: [authGuard],
    resolve: { devicesLoaded: deviceLoadedResolver },
    loadComponent: () => import('./features/schedule/schedule').then((m) => m.Schedule),
  },
  {
    path: 'devices/:id/protection',
    canActivate: [authGuard],
    resolve: { devicesLoaded: deviceLoadedResolver },
    loadComponent: () => import('./features/protection/protection').then((m) => m.Protection),
  },
  {
    path: 'devices/:id/setup',
    canActivate: [authGuard],
    resolve: { devicesLoaded: deviceLoadedResolver },
    loadComponent: () => import('./features/device-setup/device-setup').then((m) => m.DeviceSetup),
  },
  {
    path: 'schedules',
    canActivate: [authGuard],
    loadComponent: () => import('./features/schedules/schedules').then((m) => m.Schedules),
  },
  {
    path: 'protection',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/protection-overview/protection-overview').then(
        (m) => m.ProtectionOverview,
      ),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/register/register').then((m) => m.Register),
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./features/verify-email/verify-email').then((m) => m.VerifyEmail),
  },
  {
    path: 'pair-device',
    loadComponent: () =>
      import('./features/device-pairing/device-pairing').then((m) => m.DevicePairing),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    resolve: { devicesLoaded: deviceLoadedResolver },
    loadComponent: () =>
      import('./features/notifications/notifications').then((m) => m.Notifications),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
  {
    path: 'help',
    canActivate: [authGuard],
    loadComponent: () => import('./features/help/help').then((m) => m.Help),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
