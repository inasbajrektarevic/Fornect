import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth';

export type HubKind = 'home' | 'pro';
export type HubMode = 'home' | 'hospitality' | 'agency';
export type LoadPeriod = 'day' | 'week' | 'month';

export interface HubInfo {
  name: string;
  serialNumber: string;
  kind: HubKind;
  mode: HubMode;
  softwareVersion: string;
  online: boolean;
  capacity: number;
  connectedUsers: number;
  /**
   * Server je potvrdio da je hub uparen sa nalogom. `false` za
   * podrazumijevanu vrijednost bez huba — tada ime, "online" i
   * kapacitet nisu stvarni podaci i ekran ih ne smije prikazati kao
   * stanje uređaja.
   */
  paired?: boolean;
}

export interface LoadPoint {
  label: string;
  value: number;
}

interface HubApiResponse {
  id: string;
  name: string;
  kind: HubKind;
  mode: HubMode;
  capacity: number | null;
  online: boolean;
  connected_devices: number;
}

/**
 * Fornect uređaj (hub) na koji je nalog uparen.
 *
 * Tip (Home/Pro) i mod (Hospitality/Agency) su svojstva UREĐAJA i
 * dolaze sa servera (GET /api/v1/app/hub). Panel ih ne bira i korisnik
 * ih ne mijenja — specifikacija: "aplikacija pri prijavi čita tip
 * uređaja i mod sa backend-a i na osnovu toga renderuje odgovarajući
 * set ekrana".
 *
 * `hub` signal se odmah puni iz localStorage-a, da ekrani imaju šta
 * prikazati. Ali guardovi koji odlučuju Home ili Pro čekaju odgovor
 * servera (`ensureLoaded()`): bez toga je Pro nalog na novom
 * pregledaču ili telefonu dobijao Home panel, jer lokalnog zapisa još
 * nema, a odgovor stigne tek poslije preusmjeravanja.
 *
 * Nalog bez uparenog huba (404) je Home: nema uređaja koji bi rekao
 * drugačije.
 */
@Injectable({
  providedIn: 'root',
})
export class HubService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly hub = signal<HubInfo>(this.load());

  readonly isPro = computed(() => this.hub().kind === 'pro');

  readonly mode = computed(() => this.hub().mode);

  readonly capacityPercent = computed(() => {
    const hub = this.hub();

    if (hub.capacity <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((hub.connectedUsers / hub.capacity) * 100));
  });

  readonly nearCapacity = computed(() => this.capacityPercent() >= 80);

  /** Odgovor servera za trenutni nalog; `null` dok se ne zatraži. */
  private loaded: Promise<void> | null = null;

  /**
   * Redni broj posljednjeg zahtjeva. Odgovor koji stigne kasnije od
   * novijeg stanja (npr. 404 poslan prije nego što je korisnik upario
   * hub) ne smije ga pregaziti.
   */
  private generation = 0;

  constructor() {
    if (this.authService.isAuthenticated()) {
      this.loaded = this.refreshFromApi();
    }
  }

  /**
   * Čeka da server javi tip i mod huba. Guardovi ovo zovu prije nego
   * odluče Home ili Pro. Poslije prvog odgovora vraća se odmah.
   */
  ensureLoaded(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      return Promise.resolve();
    }

    this.loaded ??= this.refreshFromApi();

    return this.loaded;
  }

  /**
   * Uparuje trenutni nalog sa fizičkim hub-om preko pairing koda koji
   * je uređaj generisao (POST /api/v1/devices/register ili
   * /:id/pairing-code). Baca grešku (sa porukom sa backend-a) ako je
   * kod netačan/istekao/uređaj već uparen — poziva iz
   * DevicePairing komponente hvataju to i prikazuju korisniku.
   */
  async claimHub(pairingCode: string): Promise<HubInfo> {
    const response = await firstValueFrom(
      this.http.post<HubApiResponse>(`${API_BASE_URL}/app/hub/claim`, {
        pairing_code: pairingCode,
      }),
    );

    const hub: HubInfo = {
      ...this.hub(),
      name: response.name,
      serialNumber: response.id,
      kind: response.kind,
      mode: response.mode,
      online: response.online,
      capacity: response.capacity ?? 0,
      connectedUsers: response.connected_devices,
      paired: true,
    };

    this.hub.set(hub);
    this.save(hub);

    // Upravo upareni hub je najnovije stanje; zahtjev koji je možda još
    // u letu (npr. 404 od prije uparivanja) se odbacuje.
    this.generation++;
    this.loaded = Promise.resolve();

    return hub;
  }

  syncWithCurrentAccount(): void {
    this.hub.set(this.load());
    this.loaded = this.refreshFromApi();
  }

  getLoad(period: LoadPeriod): LoadPoint[] {
    switch (period) {
      case 'week':
        return [
          { label: 'Mon', value: 38 },
          { label: 'Tue', value: 44 },
          { label: 'Wed', value: 41 },
          { label: 'Thu', value: 52 },
          { label: 'Fri', value: 68 },
          { label: 'Sat', value: 74 },
          { label: 'Sun', value: 59 },
        ];

      case 'month':
        return [
          { label: 'W1', value: 42 },
          { label: 'W2', value: 51 },
          { label: 'W3', value: 63 },
          { label: 'W4', value: 71 },
        ];

      default:
        return [
          { label: '00', value: 12 },
          { label: '04', value: 8 },
          { label: '08', value: 26 },
          { label: '12', value: 44 },
          { label: '16', value: 51 },
          { label: '20', value: 63 },
          { label: '24', value: 47 },
        ];
    }
  }

  private async refreshFromApi(): Promise<void> {
    const generation = ++this.generation;

    try {
      const response = await firstValueFrom(
        this.http.get<HubApiResponse>(`${API_BASE_URL}/app/hub`),
      );

      if (generation !== this.generation) {
        return;
      }

      const hub: HubInfo = {
        ...this.hub(),
        name: response.name,
        serialNumber: response.id,
        kind: response.kind,
        mode: response.mode,
        online: response.online,
        capacity: response.capacity ?? 0,
        connectedUsers: response.connected_devices,
        paired: true,
      };

      this.hub.set(hub);
      this.save(hub);
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }

      // 404: nalog nema uparen hub, pa je Home. Lokalni zapis se
      // briše, jer je mogao ostati Pro iz ranijeg POC prekidača moda u
      // Postavkama — i taj bi nalog inače i dalje vidio Pro panel.
      if ((error as { status?: number } | null)?.status === 404) {
        const accountId = this.authService.currentUser()?.accountId ?? 'anonymous';

        localStorage.removeItem(this.storageKey(accountId));
        this.hub.set(this.load());
      }

      // Server nedostupan: ostaje ono što je zapamćeno od prošlog puta.
    }
  }

  private storageKey(accountId: string): string {
    return `fornect-hub-${accountId}`;
  }

  private save(hub: HubInfo): void {
    const accountId = this.authService.currentUser()?.accountId ?? 'anonymous';

    localStorage.setItem(this.storageKey(accountId), JSON.stringify(hub));
  }

  private load(): HubInfo {
    const accountId = this.authService.currentUser()?.accountId ?? 'anonymous';

    const saved = localStorage.getItem(this.storageKey(accountId));

    if (saved) {
      try {
        const hub = JSON.parse(saved) as HubInfo;

        if (hub.mode) {
          return hub;
        }
      } catch {
        localStorage.removeItem(this.storageKey(accountId));
      }
    }

    const fallback: HubInfo = {
      name: 'Fornect Home',
      serialNumber: 'FH-POC-001',
      kind: 'home',
      mode: 'home',
      softwareVersion: '0.1.0',
      online: true,
      capacity: 20,
      connectedUsers: 4,
      paired: false,
    };

    // Podrazumijevano stanje se odmah snima da bi uređaj
    // imao zapis i prije prve promjene moda.
    this.save(fallback);

    return fallback;
  }
}
