import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';

import { DeviceService } from '../services/device';

/**
 * device-details/schedule/protection/device-setup komponente čitaju
 * konkretan uređaj SINHRONO u konstruktoru (device = getDevice(id)).
 * Na svjež (puni) page load to je prije nego DeviceService stigne
 * učitati uređaje sa backend-a, pa bi komponenta pukla na undefined.
 * Ovaj resolver sačeka da se taj (već pokrenut) load završi prije
 * nego se ruta uopšte aktivira.
 */
export const deviceLoadedResolver: ResolveFn<void> = () => {
  return inject(DeviceService).ensureLoaded();
};
