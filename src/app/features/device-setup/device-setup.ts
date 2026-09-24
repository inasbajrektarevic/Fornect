import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router,
  RouterLink
} from '@angular/router';

import { DeviceService } from '../../core/services/device';
import { TranslatePipe } from '../../shared/pipes/translate';

type DeviceProfile =
  'Child' |
  'Teen' |
  'Adult' |
  'Admin';

type ProtectionLevel =
  'standard' |
  'full';

@Component({
  selector: 'app-device-setup',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './device-setup.html',
  styleUrl: './device-setup.scss'
})
export class DeviceSetup {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly deviceService = inject(DeviceService);

  deviceId =
    this.route.snapshot.paramMap.get('id') ??
    'unknown-device';

  deviceName = '';

  selectedProfile: DeviceProfile | null = null;

  protectionLevel: ProtectionLevel = 'standard';

  setProfile(profile: DeviceProfile): void {
    this.selectedProfile = profile;
  }

  setProtection(level: ProtectionLevel): void {
    this.protectionLevel = level;
  }

  finishSetup(): void {
    if (
      !this.deviceName.trim() ||
      !this.selectedProfile
    ) {
      return;
    }

    const name = this.deviceName.trim();

    // Puna zastita se ovdje samo TRAZI, ne ukljucuje. Ukljucuje je
    // server tek kad postoji pristanak i kad uredjaj dokaze da je
    // zastitni profil instaliran (consent-actions.ts). Ranije se
    // 'full' upisivao odmah: kartica uredjaja je pisala "Puna zastita",
    // a ekran zastite, koji gleda certifikat, "Standardna" - i tacan
    // je bio ekran zastite.
    const wantsFull = this.protectionLevel === 'full';

    const setupData = {
      id: this.deviceId,
      name,
      profile: this.selectedProfile,
      protectionLevel: 'standard' as const,
      useFullProtection: wantsFull
    };

    localStorage.setItem(
      `fornect-device-setup-${this.deviceId}`,
      JSON.stringify(setupData)
    );

    this.deviceService.updateDevice(
      this.deviceId,
      {
        name,
        profile: this.selectedProfile,
        protectionLevel: 'standard',
        useFullProtection: wantsFull
      }
    );

    if (wantsFull) {
      // Pravo na sljedeci korak: forma pristanka, pa instalacija
      // profila. Isti tok kao izbor pune zastite na ekranu zastite.
      this.router.navigate(
        ['/devices', this.deviceId, 'protection'],
        { queryParams: { consent: 'start' } }
      );

      return;
    }

    this.router.navigate([
      '/devices',
      this.deviceId
    ]);
  }
}
