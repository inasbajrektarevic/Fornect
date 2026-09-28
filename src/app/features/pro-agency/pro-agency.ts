import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import { TranslatePipe } from '../../shared/pipes/translate';

interface AlarmSettings {
  enabled: boolean;
  spikeThreshold: number;
  notifyByEmail: boolean;
}

/**
 * Monitoring za Agency mod.
 *
 * Ranije su ovdje stajale zakucane kategorije prometa (18.420 web
 * konekcija...), pet izmišljenih događaja i dugme koje je javljalo da
 * je izvještaj "zatražen", a nije išlo nikuda. Uređaj takvu statistiku
 * još ne šalje i server je ne čuva, pa ekran to i kaže. Alarmi ostaju:
 * čuvaju se lokalno, a ekran jasno piše da se za sada ne aktiviraju.
 */
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

  alarms: AlarmSettings = this.loadAlarms();
  alarmsSaved = false;

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
