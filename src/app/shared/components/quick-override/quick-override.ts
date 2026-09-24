import { Component, computed, inject, OnDestroy, signal } from '@angular/core';

import { DeviceService, FornectNetworkDevice } from '../../../core/services/device';
import { isPausedAt } from '../../../core/services/schedule';
import { TranslatePipe } from '../../pipes/translate';

/**
 * Hitni izuzetak na dohvat ruke.
 *
 * Roditelj ga koristi pod pritiskom ("treba mi internet odmah, za
 * zadaću"). Do sada je bio samo u detaljima uređaja: dashboard →
 * Uređaji → uređaj → skrolanje do kartice. Ovdje stoji na vrhu
 * dashboarda, ali SAMO kad nešto zaista jeste pauzirano po rasporedu
 * ili već ima izuzetak — inače se ne prikazuje uopšte.
 *
 * Isti poziv kao u detaljima uređaja (DeviceService), ista pravila.
 */
@Component({
  selector: 'app-quick-override',
  imports: [TranslatePipe],
  templateUrl: './quick-override.html',
  styleUrl: './quick-override.scss',
})
export class QuickOverride implements OnDestroy {
  private readonly deviceService = inject(DeviceService);

  /**
   * Trenutno vrijeme kao signal: raspored i preostale minute zavise od
   * njega, a bez zone.js se ekran ne osvježava sam kako vrijeme prolazi.
   */
  private readonly now = signal(Date.now());

  private readonly timer = window.setInterval(() => this.now.set(Date.now()), 30000);

  /** Pauzirani po rasporedu, bez aktivnog izuzetka. */
  readonly paused = computed(() => {
    const now = this.now();

    return this.deviceService
      .devices()
      .filter((device) => !this.hasOverride(device, now) && isPausedAt(device.schedule, new Date(now)));
  });

  /** Uređaji kojima je internet trenutno privremeno dozvoljen. */
  readonly allowed = computed(() => {
    const now = this.now();

    return this.deviceService.devices().filter((device) => this.hasOverride(device, now));
  });

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  allow(device: FornectNetworkDevice, minutes: number): void {
    this.deviceService.setTemporaryOverride(device.id, minutes);
    this.now.set(Date.now());
  }

  allowUntilEndOfDay(device: FornectNetworkDevice): void {
    const now = Date.now();
    const endOfDay = new Date(now);

    endOfDay.setHours(23, 59, 59, 999);

    this.allow(device, Math.max(1, Math.ceil((endOfDay.getTime() - now) / 60000)));
  }

  end(device: FornectNetworkDevice): void {
    this.deviceService.clearOverride(device.id);
    this.now.set(Date.now());
  }

  minutesLeft(device: FornectNetworkDevice): number {
    return Math.max(0, Math.ceil(((device.overrideUntil ?? 0) - this.now()) / 60000));
  }

  /** Isti znak kao u detaljima uređaja: "do kraja dana" završava u 23:59. */
  untilEndOfDay(device: FornectNetworkDevice): boolean {
    const until = new Date(device.overrideUntil ?? 0);

    return until.getHours() === 23 && until.getMinutes() === 59;
  }

  private hasOverride(device: FornectNetworkDevice, now: number): boolean {
    return !!device.overrideUntil && device.overrideUntil > now;
  }
}
