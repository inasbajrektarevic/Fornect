import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  FornectNotification,
  NotificationService,
  NotificationTimeLabel,
  notificationTimeLabel
} from '../../core/services/notification';

import {
  TranslatePipe
} from '../../shared/pipes/translate';

interface NotificationView extends FornectNotification {
  time: NotificationTimeLabel;
}

@Component({
  selector: 'app-notifications',
  imports: [
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss'
})
export class Notifications {
  private readonly notificationService =
    inject(NotificationService);

  /**
   * Vrijeme se računa jednom po osvježavanju liste, umjesto da se
   * poziva iz šablona — inače bi se računalo pri svakoj provjeri
   * promjena, a rezultat bi zavisio od trenutka, pa Angular ne bi
   * mogao znati da se ništa nije promijenilo.
   */
  readonly notifications = computed<NotificationView[]>(() =>
    this.notificationService.notifications().map(notification => ({
      ...notification,
      time: notificationTimeLabel(notification.createdAt)
    }))
  );

  readonly unreadCount = this.notificationService.unreadCount;

  constructor() {
    // Lista se učitava i pri prijavi, ali ekran se otvara i mnogo
    // kasnije — tada treba svježe stanje, ne ono od jutros.
    void this.notificationService.reload();
  }

  markAsRead(id: string): void {
    void this.notificationService.markAsRead(id);
  }

  markAllAsRead(): void {
    void this.notificationService.markAllAsRead();
  }
}
