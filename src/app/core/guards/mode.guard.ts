import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { HubService } from '../services/hub';

/**
 * Uređaj i softverski mod određuju koji set ekrana korisnik
 * uopšte može otvoriti. Guardovi drže to na jednom mjestu,
 * umjesto da svaki ekran sam provjerava mod.
 *
 * Svaki guard prvo sačeka da server javi tip i mod huba
 * (HubService.ensureLoaded). Odluka po lokalnom zapisu bila je
 * pogrešna upravo kad je najvažnije — pri prvoj prijavi na novom
 * pregledaču ili telefonu.
 */
export const homeModeGuard: CanActivateFn = async () => {
  const hubService = inject(HubService);
  const router = inject(Router);

  await hubService.ensureLoaded();

  return hubService.isPro()
    ? router.createUrlTree(['/pro'])
    : true;
};

export const proModeGuard: CanActivateFn = async () => {
  const hubService = inject(HubService);
  const router = inject(Router);

  await hubService.ensureLoaded();

  return hubService.isPro()
    ? true
    : router.createUrlTree(['/dashboard']);
};

export const hospitalityGuard: CanActivateFn = async () => {
  const hubService = inject(HubService);
  const router = inject(Router);

  await hubService.ensureLoaded();

  return hubService.mode() === 'hospitality'
    ? true
    : router.createUrlTree(['/pro']);
};

export const agencyGuard: CanActivateFn = async () => {
  const hubService = inject(HubService);
  const router = inject(Router);

  await hubService.ensureLoaded();

  return hubService.mode() === 'agency'
    ? true
    : router.createUrlTree(['/pro']);
};
