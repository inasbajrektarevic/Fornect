import { Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';

import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

import { AuthService } from './core/services/auth';
import { HubService } from './core/services/hub';
import { BottomNav } from './shared/components/bottom-nav/bottom-nav';

/**
 * Ekrani sa kojih hardversko dugme nazad zatvara aplikaciju.
 * Na njima nema kuda dalje unazad: prijava je pocetak, a
 * dashboard i Pro pregled su korijen svog panela. Vracanje sa
 * dashboarda na prijavu bi bilo pogresno, jer korisnik nije
 * odjavljen.
 */
const ROOT_ROUTES = ['/login', '/dashboard', '/pro'];

/**
 * Ekrani Home panela na kojima stoji donja navigacija (samo na
 * telefonu — vidi BottomNav). Nema je na prijavi, registraciji i
 * uparivanju (nalog još nije spreman), ni u Pro panelu, koji ima svoj
 * raspored ekrana.
 */
const BOTTOM_NAV_ROUTES = [
  '/dashboard',
  '/devices',
  '/protection',
  '/schedules',
  '/notifications',
  '/settings',
  '/new-devices',
  '/help',
  '/capacity',
  '/fleet',
  '/portal-branding',
];

@Component({
  imports: [RouterOutlet, BottomNav],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('fornect-admin-web');

  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly hubService = inject(HubService);

  private readonly path = signal('');

  protected readonly showBottomNav = computed(() => {
    const path = this.path();

    return (
      this.authService.isAuthenticated() &&
      !this.hubService.isPro() &&
      BOTTOM_NAV_ROUTES.some((root) => path === root || path.startsWith(`${root}/`))
    );
  });

  constructor() {
    this.registerBackButton();

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.path.set(event.urlAfterRedirects.split('?')[0]);
      }
    });
  }

  /**
   * Android ima hardversko dugme nazad, koje web nema. Bez ovoga
   * pritisak na njega zatvara aplikaciju sa bilo kojeg ekrana,
   * sto korisnik dozivljava kao pad aplikacije.
   *
   * U browseru se ne registruje nista - tamo dugme nazad radi
   * samo od sebe.
   */
  private registerBackButton(): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const url = this.router.url.split('?')[0];

      if (!canGoBack || ROOT_ROUTES.includes(url)) {
        void CapacitorApp.exitApp();

        return;
      }

      this.location.back();
    });
  }
}
