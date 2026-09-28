import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { HubMode, HubService } from '../../core/services/hub';
import {
  AppLanguage,
  LanguageService
} from '../../core/services/language';
import { TranslatePipe } from '../../shared/pipes/translate';

interface AccountPreferences {
  emailDeviceOffline: boolean;
  emailSecurityAlerts: boolean;
  emailUpdates: boolean;
  language: AppLanguage;
}

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss'
})
export class Settings {
  private readonly authService = inject(AuthService);
  // Tajmer ispod mijenja obicno polje van klika; bez zone.js to ne
  // osvjezava ekran samo, pa poruka ne bi nestala.
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly hubService = inject(HubService);
  private readonly languageService = inject(LanguageService);

  readonly user = this.authService.currentUser();

  preferences: AccountPreferences =
    this.loadPreferences();

  saved = false;

  get hubMode(): HubMode {
    return this.hubService.mode();
  }

  hubModeLabelKey(mode: HubMode): string {
    switch (mode) {
      case 'hospitality':
        return 'pro.modeHospitality';

      case 'agency':
        return 'pro.modeAgency';

      default:
        return 'pro.modeHome';
    }
  }

  changeLanguage(language: AppLanguage): void {
    this.preferences.language = language;
    this.languageService.setLanguage(language);
  }

  savePreferences(): void {
    const accountId =
      this.user?.accountId ?? 'anonymous';

    localStorage.setItem(
      `fornect-account-preferences-${accountId}`,
      JSON.stringify(this.preferences)
    );

    this.languageService.setLanguage(
      this.preferences.language
    );

    this.saved = true;

    window.setTimeout(() => {
      this.saved = false;
      this.changeDetector.markForCheck();
    }, 2000);
  }

  private loadPreferences(): AccountPreferences {
    const accountId =
      this.user?.accountId ?? 'anonymous';

    const saved = localStorage.getItem(
      `fornect-account-preferences-${accountId}`
    );

    if (saved) {
      try {
        const preferences =
          JSON.parse(saved) as Partial<AccountPreferences>;

        return {
          emailDeviceOffline:
            preferences.emailDeviceOffline ?? true,
          emailSecurityAlerts:
            preferences.emailSecurityAlerts ?? true,
          emailUpdates:
            preferences.emailUpdates ?? true,
          language:
            preferences.language === 'en'
              ? 'en'
              : 'bs'
        };
      } catch {
        // Use defaults.
      }
    }

    return {
      emailDeviceOffline: true,
      emailSecurityAlerts: true,
      emailUpdates: true,
      language: 'bs'
    };
  }
}

