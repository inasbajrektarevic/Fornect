import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  DeviceService,
  FornectNetworkDevice
} from '../../core/services/device';

import { HubService } from '../../core/services/hub';

import {
  TranslatePipe
} from '../../shared/pipes/translate';

/**
 * "Kapacitet je pun" — Zadatak 1, Tačka 4, sloj L1.
 *
 * Licenca hub-a pokriva određen broj uređaja. Do sada je panel na to
 * samo upozoravao trakom na ekranu uređaja, i to po granici koju je
 * sam izmislio: zakucanih 20, čak i za nalog koji nema nijedan hub.
 *
 * Ovaj ekran radi tri stvari koje traka nije mogla: kaže KOJI uređaji
 * su preko licence, kaže šta to za njih znači, i nudi dva izlaza
 * umjesto jednog — osloboditi mjesto ili proširiti licencu.
 *
 * Ono što se ne smije prešutjeti: panel ne isključuje uređaj sa mreže.
 * Uređaj preko licence i dalje radi, samo ga Fornect ne štiti. Blokada
 * na nivou mreže je posao hub-a (Zadatak 2), ne ovog ekrana.
 */
@Component({
  selector: 'app-capacity',
  imports: [
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './capacity.html',
  styleUrl: './capacity.scss'
})
export class Capacity {
  private readonly deviceService = inject(DeviceService);
  private readonly hubService = inject(HubService);

  readonly devices = this.deviceService.overCapacityDevices;

  readonly hasOverflow = computed(() => this.devices().length > 0);

  readonly capacity = computed(() => this.hubService.hub().capacity);

  readonly deviceCount = computed(() => this.deviceService.devices().length);

  /**
   * Home korisnik nema ekran za nadogradnju (on je iza proModeGuard-a),
   * pa mu se nudi kontakt umjesto slijepe veze.
   */
  readonly upgradeLink = computed(() =>
    this.hubService.isPro() ? '/pro/upgrade' : '/help'
  );

  readonly upgradeLabelKey = computed(() =>
    this.hubService.isPro()
      ? 'capacity.upgrade'
      : 'capacity.contact'
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

  slotLabel(device: FornectNetworkDevice): string {
    return device.licenceSlot ? `#${device.licenceSlot}` : '';
  }
}
