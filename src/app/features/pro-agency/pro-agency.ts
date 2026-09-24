import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { LanguageService } from '../../core/services/language';
import { TranslatePipe } from '../../shared/pipes/translate';

interface TrafficCategory {
  key: string;
  connections: number;
  share: number;
}

interface AgencyEvent {
  time: string;
  level: 'info' | 'warning' | 'alert';
  messageKey: string;
}

interface AlarmSettings {
  enabled: boolean;
  spikeThreshold: number;
  notifyByEmail: boolean;
}

type ReportPeriod = 'day' | 'week' | 'month';
type ReportFormat = 'pdf' | 'csv';

@Component({
  selector: 'app-pro-agency',
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './pro-agency.html',
  styleUrl: './pro-agency.scss'
})
export class ProAgency {
  private readonly authService = inject(AuthService);
  // Tajmer ispod mijenja obicno polje van klika; bez zone.js to ne
  // osvjezava ekran samo, pa poruka ne bi nestala.
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly languageService = inject(LanguageService);

  // POC: samo metapodaci, bez uvida u privatan sadržaj.
  readonly categories: TrafficCategory[] = [
    { key: 'agency.categoryWeb', connections: 18420, share: 41 },
    { key: 'agency.categoryStreaming', connections: 9860, share: 22 },
    { key: 'agency.categorySocial', connections: 7150, share: 16 },
    { key: 'agency.categoryAds', connections: 5380, share: 12 },
    { key: 'agency.categoryOther', connections: 4020, share: 9 }
  ];

  readonly events: AgencyEvent[] = [
    { time: '14:02', level: 'alert', messageKey: 'agency.eventSpike' },
    { time: '12:47', level: 'info', messageKey: 'agency.eventNewDevice' },
    { time: '09:15', level: 'warning', messageKey: 'agency.eventBlocked' },
    { time: '08:00', level: 'info', messageKey: 'agency.eventUpdate' },
    { time: '02:31', level: 'info', messageKey: 'agency.eventNightly' }
  ];

  reportPeriod: ReportPeriod = 'week';
  reportFormat: ReportFormat = 'pdf';
  reportMessage = '';

  alarms: AlarmSettings = this.loadAlarms();
  alarmsSaved = false;

  levelKey(level: AgencyEvent['level']): string {
    switch (level) {
      case 'alert':
        return 'agency.levelAlert';

      case 'warning':
        return 'agency.levelWarning';

      default:
        return 'agency.levelInfo';
    }
  }

  get totalConnections(): number {
    return this.categories.reduce(
      (sum, category) => sum + category.connections,
      0
    );
  }

  generateReport(): void {
    // POC: izvještaj će generisati backend kada API bude spreman.
    this.reportMessage = this.languageService.t(
      'agency.reportQueued',
      { format: this.reportFormat.toUpperCase() }
    );

    window.setTimeout(() => {
      this.reportMessage = '';
      this.changeDetector.markForCheck();
    }, 3000);
  }

  saveAlarms(): void {
    localStorage.setItem(
      this.alarmsKey(),
      JSON.stringify(this.alarms)
    );

    this.alarmsSaved = true;

    window.setTimeout(() => {
      this.alarmsSaved = false;
      this.changeDetector.markForCheck();
    }, 2000);
  }

  private alarmsKey(): string {
    const accountId =
      this.authService.currentUser()?.accountId ??
      'anonymous';

    return `fornect-agency-alarms-${accountId}`;
  }

  private loadAlarms(): AlarmSettings {
    const saved = localStorage.getItem(this.alarmsKey());

    if (saved) {
      try {
        const alarms =
          JSON.parse(saved) as Partial<AlarmSettings>;

        return {
          enabled: alarms.enabled ?? true,
          spikeThreshold: alarms.spikeThreshold ?? 50,
          notifyByEmail: alarms.notifyByEmail ?? true
        };
      } catch {
        // Ide na podrazumijevane vrijednosti.
      }
    }

    return {
      enabled: true,
      spikeThreshold: 50,
      notifyByEmail: true
    };
  }
}
