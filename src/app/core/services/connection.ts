import { computed, inject, Injectable, signal } from '@angular/core';

import { AuthService } from './auth';

export type ConnectionStatus = 'online' | 'offline' | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  lastSyncedAt: number | null;
}

/**
 * Stanje veze sa Fornect uređajem.
 *
 * Specifikacija traži da aplikacija ne bude prazna pri
 * kratkotrajnom gubitku konekcije: posljednje poznato stanje
 * ostaje vidljivo, uz jasnu poruku da podaci nisu svježi.
 *
 * Podaci se ionako drže u localStorage-u, pa je keš već tu.
 * Ovaj servis dodaje ono što je nedostajalo: oznaku koliko
 * su podaci stari i da li se uređaju uopšte može pristupiti.
 *
 * Stanje postavlja HubService iz stvarnog odgovora GET /app/hub:
 * 'online' kad server javi da hub šalje heartbeat, 'offline' kad
 * ne šalje (ili hub nije uparen), 'error' kad server nije
 * odgovorio. Ranije ga je ručno birao POC prekidač u Postavkama.
 *
 * Ovaj servis namjerno zavisi samo od AuthService-a. HubService
 * ubrizgava njega, pa bi obrnuti inject napravio krug — zato se
 * "Pokušaj ponovo" vraća HubService-u preko `registerRefresh`.
 */
@Injectable({
  providedIn: 'root'
})
export class ConnectionService {
  private readonly authService = inject(AuthService);

  private readonly state = signal<ConnectionState>(
    this.load()
  );

  readonly status = computed(() => this.state().status);

  readonly isOnline = computed(
    () => this.state().status === 'online'
  );

  /** Podaci na ekranu su posljednji poznati, ne svježi. */
  readonly isStale = computed(
    () => this.state().status !== 'online'
  );

  readonly lastSyncedAt = computed(
    () => this.state().lastSyncedAt
  );

  /** Stvarno osvježavanje sa servera; registruje ga HubService. */
  private refresher: (() => Promise<void>) | null = null;

  registerRefresh(refresher: () => Promise<void>): void {
    this.refresher = refresher;
  }

  setStatus(status: ConnectionStatus): void {
    const state: ConnectionState = {
      status,
      lastSyncedAt:
        status === 'online'
          ? Date.now()
          : this.state().lastSyncedAt
    };

    this.state.set(state);
    this.save(state);
  }

  /**
   * Ponovni pokušaj: stvarno pita server. Stanje mijenja tek odgovor
   * (preko setStatus iz HubService-a) — ranije je dugme samo
   * proglašavalo vezu uspostavljenom, bez ijednog zahtjeva.
   */
  retry(): Promise<void> {
    return this.refresher?.() ?? Promise.resolve();
  }

  syncWithCurrentAccount(): void {
    this.state.set(this.load());
  }

  private storageKey(): string {
    const accountId =
      this.authService.currentUser()?.accountId ??
      'anonymous';

    return `fornect-connection-${accountId}`;
  }

  private save(state: ConnectionState): void {
    localStorage.setItem(
      this.storageKey(),
      JSON.stringify(state)
    );
  }

  private load(): ConnectionState {
    const saved = localStorage.getItem(
      this.storageKey()
    );

    if (saved) {
      try {
        const state =
          JSON.parse(saved) as Partial<ConnectionState>;

        return {
          status:
            state.status === 'online' ||
            state.status === 'error'
              ? state.status
              : 'offline',
          lastSyncedAt: state.lastSyncedAt ?? null
        };
      } catch {
        localStorage.removeItem(this.storageKey());
      }
    }

    // Dok server ne odgovori, veza nije potvrđena — ne pretpostavlja
    // se da je uređaj online.
    return {
      status: 'offline',
      lastSyncedAt: null
    };
  }
}
