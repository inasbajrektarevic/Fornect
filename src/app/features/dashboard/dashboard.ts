import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { NotificationService } from '../../core/services/notification';
import { TranslatePipe } from '../../shared/pipes/translate';
import {
  DeviceService,
  FornectNetworkDevice
} from '../../core/services/device';

import { isPausedAt } from '../../core/services/schedule';
import { ConnectionBanner } from '../../shared/components/connection-banner/connection-banner';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TranslatePipe, ConnectionBanner],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {
  private readonly authService = inject(AuthService);
  private readonly deviceService = inject(DeviceService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  networkPaused = this.loadNetworkPaused();

  fornectDevice = {
    name: 'Fornect Home',
    online: true,
    softwareVersion: '0.1.0',
    lastSeen: 'Just now'
  };

  get unreadNotifications(): number {
    return this.notificationService.getUnreadCount();
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
