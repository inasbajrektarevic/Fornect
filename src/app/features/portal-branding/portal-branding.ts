import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { serverErrorMessage } from '../../core/services/api-error';
import { LanguageService } from '../../core/services/language';

import {
  PortalSettings,
  PortalSettingsService
} from '../../core/services/portal-settings';

import {
  TranslatePipe
} from '../../shared/pipes/translate';

/**
 * Uređivanje teksta i brenda captive portala — Zadatak 1, stavka 1.2.
 *
 * Isti podatak uređuje i hospitality ekran; oba idu kroz
 * PortalSettingsService, jer dva editora koja se ne slažu bila bi gora
 * od jednog mockupa.
 *
 * Pregled prikazuje SAMO ono što se ovdje mijenja — zaglavlje, naslov i
 * poruku. Namjerno nije nacrtan cijeli portal: to bi bila druga kopija
 * portala u Angularu, koja se razilazi sa pravom. Tu grešku je
 * build-texts.js već jednom zatvarao i nema razloga praviti je ponovo.
 */
@Component({
  selector: 'app-portal-branding',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './portal-branding.html',
  styleUrl: './portal-branding.scss'
})
export class PortalBranding {
  private readonly portalSettings = inject(PortalSettingsService);
  private readonly languageService = inject(LanguageService);

  readonly form = signal<PortalSettings | null>(null);

  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly error = signal('');

  /** Jezik u kojem se gleda pregled — ne jezik panela. */
  readonly previewLanguage = signal<'bs' | 'en'>(
    this.languageService.currentLanguage() === 'en' ? 'en' : 'bs'
  );

  readonly previewTitle = computed(() => {
    const form = this.form();

    if (!form) {
      return '';
    }

    return this.previewLanguage() === 'en' ? form.welcomeTitleEn : form.welcomeTitleBs;
  });

  readonly previewMessage = computed(() => {
    const form = this.form();

    if (!form) {
      return '';
    }

    return this.previewLanguage() === 'en'
      ? form.welcomeMessageEn
      : form.welcomeMessageBs;
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    await this.portalSettings.reload();

    const settings = this.portalSettings.settings();

    if (settings) {
      // Kopija, da polja koja korisnik mijenja ne diraju zajedničko
      // stanje prije nego što ih snimi.
      this.form.set({ ...settings });
    }
  }

  update<K extends keyof PortalSettings>(field: K, value: PortalSettings[K]): void {
    const form = this.form();

    if (!form) {
      return;
    }

    this.form.set({ ...form, [field]: value });
    this.saved.set(false);
  }

  togglePreviewLanguage(): void {
    this.previewLanguage.set(this.previewLanguage() === 'bs' ? 'en' : 'bs');
  }

  async save(): Promise<void> {
    const form = this.form();

    if (!form || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.error.set('');

    try {
      const settings = await this.portalSettings.save(form);

      this.form.set({ ...settings });
      this.saved.set(true);
    } catch (error) {
      // Server javlja tačan razlog (predugačak tekst, prazan naslov,
      // neispravna boja) — nema smisla to prevoditi u "nešto nije
      // uspjelo".
      this.error.set(serverErrorMessage(error, 'Snimanje nije uspjelo.'));
    } finally {
      this.busy.set(false);
    }
  }
}
