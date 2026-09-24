import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth';

export interface PortalSettings {
  brandName: string;
  accentColor: string;
  welcomeTitleBs: string;
  welcomeTitleEn: string;
  welcomeMessageBs: string;
  welcomeMessageEn: string;
  supportContact: string;
  privacyPolicyUrl: string;
  version: number;
}

interface PortalSettingsApiRow {
  brand_name: string;
  accent_color: string;
  welcome_title_bs: string;
  welcome_title_en: string;
  welcome_message_bs: string;
  welcome_message_en: string;
  support_contact: string;
  privacy_policy_url: string;
  version: number;
}

/**
 * Tekst i brend captive portala.
 *
 * Ovo je ono što hub povlači i ugradi u portal na uređaju. Ranije je
 * postojalo samo u hospitality ekranu i živjelo u localStorage-u
 * pregledača — korisnik unese tekst, vidi „sačuvano", a na uređaj ne
 * ode ništa.
 *
 * Servis je jedan namjerno: hospitality ekran i ekran za brendiranje
 * uređuju ISTU stvar. Dva editora koja se ne slažu bila bi gora od
 * jednog mockupa.
 */
@Injectable({
  providedIn: 'root',
})
export class PortalSettingsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly current = signal<PortalSettings | null>(null);

  readonly settings = this.current.asReadonly();

  readonly loaded = computed(() => this.current() !== null);

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        void this.reload();
      } else {
        this.current.set(null);
      }
    });
  }

  async reload(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    try {
      const row = await firstValueFrom(
        this.http.get<PortalSettingsApiRow>(`${API_BASE_URL}/app/portal-settings`),
      );

      this.current.set(fromApiRow(row));
    } catch {
      // Nedostupan backend ne smije obrisati ono što je prikazano.
    }
  }

  /**
   * Snima i vraća zapisano stanje. Server je taj koji podiže verziju,
   * pa se rezultat uvijek čita iz njegovog odgovora, a ne pretpostavlja.
   */
  async save(changes: Partial<PortalSettings>): Promise<PortalSettings> {
    const row = await firstValueFrom(
      this.http.put<PortalSettingsApiRow>(`${API_BASE_URL}/app/portal-settings`, {
        brand_name: changes.brandName,
        accent_color: changes.accentColor,
        welcome_title_bs: changes.welcomeTitleBs,
        welcome_title_en: changes.welcomeTitleEn,
        welcome_message_bs: changes.welcomeMessageBs,
        welcome_message_en: changes.welcomeMessageEn,
        support_contact: changes.supportContact,
        privacy_policy_url: changes.privacyPolicyUrl,
      }),
    );

    const saved = fromApiRow(row);

    this.current.set(saved);

    return saved;
  }
}

function fromApiRow(row: PortalSettingsApiRow): PortalSettings {
  return {
    brandName: row.brand_name,
    accentColor: row.accent_color,
    welcomeTitleBs: row.welcome_title_bs,
    welcomeTitleEn: row.welcome_title_en,
    welcomeMessageBs: row.welcome_message_bs,
    welcomeMessageEn: row.welcome_message_en,
    supportContact: row.support_contact,
    privacyPolicyUrl: row.privacy_policy_url,
    version: row.version,
  };
}
