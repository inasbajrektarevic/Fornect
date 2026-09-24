import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Router,
  RouterLink
} from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { DeviceService } from '../../core/services/device';
import { HubService } from '../../core/services/hub';

import {
  AppLanguage,
  LanguageService
} from '../../core/services/language';

import {
  TranslatePipe
} from '../../shared/pipes/translate';
import { LanguageSwitch } from '../../shared/components/language-switch/language-switch';

type PairingMethod = 'qr' | 'serial';

@Component({
  selector: 'app-device-pairing',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    LanguageSwitch
  ],
  templateUrl: './device-pairing.html',
  styleUrl: './device-pairing.scss'
})
export class DevicePairing {
  private readonly authService =
    inject(AuthService);

  private readonly deviceService =
    inject(DeviceService);

  private readonly hubService =
    inject(HubService);

  private readonly languageService =
    inject(LanguageService);

  private readonly router =
    inject(Router);

  /**
   * Aplikacija radi bez zone.js. Odgovor na uparivanje stize poslije
   * await-a, a promjena obicnih polja tada ne osvjezava ekran sama. Bez
   * ovoga je pogresan kod ostavljao dugme onemoguceno i bez poruke,
   * a uspjesno uparivanje nije prikazivalo ekran "Uredjaj je uparen" -
   * sve dok korisnik ne bi nesto otkucao ili kliknuo.
   */
  private readonly changeDetector =
    inject(ChangeDetectorRef);

  method: PairingMethod = 'qr';

  serialNumber = '';
  errorMessageKey = '';
  paired = false;
  submitting = false;

  pairedDevice = {
    name: 'Fornect Home',
    serialNumber: '',
    softwareMode: 'Home'
  };

  get currentLanguage(): AppLanguage {
    return this.languageService.currentLanguage();
  }

  setLanguage(language: AppLanguage): void {
    this.languageService.setLanguage(language);
  }

  selectMethod(method: PairingMethod): void {
    this.method = method;
    this.errorMessageKey = '';
  }

  /**
   * QR kod (kad kamera skeniranje bude povezano) nosi isti pairing
   * kod kao i ručni unos — oba puta na kraju zovu isti backend claim.
   * Dok kamera nije povezana (POC), dugme traži da korisnik prvo
   * pređe na ručni unos umjesto lažnog "uspjeha".
   */
  simulateQrScan(): void {
    this.errorMessageKey = 'pair.qrNotAvailable';
    this.method = 'serial';
  }

  async pairBySerial(): Promise<void> {
    this.errorMessageKey = '';

    const code =
      this.serialNumber.trim();

    if (!/^[0-9]{6}$/.test(code)) {
      this.errorMessageKey =
        'pair.invalidSerial';
      return;
    }

    this.submitting = true;

    try {
      const hub = await this.hubService.claimHub(code);

      this.pairedDevice = {
        name: hub.name,
        serialNumber: hub.serialNumber,
        softwareMode: hub.mode
      };

      this.savePairing();
    } catch {
      this.errorMessageKey = 'pair.invalidSerial';
    } finally {
      this.submitting = false;
      this.changeDetector.markForCheck();
    }
  }

  continueToDashboard(): void {
    const selectedLanguage =
      this.currentLanguage;

    const registrationCompleted =
      this.authService.completeRegistration();

    if (!registrationCompleted) {
      this.router.navigate(['/login']);
      return;
    }

    // Nakon registracije current account sada postoji,
    // pa se odabrani jezik sprema baš za taj account.
    this.languageService.setLanguage(
      selectedLanguage
    );

    // POC: simulira automatsko otkrivanje uređaja
    // na mreži nakon pairinga Fornect uređaja.
    this.deviceService
      .discoverDemoDevicesForCurrentAccount();

    sessionStorage.removeItem(
      'fornect-pending-registration'
    );

    sessionStorage.removeItem(
      'fornect-email-verified'
    );

    this.router.navigate(['/dashboard']);
  }

  private savePairing(): void {
    localStorage.setItem(
      'fornect-paired-device',
      JSON.stringify(this.pairedDevice)
    );

    this.paired = true;
  }
}
