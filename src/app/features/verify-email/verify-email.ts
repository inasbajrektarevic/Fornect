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

interface PendingRegistration {
  name: string;
  email: string;
}

@Component({
  selector: 'app-verify-email',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    LanguageSwitch
  ],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss'
})
export class VerifyEmail {
  private readonly authService =
    inject(AuthService);

  private readonly languageService =
    inject(LanguageService);

  /**
   * Aplikacija radi bez zone.js: ekran se sam osvjezi nakon klika, ali
   * ne i kad se odgovor servera vrati kasnije. Otkad provjera koda ide
   * na server, ova komponenta ceka odgovor, pa mora javiti da je
   * vrijeme za ponovno iscrtavanje.
   */
  private readonly changeDetector =
    inject(ChangeDetectorRef);

  email =
    this.loadPendingRegistration()?.email ?? '';

  code = '';

  /** Gotovi tekstovi, ne kljucevi - dio poruka stize sa servera. */
  errorMessage = '';
  successMessage = '';

  busy = false;
  verified = false;

  get currentLanguage(): AppLanguage {
    return this.languageService.currentLanguage();
  }

  setLanguage(language: AppLanguage): void {
    this.languageService.setLanguage(language);
  }

  /**
   * Provjera koda ide NA SERVER.
   *
   * Ranije je kod bio zakucan ovdje (123456) i poredjenje se radilo u
   * browseru — svako je mogao "potvrditi" bilo koju adresu, a
   * `email_verified` u bazi nikad nije postajao tacan. Sada server
   * generise kod, cuva mu samo otisak, ogranicava broj pokusaja i
   * ponistava ga cim je iskoristen.
   */
  verify(): void {
    if (this.busy) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    if (!this.code.trim()) {
      this.errorMessage = this.languageService.t('verify.enterCode');

      return;
    }

    void this.run(async () => {
      await this.authService.verifyEmail(this.email, this.code);

      this.verified = true;

      sessionStorage.setItem(
        'fornect-email-verified',
        'true'
      );

      // Nalog se kreira odmah nakon verifikacije
      // emaila. Ranije je nastajao tek na kraju
      // pairinga, pa bi prekid tog koraka trajno
      // izgubio registraciju.
      const created =
        this.authService.completeRegistration();

      if (created) {
        // Sada postoji account, pa se odabrani
        // jezik snima bas za taj account.
        this.languageService.setLanguage(
          this.currentLanguage
        );
      }
    }, 'verify.invalidCode');
  }

  resendCode(): void {
    if (this.busy) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    void this.run(async () => {
      await this.authService.resendVerification(this.email);

      this.successMessage = this.languageService.t('verify.codeSent');
    }, 'verify.resendFailed');
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

  private loadPendingRegistration():
    PendingRegistration | null {

    const saved = sessionStorage.getItem(
      'fornect-pending-registration'
    );

    if (!saved) {
      return null;
    }

    try {
      return JSON.parse(
        saved
      ) as PendingRegistration;
    } catch {
      return null;
    }
  }
}
