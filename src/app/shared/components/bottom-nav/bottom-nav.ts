import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { NotificationService } from '../../../core/services/notification';
import { TranslatePipe } from '../../pipes/translate';

/**
 * Donja navigacija za telefon.
 *
 * Na telefonu se glavni ekrani dohvataju palcem, pa idu na dno
 * ekrana, ne u meni na vrhu. Na širem ekranu se ne prikazuje (CSS) —
 * desktop ostaje kakav je bio: dashboard sa brzim akcijama.
 *
 * Pet stavki, po redu Home toka iz mobilnog briefa: početna, uređaji,
 * zaštita, rasporedi, obavještenja. Postavke su na zupčaniku na
 * početnoj, kao i do sada.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
})
export class BottomNav {
  private readonly notificationService = inject(NotificationService);

  readonly unread = this.notificationService.unreadCount;
}
