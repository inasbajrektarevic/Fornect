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
 * `hub` signal se popunjava odmah sinhrono iz localStorage-a (kao i
 * ranije, da guardovi koji ga sinhrono čitaju rade bez treptaja), a
 * zatim se u pozadini osvježava pravim podacima sa
 * GET /api/v1/app/hub kad god se pozove `syncWithCurrentAccount()`
 * (npr. odmah nakon logina). Ako nalog još nije uparen ni sa jednim
 * fizičkim hub-om (backend vrati 404), ostaje lokalna/mock vrijednost
 * — to je namjeran fallback dok ne postoji hub-pairing tok.
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

  constructor() {
    if (this.authService.isAuthenticated()) {
      void this.refreshFromApi();
    }
  }

  /**
   * `setMode` nema backend ekvivalent za običnog korisnika — kind/mode
   * su svojstva fizičkog uređaja koja postavlja admin (X-Admin-Key),
   * ne nešto što app korisnik mijenja preko JWT-a. Ostaje lokalni
   * demo override, da Pro/Hospitality/Agency ekrani ostanu upotrebljivi
   * bez potrebe za pravim hub-pairing tokom.
   */
  setMode(mode: HubMode): void {
    const kind: HubKind = mode === 'home' ? 'home' : 'pro';

    const hub: HubInfo = {
      ...this.hub(),
      kind,
      mode,
      name: kind === 'pro' ? 'Fornect Pro' : 'Fornect Home',
      capacity: kind === 'pro' ? 100 : 20,
      connectedUsers: kind === 'pro' ? 47 : 4,
    };

    this.hub.set(hub);
    this.save(hub);
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
    };

    this.hub.set(hub);
    this.save(hub);

    return hub;
  }

  syncWithCurrentAccount(): void {
    this.hub.set(this.load());
    void this.refreshFromApi();
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
    try {
      const response = await firstValueFrom(
        this.http.get<HubApiResponse>(`${API_BASE_URL}/app/hub`),
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
      };

      this.hub.set(hub);
      this.save(hub);
    } catch {
      // Nalog još nije uparen ni sa jednim fizičkim hub-om (404), ili
      // backend nije dostupan — ostaje lokalna/mock vrijednost.
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
    };

    // Podrazumijevano stanje se odmah snima da bi uređaj
    // imao zapis i prije prve promjene moda.
    this.save(fallback);

    return fallback;
  }
}
