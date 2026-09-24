import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  signal,
  viewChildren
} from '@angular/core';
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

  /**
   * Kod za uparivanje, po cifri. Šest odvojenih polja umjesto jednog:
   * na telefonu se kod prepisuje sa ekrana uređaja, a velike odvojene
   * cifre se lakše provjere, i fokus sam prelazi na sljedeću.
   */
  readonly digitIndexes = [0, 1, 2, 3, 4, 5];

  readonly digits = signal<string[]>(['', '', '', '', '', '']);

  private readonly digitInputs =
    viewChildren<ElementRef<HTMLInputElement>>('digit');

  get serialNumber(): string {
    return this.digits().join('');
  }
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

  onDigitInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const typed = input.value.replace(/\D/g, '');

    // Više cifara odjednom: lijepljenje, automatsko popunjavanje koda
    // sa tastature telefona, ili upis u polje koje je već imalo cifru.
    if (typed.length > 1) {
      this.fillFrom(index, typed);
      return;
    }

    const next = [...this.digits()];
    next[index] = typed;
    this.digits.set(next);

    // Slovo ili znak se ne prima; polje ostaje prazno.
    input.value = typed;

    if (typed && index < 5) {
      this.focusDigit(index + 1);
    }
  }

  onDigitKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      event.preventDefault();

      const next = [...this.digits()];
      next[index - 1] = '';
      this.digits.set(next);

      this.focusDigit(index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusDigit(index - 1);
    } else if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      this.focusDigit(index + 1);
    }
  }

  onCodePaste(index: number, event: ClipboardEvent): void {
    const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '');

    if (!pasted) {
      return;
    }

    event.preventDefault();

    // Cijeli kod se uvijek upisuje od prvog polja.
    this.fillFrom(pasted.length >= 6 ? 0 : index, pasted);
  }

  private fillFrom(start: number, text: string): void {
    const next = [...this.digits()];
    let position = start;

    for (const digit of text) {
      if (position > 5) {
        break;
      }

      next[position] = digit;
      position++;
    }

    this.digits.set(next);

    // [value] se ne mijenja ako je signal isti kao prije, pa se polja
    // usklađuju i ovdje, direktno.
    this.digitInputs().forEach((ref, i) => {
      ref.nativeElement.value = next[i];
    });

    this.focusDigit(Math.min(position, 5));
  }

  private focusDigit(index: number): void {
    const input = this.digitInputs()[index]?.nativeElement;

    input?.focus();
    input?.select();
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
