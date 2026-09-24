import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  DeviceService,
  FornectNetworkDevice
} from '../../core/services/device';

import {
  TranslatePipe
} from '../../shared/pipes/translate';

/**
 * Red "Novi uredjaji" — Zadatak 1, Tacka 5.
 *
 * Uredjaji bez ekrana (TV, stampac, konzola) nikad nece otvoriti
 * captive portal i sami se izjasniti, pa se pojavljuju ovdje da ih
 * vlasnik klasifikuje sa telefona. Ovo je ujedno i jedino mjesto na
 * kojem ce primijetiti uredjaj koji ne prepoznaje — zato je red
 * vrijedan samo ako je kratak, sto odrzava politika automatskog
 * svrstavanja medju goste nakon 24 sata.
 */
@Component({
  selector: 'app-new-devices',
  imports: [
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './new-devices.html',
  styleUrl: './new-devices.scss'
})
export class NewDevices {
  private readonly deviceService = inject(DeviceService);

  readonly devices = this.deviceService.unclassifiedDevices;

  readonly hasDevices = computed(
    () => this.devices().length > 0
  );

  deviceIcon(device: FornectNetworkDevice): string {
    switch (device.type) {
      case 'phone':
        return '\u{1F4F1}';

      case 'tv':
        return '\u{1F4FA}';

      case 'console':
        return '\u{1F3AE}';

      default:
        return '?';
    }
  }

  firstSeenLabel(device: FornectNetworkDevice): string {
    return device.createdAt
      ? new Date(device.createdAt).toLocaleString()
      : '';
  }

  /** Osnovna zastita — uredjaj prestaje biti otvoreno pitanje. */
  markAsGuest(device: FornectNetworkDevice): void {
    this.deviceService.markAsGuest(device.id);
  }
}
