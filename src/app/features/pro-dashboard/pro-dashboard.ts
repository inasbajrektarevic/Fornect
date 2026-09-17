import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth';
import {
  HubService,
  LoadPeriod,
  LoadPoint
} from '../../core/services/hub';
import { NotificationService } from '../../core/services/notification';
import { TranslatePipe } from '../../shared/pipes/translate';
import { ConnectionBanner } from '../../shared/components/connection-banner/connection-banner';

interface ChartPoint {
  x: number;
  y: number;
  label: string;
  value: number;
}

@Component({
  selector: 'app-pro-dashboard',
  imports: [RouterLink, TranslatePipe, ConnectionBanner],
  templateUrl: './pro-dashboard.html',
  styleUrl: './pro-dashboard.scss'
})
export class ProDashboard {
  private readonly authService = inject(AuthService);
  private readonly hubService = inject(HubService);
  private readonly notificationService =
    inject(NotificationService);
  private readonly router = inject(Router);

  private readonly chartWidth = 640;
  private readonly chartHeight = 180;

  readonly periods: LoadPeriod[] = [
    'day',
    'week',
    'month'
  ];

  period: LoadPeriod = 'day';

  get hub() {
    return this.hubService.hub();
  }

  get mode(): string {
    return this.hubService.mode();
  }

  get capacityPercent(): number {
    return this.hubService.capacityPercent();
  }

  get nearCapacity(): boolean {
    return this.hubService.nearCapacity();
  }

  get unreadNotifications(): number {
    return this.notificationService.unreadCount();
  }

  get modeLabelKey(): string {
    return this.mode === 'agency'
      ? 'pro.modeAgency'
      : 'pro.modeHospitality';
  }

  get loadPoints(): LoadPoint[] {
    return this.hubService.getLoad(this.period);
  }

  get peakLoad(): number {
    return Math.max(
      ...this.loadPoints.map(point => point.value)
    );
  }

  get averageLoad(): number {
    const points = this.loadPoints;

    if (!points.length) {
      return 0;
    }

    const total = points.reduce(
      (sum, point) => sum + point.value,
      0
    );

    return Math.round(total / points.length);
  }

  get chartPoints(): ChartPoint[] {
    const points = this.loadPoints;

    if (!points.length) {
      return [];
    }

    const max = Math.max(this.peakLoad, 1);

    const step =
      points.length > 1
        ? this.chartWidth / (points.length - 1)
        : 0;

    return points.map((point, index) => ({
      x: Math.round(index * step),
      y: Math.round(
        this.chartHeight -
          (point.value / max) * (this.chartHeight - 12)
      ),
      label: point.label,
      value: point.value
    }));
  }

  get chartLine(): string {
    return this.chartPoints
      .map(point => `${point.x},${point.y}`)
      .join(' ');
  }

  get chartArea(): string {
    const points = this.chartPoints;

    if (!points.length) {
      return '';
    }

    const first = points[0];
    const last = points[points.length - 1];

    return [
      `${first.x},${this.chartHeight}`,
      this.chartLine,
      `${last.x},${this.chartHeight}`
    ].join(' ');
  }

  setPeriod(period: LoadPeriod): void {
    this.period = period;
  }

  periodLabelKey(period: LoadPeriod): string {
    return `pro.period${
      period.charAt(0).toUpperCase() + period.slice(1)
    }`;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
