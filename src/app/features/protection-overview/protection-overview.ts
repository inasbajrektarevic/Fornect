import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  DeviceService,
  FornectNetworkDevice
} from '../../core/services/device';

import {
  LanguageService
} from '../../core/services/language';

import {
  TranslatePipe
} from '../../shared/pipes/translate';

@Component({
  selector: 'app-protection-overview',
  imports: [
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './protection-overview.html',
  styleUrl: './protection-overview.scss'
})
export class ProtectionOverview {
  private readonly deviceService =
    inject(DeviceService);

  private readonly languageService =
    inject(LanguageService);

  get devices(): FornectNetworkDevice[] {
    return this.deviceService.devices();
  }

  get fullProtectionCount(): number {
    return this.devices.filter(
      device =>
        device.protectionEnabled !== false &&
        device.protectionLevel === 'full'
    ).length;
  }

  get standardProtectionCount(): number {
    return this.devices.filter(
      device =>
        device.protectionEnabled !== false &&
        device.protectionLevel === 'standard'
    ).length;
  }

  get needsSetupCount(): number {
    return this.devices.filter(
      device =>
        device.protectionLevel === 'needs-setup'
    ).length;
  }

  getProtectionLabel(
    device: FornectNetworkDevice
  ): string {
    if (device.protectionEnabled === false) {
      return this.languageService.t(
        'protectionOverview.off'
      );
    }

    switch (device.protectionLevel) {
      case 'full':
        return this.languageService.t(
          'protectionOverview.full'
        );

      case 'standard':
        return this.languageService.t(
          'protectionOverview.standard'
        );

      default:
        return this.languageService.t(
          'protectionOverview.needsSetup'
        );
    }
  }

  getProtectionDescription(
    device: FornectNetworkDevice
  ): string {
    if (device.protectionEnabled === false) {
      return this.languageService.t(
        'protectionOverview.offDescription'
      );
    }

    switch (device.protectionLevel) {
      case 'full':
        return this.languageService.t(
          'protectionOverview.fullDescription'
        );

      case 'standard':
        return this.languageService.t(
          'protectionOverview.standardDescription'
        );

      default:
        return this.languageService.t(
          'protectionOverview.setupDescription'
        );
    }
  }

  getPairingLabel(
    device: FornectNetworkDevice
  ): string {
    switch (device.pairingState) {
      case 'paired':
        return this.languageService.t(
          'protectionOverview.paired'
        );

      case 'pairing':
        return this.languageService.t(
          'protectionOverview.pairing'
        );

      case 'failed':
        return this.languageService.t(
          'protectionOverview.pairingFailed'
        );

      // Gost nije "neupareno" nego svjestan izbor osnovne zastite -
      // prikazivati ih isto bi vratilo tacno onu zabunu zbog koje je
      // stanje 'guest' i uvedeno.
      case 'guest':
        return this.languageService.t(
          'protectionOverview.guest'
        );

      default:
        return this.languageService.t(
          'protectionOverview.notPaired'
        );
    }
  }

  getProfileLabel(
    device: FornectNetworkDevice
  ): string {
    switch (device.profile) {
      case 'Child':
        return this.languageService.t(
          'protectionOverview.childProfile'
        );

      case 'Teen':
        return this.languageService.t(
          'protectionOverview.teenProfile'
        );

      case 'Adult':
        return this.languageService.t(
          'protectionOverview.adultProfile'
        );

      case 'Admin':
        return this.languageService.t(
          'protectionOverview.adminProfile'
        );

      default:
        return this.languageService.t(
          'protectionOverview.unassigned'
        );
    }
  }
}
