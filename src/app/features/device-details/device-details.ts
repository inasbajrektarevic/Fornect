import {
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  DeviceProfile,
  DeviceRestrictions,
  DeviceService,
  restrictionKeys
} from '../../core/services/device';

import {
  DAY_LABELS,
  isPausedAt,
  nextPauseStart,
  scheduleRangeLabel
} from '../../core/services/schedule';
import { LanguageService } from '../../core/services/language';
import { TranslatePipe } from '../../shared/pipes/translate';

@Component({
  selector: 'app-device-details',
  imports: [
    RouterLink,
    FormsModule,
    TranslatePipe
  ],
  templateUrl: './device-details.html',
  styleUrl: './device-details.scss'
})
export class DeviceDetails implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly deviceService = inject(DeviceService);
  private readonly languageService = inject(LanguageService);

  private readonly changeDetector = inject(ChangeDetectorRef);

  private now = Date.now();

  // Odbrojavanje hitnog izuzetka i rasporeda. Bez zone.js promjena
  // polja iz tajmera ne osvjezava ekran sama, pa bi preostale minute
  // stajale dok korisnik nesto ne klikne.
  private readonly countdownTimer =
    window.setInterval(() => {
      this.now = Date.now();
      this.changeDetector.markForCheck();
    }, 30000);

  deviceId =
    this.route.snapshot.paramMap.get('id') ?? 'amar-iphone';

  device =
    this.deviceService.getDevice(this.deviceId) ??
    this.deviceService.getDevice('amar-iphone')!;

  profilePickerOpen = this.device.profile === null;
  currentProfile: DeviceProfile = this.device.profile;

  renameOpen = false;
  newDeviceName = this.device.name;
  renameError = '';

  readonly restrictionKeys = restrictionKeys;

  ngOnDestroy(): void {
    window.clearInterval(this.countdownTimer);
  }

  get overrideActive(): boolean {
    return !!this.device.overrideUntil &&
      this.device.overrideUntil > this.now;
  }

  get overrideMinutes(): number {
    if (!this.overrideActive || !this.device.overrideUntil) {
      return 0;
    }

    return Math.max(
      1,
      Math.ceil(
        (this.device.overrideUntil - this.now) / 60000
      )
    );
  }

  get profileName(): string {
    switch (this.currentProfile) {
      case 'Child':
        return this.languageService.t(
          'deviceDetails.child'
        );

      case 'Teen':
        return this.languageService.t(
          'deviceDetails.teen'
        );

      case 'Adult':
        return this.languageService.t(
          'deviceDetails.adult'
        );

      case 'Admin':
        return this.languageService.t(
          'deviceDetails.admin'
        );

      default:
        return this.languageService.t(
          'deviceDetails.unassigned'
        );
    }
  }

  get bedtimeStatus(): string {
    const schedule = this.device.schedule;

    if (!schedule.enabled) {
      return this.languageService.t(
        'deviceDetails.noBedtimeActive'
      );
    }

    if (this.overrideActive) {
      return this.languageService.t(
        'deviceDetails.temporaryAccessRemaining',
        { minutes: this.overrideMinutes }
      );
    }

    const current = new Date(this.now);

    if (isPausedAt(schedule, current)) {
      return this.languageService.t(
        'deviceDetails.pausedByBedtime',
        { name: this.device.name }
      );
    }

    const next = nextPauseStart(schedule, current);

    if (!next) {
      return this.languageService.t(
        'deviceDetails.noUpcomingBedtime'
      );
    }

    const minutesUntil = Math.ceil(
      (next.getTime() - this.now) / 60000
    );

    if (minutesUntil < 60) {
      return this.languageService.t(
        'deviceDetails.turnsOffMinutes',
        {
          name: this.device.name,
          minutes: minutesUntil
        }
      );
    }

    if (minutesUntil < 24 * 60) {
      const hours = Math.floor(minutesUntil / 60);
      const minutes = minutesUntil % 60;

      if (minutes === 0) {
        return this.languageService.t(
          'deviceDetails.turnsOffHours',
          {
            name: this.device.name,
            hours
          }
        );
      }

      return this.languageService.t(
        'deviceDetails.turnsOffHoursMinutes',
        {
          name: this.device.name,
          hours,
          minutes
        }
      );
    }

    return this.languageService.t(
      'deviceDetails.nextBedtime',
      {
        day: this.getTranslatedDay(
          DAY_LABELS[next.getDay()]
        ),
        time: this.formatClock(next)
      }
    );
  }

  private formatClock(value: Date): string {
    const hours = value
      .getHours()
      .toString()
      .padStart(2, '0');

    const minutes = value
      .getMinutes()
      .toString()
      .padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  openRename(): void {
    this.newDeviceName = this.device.name;
    this.renameError = '';
    this.renameOpen = true;
  }

  cancelRename(): void {
    this.newDeviceName = this.device.name;
    this.renameError = '';
    this.renameOpen = false;
  }

  saveRename(): void {
    const name = this.newDeviceName.trim();

    if (!name) {
      this.renameError = this.languageService.t(
        'deviceDetails.nameRequired'
      );
      return;
    }

    if (name.length > 40) {
      this.renameError = this.languageService.t(
        'deviceDetails.nameTooLong'
      );
      return;
    }

    this.deviceService.updateDevice(
      this.device.id,
      { name }
    );

    this.renameOpen = false;
    this.renameError = '';

    this.refreshDevice();
  }

  allowTemporary(minutes: number): void {
    this.deviceService.setTemporaryOverride(
      this.device.id,
      minutes
    );

    this.refreshDevice();
  }

  allowUntilEndOfDay(): void {
    const now = Date.now();

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const minutes = Math.max(
      1,
      Math.ceil(
        (endOfDay.getTime() - now) / 60000
      )
    );

    this.deviceService.setTemporaryOverride(
      this.device.id,
      minutes
    );

    this.refreshDevice();
  }

  get overrideStatusText(): string {
    if (!this.device.overrideUntil) {
      return '';
    }

    const until =
      new Date(this.device.overrideUntil);

    if (
      until.getHours() === 23 &&
      until.getMinutes() === 59
    ) {
      return this.languageService.t(
        'deviceDetails.allowedUntilEndToday'
      );
    }

    return this.languageService.t(
      'deviceDetails.allowedForMinutes',
      { minutes: this.overrideMinutes }
    );
  }

  cancelOverride(): void {
    this.deviceService.clearOverride(this.device.id);
    this.refreshDevice();
  }

  toggleProfilePicker(): void {
    this.profilePickerOpen =
      !this.profilePickerOpen;
  }

  setProfile(
    profile: Exclude<DeviceProfile, null>
  ): void {
    this.currentProfile = profile;
    this.profilePickerOpen = false;

    this.deviceService.updateDevice(
      this.device.id,
      { profile }
    );

    this.refreshDevice();
  }

  get protectionLabel(): string {
    if (this.device.protectionEnabled === false) {
      return this.languageService.t(
        'deviceDetails.protectionOff'
      );
    }

    switch (this.device.protectionLevel) {
      case 'full':
        return this.languageService.t(
          'deviceDetails.fullProtection'
        );

      case 'standard':
        return this.languageService.t(
          'deviceDetails.standardProtection'
        );

      default:
        return this.languageService.t(
          'deviceDetails.needsSetup'
        );
    }
  }

  get scheduleLabel(): string {
    const schedule = this.device.schedule;

    if (!schedule.enabled) {
      return this.languageService.t(
        'deviceDetails.noSchedule'
      );
    }

    if (schedule.mode === 'perDay') {
      return this.languageService.t(
        'deviceDetails.perDaySchedule'
      );
    }

    return scheduleRangeLabel(schedule);
  }

  private getTranslatedDay(
    day: string
  ): string {
    const keys: Record<string, string> = {
      Sun: 'deviceDetails.daySun',
      Mon: 'deviceDetails.dayMon',
      Tue: 'deviceDetails.dayTue',
      Wed: 'deviceDetails.dayWed',
      Thu: 'deviceDetails.dayThu',
      Fri: 'deviceDetails.dayFri',
      Sat: 'deviceDetails.daySat'
    };

    return this.languageService.t(
      keys[day] ?? day
    );
  }

  get restrictions(): DeviceRestrictions {
    return this.deviceService.getRestrictions(
      this.device.id
    );
  }

  get usingProfileDefaults(): boolean {
    return this.deviceService.usesProfileDefaults(
      this.device.id
    );
  }

  isRestrictionOn(
    key: keyof DeviceRestrictions
  ): boolean {
    return this.restrictions[key];
  }

  restrictionLabelKey(
    key: keyof DeviceRestrictions
  ): string {
    return `restrictions.${key}`;
  }

  restrictionHintKey(
    key: keyof DeviceRestrictions
  ): string {
    return `restrictions.${key}Hint`;
  }

  toggleRestriction(
    key: keyof DeviceRestrictions
  ): void {
    this.deviceService.setRestriction(
      this.device.id,
      key,
      !this.restrictions[key]
    );

    this.refreshDevice();
  }

  resetRestrictions(): void {
    this.deviceService.resetRestrictions(
      this.device.id
    );

    this.refreshDevice();
  }

  get offlineAlertEnabled(): boolean {
    return this.deviceService.offlineAlertEnabled(
      this.device
    );
  }

  toggleOfflineAlert(): void {
    this.deviceService.setOfflineAlert(
      this.device.id,
      !this.offlineAlertEnabled
    );

    this.refreshDevice();
  }

  private refreshDevice(): void {
    const updated =
      this.deviceService.getDevice(this.device.id);

    if (updated) {
      this.device = updated;
      this.currentProfile = updated.profile;
      this.newDeviceName = updated.name;
    }
  }
}
