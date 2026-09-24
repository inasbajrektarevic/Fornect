import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { NotificationService } from '../../core/services/notification';
import { TranslatePipe } from '../../shared/pipes/translate';
import {
  DeviceService,
  FornectNetworkDevice
} from '../../core/services/device';

import { HubService } from '../../core/services/hub';
import { isPausedAt } from '../../core/services/schedule';
import { ConnectionBanner } from '../../shared/components/connection-banner/connection-banner';
import { QuickOverride } from '../../shared/components/quick-override/quick-override';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TranslatePipe, ConnectionBanner, QuickOverride],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {
  private readonly authService = inject(AuthService);
  private readonly deviceService = inject(DeviceService);
  private readonly notificationService = inject(NotificationService);
  private readonly hubService = inject(HubService);
  private readonly router = inject(Router);

  networkPaused = this.loadNetworkPaused();

  /**
   * Fornect uređaj kakav ga javlja server (GET /app/hub).
   *
   * Ranije je ovdje stajao zakucan objekat: "online", "v0.1.0",
   * "viđen upravo sada" — i za nalog koji uopšte nema uređaj. Nijedan
   * od ta tri podatka server ne daje. Verziju softvera uređaj još ne
   * javlja (brief, sekcija 2: ekran piše da je ne javlja, ne izmišlja
   * je), a "posljednji put viđen" API ne vraća, pa se ne prikazuje.
   */
  get fornectDevice(): { paired: boolean; name: string; online: boolean } {
    const hub = this.hubService.hub();

    return {
      paired: hub.paired === true,
      name: hub.name,
      online: hub.online,
    };
  }

  get unreadNotifications(): number {
    return this.notificationService.unreadCount();
  }

  /**
   * Uređaji koje niko još nije klasifikovao. Kad ih ima, na vrhu
   * dashboarda stoji poziv da se to riješi — to je jedino mjesto na
   * kojem će vlasnik primijetiti uređaj koji ne prepoznaje.
   */
  get unclassifiedCount(): number {
    return this.deviceService.unclassifiedDevices().length;
  }

  get devicesOnline(): number {
    return this.deviceService.devices()
      .filter(device => device.online)
      .length;
  }

  get protectedDevices(): number {
    return this.deviceService.devices()
      .filter(device =>
        device.profile !== null &&
        device.protectionLevel !== 'needs-setup'
      )
      .length;
  }

  get childProfiles(): number {
    return this.deviceService.devices()
      .filter(device => device.profile === 'Child')
      .length;
  }

  get pausedDevices(): number {
    if (this.networkPaused) {
      return this.deviceService.devices().length;
    }

    return this.deviceService.devices()
      .filter(
        device =>
          device.online &&
          this.isPausedNow(device)
      )
      .length;
  }

  toggleInternetPause(): void {
    this.networkPaused = !this.networkPaused;

    localStorage.setItem(
      this.networkPauseStorageKey,
      JSON.stringify(this.networkPaused)
    );
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private get networkPauseStorageKey(): string {
    const accountId =
      this.authService.currentUser()?.accountId ?? 'anonymous';

    return `fornect-network-paused-${accountId}`;
  }

  private loadNetworkPaused(): boolean {
    const saved = localStorage.getItem(
      this.networkPauseStorageKey
    );

    if (saved === null) {
      return false;
    }

    try {
      return JSON.parse(saved) === true;
    } catch {
      return false;
    }
  }

  private isPausedNow(device: FornectNetworkDevice): boolean {
    if (
      device.overrideUntil &&
      device.overrideUntil > Date.now()
    ) {
      return false;
    }

    return isPausedAt(device.schedule, new Date());
  }
}
