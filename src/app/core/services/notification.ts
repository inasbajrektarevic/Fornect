import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth';

export type NotificationType = 'offline' | 'update' | 'protection' | 'capacity';

export interface FornectNotification {
  id: string;
  type: NotificationType;
  titleKey: string;
  messageKey: string;
  params?: Record<string, string | number>;
  read: boolean;
  /** Stvarno vrijeme nastanka, sa servera. */
  createdAt: string;
}

interface NotificationApiRow {
  id: string;
  type: NotificationType;
  title_key: string;
  message_key: string;
  params: Record<string, string | number> | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Obavještenja dolaze sa servera.
 *
 * Ranije su živjela u localStorage-u i nastajala tek pri otvaranju
 * liste. To je značilo da se obavještenje o uređaju koji je noću
 * napustio mrežu nije ni napravilo ako niko nije otvorio aplikaciju, a
 * ako se uređaj do jutra vratio — nestalo bi i da jeste. Sada ih pravi
 * server (server/src/services/notifications.ts), pa ovdje ostaje samo
 * čitanje i označavanje pročitanog.
 *
 * Stanje je u signalima, a ne u metodama koje računaju pri svakom
 * pozivu: aplikacija je zoneless, pa je signal ono što će osvježiti
 * ekran kada odgovor sa servera stigne.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly items = signal<FornectNotification[]>([]);

  readonly notifications = this.items.asReadonly();

  readonly unreadCount = computed(
    () => this.items().filter((notification) => !notification.read).length,
  );

  constructor() {
    // Učitavanje se veže za nalog, a ne za pojedinačan ekran: brojač
    // nepročitanih stoji na dashboardu, pa lista mora biti spremna i
    // kada korisnik nikada ne otvori ekran obavještenja.
    effect(() => {
      if (this.authService.isAuthenticated()) {
        void this.reload();
      } else {
        this.items.set([]);
      }
    });
  }

  async reload(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.items.set([]);

      return;
    }

    try {
      const rows = await firstValueFrom(
        this.http.get<NotificationApiRow[]>(`${API_BASE_URL}/app/notifications`),
      );

      this.items.set(rows.map(fromApiRow));
    } catch {
      // Nedostupan backend ne smije obrisati ono što je već prikazano
      // — bolje zastarjela lista nego prazna, jer prazna lista ovdje
      // znači "nema ništa", što nije isto.
    }
  }

  async markAsRead(id: string): Promise<void> {
    this.applyRead((notification) => notification.id === id);

    try {
      await firstValueFrom(
        this.http.post(`${API_BASE_URL}/app/notifications/${id}/read`, {}),
      );
    } catch {
      await this.reload();
    }
  }

  async markAllAsRead(): Promise<void> {
    this.applyRead(() => true);

    try {
      await firstValueFrom(
        this.http.post(`${API_BASE_URL}/app/notifications/read-all`, {}),
      );
    } catch {
      await this.reload();
    }
  }

  /**
   * Odmah mijenja prikaz, pa tek onda javlja serveru. Ako javljanje ne
   * uspije, `reload()` vrati stvarno stanje — korisnik ne smije ostati
   * sa oznakom koja na serveru ne postoji.
   */
  private applyRead(matches: (notification: FornectNotification) => boolean): void {
    this.items.update((notifications) =>
      notifications.map((notification) =>
        matches(notification) ? { ...notification, read: true } : notification,
      ),
    );
  }
}

export interface NotificationTimeLabel {
  key: string;
  params: Record<string, string | number>;
}

/**
 * Kada se obavještenje desilo.
 *
 * Ranije je vrijeme bilo dio teksta, ručno upisano ("prije 1 sat") i
 * nije se mijenjalo — pisalo je isto i sedmicu kasnije. Sada se računa
 * iz stvarnog vremena nastanka.
 *
 * Za svjež događaj je relativno vrijeme jasnije, a za stariji je tačan
 * sat ono što roditelja zanima: "napustio mrežu u 23:12" kaže više od
 * "prije 9 sati".
 */
export function notificationTimeLabel(
  createdAt: string,
  now: Date = new Date(),
): NotificationTimeLabel {
  const at = new Date(createdAt);

  if (Number.isNaN(at.getTime())) {
    return { key: 'notifications.justNow', params: {} };
  }

  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);

  if (minutes < 1) {
    return { key: 'notifications.justNow', params: {} };
  }

  if (minutes < 60) {
    return { key: 'notifications.minutesAgo', params: { minutes } };
  }

  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;

  if (isSameDay(at, now)) {
    return { key: 'notifications.todayAt', params: { time } };
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(at, yesterday)) {
    return { key: 'notifications.yesterdayAt', params: { time } };
  }

  return {
    key: 'notifications.onDateAt',
    params: { date: `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.`, time },
  };
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function fromApiRow(row: NotificationApiRow): FornectNotification {
  return {
    id: row.id,
    type: row.type,
    titleKey: row.title_key,
    messageKey: row.message_key,
    params: row.params ?? undefined,
    read: row.read_at !== null,
    createdAt: row.created_at,
  };
}
