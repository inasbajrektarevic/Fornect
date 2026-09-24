import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import {
  ConnectionService,
  ConnectionStatus
} from '../../core/services/connection';
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
  private readonly connectionService =
    inject(ConnectionService);
  private readonly hubService = inject(HubService);

  readonly connectionStatuses: ConnectionStatus[] = [
    'online',
    'offline',
    'error'
  ];
  private readonly languageService = inject(LanguageService);

  readonly user = this.authService.currentUser();

  preferences: AccountPreferences =
    this.loadPreferences();

  saved = false;

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  passwordMessage = '';
  passwordError = '';

  get isDemoAccount(): boolean {
    return this.user?.email === 'test@fornect.com';
  }

  get connectionStatus(): ConnectionStatus {
    return this.connectionService.status();
  }

  connectionLabelKey(status: ConnectionStatus): string {
    switch (status) {
      case 'offline':
        return 'connection.statusOffline';

      case 'error':
        return 'connection.statusError';

      default:
        return 'connection.statusOnline';
    }
  }

  changeConnectionStatus(status: ConnectionStatus): void {
    this.connectionService.setStatus(status);
  }

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

  changePassword(): void {
    this.passwordMessage = '';
    this.passwordError = '';

    if (this.isDemoAccount) {
      this.passwordError =
        this.languageService.t(
          'settings.demoPasswordFixed'
        );
      return;
    }

    if (!this.currentPassword) {
      this.passwordError =
        this.languageService.t(
          'settings.enterCurrentPassword'
        );
      return;
    }

    if (this.newPassword.length < 8) {
      this.passwordError =
        this.languageService.t(
          'settings.passwordMin'
        );
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordError =
        this.languageService.t(
          'settings.passwordMismatch'
        );
      return;
    }

    this.passwordMessage =
      this.languageService.t(
        'settings.passwordBackendReady'
      );

    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
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

