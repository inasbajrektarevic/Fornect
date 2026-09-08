import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { ConnectionService } from '../../core/services/connection';
import { DeviceService } from '../../core/services/device';
import { HubService } from '../../core/services/hub';
import { AppLanguage, LanguageService } from '../../core/services/language';
import { TranslatePipe } from '../../shared/pipes/translate';
import { LanguageSwitch } from '../../shared/components/language-switch/language-switch';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, TranslatePipe, LanguageSwitch],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly connectionService = inject(ConnectionService);
  private readonly deviceService = inject(DeviceService);
  private readonly hubService = inject(HubService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  rememberMe = false;

  // Signal, ne obično polje: app je zoneless (nema zone.js), pa
  // promjena običnog polja NAKON await-a (ovdje: rezultat prijave)
  // ne pokreće re-render sama od sebe — signal pisanje uvijek pokreće.
  readonly errorMessageKey = signal('');

  get currentLanguage(): AppLanguage {
    return this.languageService.currentLanguage();
  }

  setLanguage(language: AppLanguage): void {
    this.languageService.setLanguage(language);
  }

  async signIn(): Promise<void> {
    this.errorMessageKey.set('');

    const success = await this.authService.login(this.email, this.password, this.rememberMe);

    if (!success) {
      this.errorMessageKey.set('login.invalidCredentials');
      return;
    }

    this.languageService.syncWithCurrentAccount();

    // Tip uređaja i softverski mod određuju koji panel
    // korisnik vidi. Guard na /dashboard preusmjerava
    // Pro naloge na /pro.
    this.hubService.syncWithCurrentAccount();
    this.deviceService.syncWithCurrentAccount();
    this.connectionService.syncWithCurrentAccount();

    this.router.navigate(['/dashboard']);
  }
}
