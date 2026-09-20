import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { HubService } from '../../core/services/hub';
import { PortalSettingsService } from '../../core/services/portal-settings';
import { TranslatePipe } from '../../shared/pipes/translate';

interface SplashSettings {
  headline: string;
  message: string;
  brandName: string;
}

@Component({
  selector: 'app-pro-hospitality',
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './pro-hospitality.html',
  styleUrl: './pro-hospitality.scss'
})
export class ProHospitality {
  private readonly authService = inject(AuthService);
  private readonly hubService = inject(HubService);
  private readonly portalSettings = inject(PortalSettingsService);

  // Aplikacija je zoneless: promjena običnog polja nakon `await` ne
  // pokreće provjeru promjena sama od sebe, pa bi ekran ostao prazan
  // iako su podaci stigli. Ista zamka kao na ekranu pristanka.
  private readonly changeDetector = inject(ChangeDetectorRef);

  autoProtectGuests = this.loadAutoProtect();

  /**
   * Isti podatak kao na ekranu "Tekst i brend portala" — ne kopija.
   *
   * Ranije je ovo bio zaseban zapis u localStorage-u, pa je hotel ovdje
   * unosio tekst koji nigdje nije stizao, a na uređaju je stajalo nešto
   * treće. Sad oba ekrana idu kroz PortalSettingsService; ovdje se vide
   * samo tri polja, jer hotelu ostalo i ne treba.
   */
  splash: SplashSettings = {
    headline: '',
    message: '',
    brandName: ''
  };

  saved = false;

  // POC: statistika bez identifikacije pojedinačnih gostiju.
  readonly guestsToday = 34;
  readonly guestsThisWeek = 218;
  readonly averageSessionMinutes = 42;

  get connectedGuests(): number {
    return this.hubService.hub().connectedUsers;
  }

  toggleAutoProtect(): void {
    this.autoProtectGuests = !this.autoProtectGuests;

    localStorage.setItem(
      this.key('auto-protect'),
      JSON.stringify(this.autoProtectGuests)
    );
  }

  constructor() {
    void this.loadSplash();
  }

  async saveSplash(): Promise<void> {
    // Hotel uređuje bosanski tekst; engleski se mijenja na ekranu
    // "Tekst i brend portala", gdje stoje oba jezika.
    const settings = await this.portalSettings.save({
      brandName: this.splash.brandName,
      welcomeTitleBs: this.splash.headline,
      welcomeMessageBs: this.splash.message
    });

    this.splash = {
      brandName: settings.brandName,
      headline: settings.welcomeTitleBs,
      message: settings.welcomeMessageBs
    };

    this.saved = true;
    this.changeDetector.markForCheck();

    window.setTimeout(() => {
      this.saved = false;
      this.changeDetector.markForCheck();
    }, 2000);
  }

  private key(name: string): string {
    const accountId =
      this.authService.currentUser()?.accountId ??
      'anonymous';

    return `fornect-hospitality-${name}-${accountId}`;
  }

  private loadAutoProtect(): boolean {
    const saved = localStorage.getItem(
      this.key('auto-protect')
    );

    if (saved === null) {
      return true;
    }

    try {
      return JSON.parse(saved) === true;
    } catch {
      return true;
    }
  }

  private async loadSplash(): Promise<void> {
    await this.portalSettings.reload();

    const settings = this.portalSettings.settings();

    if (settings) {
      this.splash = {
        brandName: settings.brandName,
        headline: settings.welcomeTitleBs,
        message: settings.welcomeMessageBs
      };

      this.changeDetector.markForCheck();
    }
  }
}
