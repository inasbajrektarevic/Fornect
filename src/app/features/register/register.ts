import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Router,
  RouterLink
} from '@angular/router';

import { AuthService } from '../../core/services/auth';
import {
  AppLanguage,
  LanguageService
} from '../../core/services/language';
import { TranslatePipe } from '../../shared/pipes/translate';
import { LanguageSwitch } from '../../shared/components/language-switch/language-switch';

@Component({
  selector: 'app-register',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    LanguageSwitch
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly languageService =
    inject(LanguageService);

  name = '';
  email = '';
  password = '';
  confirmPassword = '';

  // Signal, ne obicno polje - isti razlog kao u login.ts. Aplikacija
  // radi bez zone.js: poruka "nalog vec postoji" se postavlja tek kad
  // server odgovori (poslije await-a), a promjena obicnog polja u tom
  // trenutku ne osvjezava ekran. Poruka se pojavljivala tek na drugi
  // klik. Pisanje u signal uvijek osvjezi ekran.
  readonly errorMessageKey = signal('');

  get currentLanguage(): AppLanguage {
    return this.languageService.currentLanguage();
  }

  setLanguage(language: AppLanguage): void {
    this.languageService.setLanguage(language);
  }

  async submit(): Promise<void> {
    this.errorMessageKey.set('');

    const name = this.name.trim();

    const email =
      this.email.trim().toLowerCase();

    if (!name) {
      this.errorMessageKey.set('register.enterName');
      return;
    }

    if (!email || !email.includes('@')) {
      this.errorMessageKey.set('register.invalidEmail');
      return;
    }

    if (this.password.length < 8) {
      this.errorMessageKey.set('register.passwordMin');
      return;
    }

    if (
      this.password !==
      this.confirmPassword
    ) {
      this.errorMessageKey.set('register.passwordMismatch');
      return;
    }

    try {
      await this.authService.prepareRegistration(
        name,
        email,
        this.password
      );

      this.router.navigate([
        '/verify-email'
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'An account with this email already exists.'
      ) {
        this.errorMessageKey.set('register.emailExists');
        return;
      }

      this.errorMessageKey.set('register.unable');
    }
  }
}
