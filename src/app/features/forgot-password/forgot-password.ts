import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { serverErrorMessage } from '../../core/services/api-error';

import {
  AppLanguage,
  LanguageService
} from '../../core/services/language';

import {
  TranslatePipe
} from '../../shared/pipes/translate';
import { LanguageSwitch } from '../../shared/components/language-switch/language-switch';

/**
 * email — unos adrese
 * code  — kod iz maila + nova lozinka
 * done  — lozinka promijenjena
 */
type ForgotStep = 'email' | 'code' | 'done';

const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-forgot-password',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    LanguageSwitch
  ],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss'
})
export class ForgotPassword {
  private readonly authService =
    inject(AuthService);

  private readonly languageService =
    inject(LanguageService);

  /**
   * Aplikacija radi bez zone.js: ekran se ne osvjezi sam kad se odgovor
   * servera vrati. Bez ovoga poruka bi se pojavila tek na drugi klik
   * (ista greska kao 11.09. i 24.09.).
   */
  private readonly changeDetector =
    inject(ChangeDetectorRef);

  step: ForgotStep = 'email';

  email = '';
  code = '';
  password = '';
  confirmPassword = '';

  /** Gotovi tekstovi, ne kljucevi - dio poruka stize sa servera. */
  errorMessage = '';
  infoMessage = '';

  busy = false;

  get currentLanguage(): AppLanguage {
    return this.languageService.currentLanguage();
  }

  setLanguage(language: AppLanguage): void {
    this.languageService.setLanguage(language);
  }

  /**
   * Korak 1: kod na mail.
   *
   * Ranije je ovo bio POC: ekran je pisao "upute su poslane", a nista
   * nije islo ni serveru ni na mail. Sada server pravi kod i salje ga.
   * Odgovor je isti postojao nalog ili ne, pa ekran i dalje kaze "ako
   * postoji nalog" — to nije oprez u tekstu, nego sve sto server zna reci.
   */
  submit(): void {
    if (this.busy) {
      return;
    }

    this.clearMessages();

    const email = this.email.trim();

    if (!email || !email.includes('@')) {
      this.errorMessage = this.languageService.t('forgot.invalidEmail');

      return;
    }

    void this.run(async () => {
      await this.authService.requestPasswordReset(email);

      this.step = 'code';
    }, 'forgot.requestFailed');
  }

  resendCode(): void {
    if (this.busy) {
      return;
    }

    this.clearMessages();

    void this.run(async () => {
      await this.authService.requestPasswordReset(this.email);

      this.infoMessage = this.languageService.t('forgot.codeResent');
    }, 'forgot.requestFailed');
  }

  /** Korak 2: kod + nova lozinka. */
  resetPassword(): void {
    if (this.busy) {
      return;
    }

    this.clearMessages();

    if (!this.code.trim()) {
      this.errorMessage = this.languageService.t('forgot.enterCode');

      return;
    }

    if (this.password.length < MIN_PASSWORD_LENGTH) {
      this.errorMessage = this.languageService.t('register.passwordMin');

      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = this.languageService.t('register.passwordMismatch');

      return;
    }

    void this.run(async () => {
      await this.authService.resetPassword(this.email, this.code, this.password);

      // Lozinka se ne drzi u memoriji duze nego sto treba.
      this.password = '';
      this.confirmPassword = '';
      this.code = '';

      this.step = 'done';
    }, 'forgot.resetFailed');
  }

  changeEmail(): void {
    this.clearMessages();
    this.code = '';
    this.password = '';
    this.confirmPassword = '';
    this.step = 'email';
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.infoMessage = '';
  }

  private async run(
    action: () => Promise<void>,
    fallbackKey: string
  ): Promise<void> {
    this.busy = true;

    try {
      await action();
    } catch (error) {
      this.errorMessage = serverErrorMessage(
        error,
        this.languageService.t(fallbackKey)
      );
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }
}
