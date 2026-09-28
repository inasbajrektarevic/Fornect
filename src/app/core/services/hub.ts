import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth';
import { ConnectionService } from './connection';

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
  /** Verzije komponenti koje je uređaj sam prijavio (fornectd, Pi-hole...). */
  reportedVersions?: Record<string, string> | null;
}

export interface LoadPoint {
  label: string;
  value: number;
}

function toVersionMap(value: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string' && v.trim()) {
      out[key] = v.trim();
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Verzija softvera za prikaz: samo ono što je uređaj sam prijavio
 * (fornectd). Server polje za verziju nema, pa bez prijave ostaje
 * prazno — ekran tada piše da je uređaj ne prijavljuje.
 */
function reportedSoftwareVersion(versions: Record<string, string> | null | undefined): string {
  return versions?.['fornectd'] ?? '';
}

interface HubApiResponse {
  id: string;
  name: string;
  kind: HubKind;
  mode: HubMode;
  capacity: number | null;
  online: boolean;
  connected_devices: number;
  /** Verzije koje agent (fornectd) šalje u heartbeat-u; null dok ih ne pošalje. */
  reported_versions?: Record<string, unknown> | null;
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
  // Stanje veze dolazi odavde, iz stvarnog odgovora GET /app/hub.
  // ConnectionService zavisi samo od AuthService-a, pa kružne
  // zavisnosti nema; "Pokušaj ponovo" se vraća ovamo preko
  // registerRefresh, ne preko inject-a.
  private readonly connectionService = inject(ConnectionService);

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
    this.connectionService.registerRefresh(() => this.refresh());

    if (this.authService.isAuthenticated()) {
      this.loaded = this.refreshFromApi();
    }
  }

  /** Ponovo pita server za stanje huba (npr. "Pokušaj ponovo"). */
  refresh(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      return Promise.resolve();
    }

    this.loaded = this.refreshFromApi();

    return this.loaded;
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

    const reportedVersions = toVersionMap(response.reported_versions);

    const hub: HubInfo = {
      ...this.hub(),
      name: response.name,
      serialNumber: response.id,
      kind: response.kind,
      mode: response.mode,
      softwareVersion: reportedSoftwareVersion(reportedVersions),
      online: response.online,
      capacity: response.capacity ?? 0,
      connectedUsers: response.connected_devices,
      reportedVersions,
      paired: true,
    };

    this.hub.set(hub);
    this.save(hub);
    this.connectionService.setStatus(response.online ? 'online' : 'offline');

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

  /**
   * Opterećenje mreže kroz vrijeme (Pro pregled).
   *
   * Ranije su ovdje stajali zakucani brojevi za dan, sedmicu i mjesec,
   * pa je svaki Pro nalog vidio isti izmišljeni grafikon. Uređaj takvu
   * istoriju još ne šalje, a server je ne čuva — zato je niz prazan i
   * ekran piše da podataka nema. Kad backend dobije endpoint, ovdje se
   * poziva on.
   */
  getLoad(_period: LoadPeriod): LoadPoint[] {
    return [];
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

      const reportedVersions = toVersionMap(response.reported_versions);

      const hub: HubInfo = {
        ...this.hub(),
        name: response.name,
        serialNumber: response.id,
        kind: response.kind,
        mode: response.mode,
        softwareVersion: reportedSoftwareVersion(reportedVersions),
        online: response.online,
        capacity: response.capacity ?? 0,
        connectedUsers: response.connected_devices,
        reportedVersions,
        paired: true,
      };

      this.hub.set(hub);
      this.save(hub);

      // Server je odgovorio, pa je ovo stvarno stanje uređaja: online
      // samo ako hub šalje heartbeat, inače offline.
      this.connectionService.setStatus(response.online ? 'online' : 'offline');
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }

      const status = (error as { status?: number } | null)?.status;

      // 404: nalog nema uparen hub, pa je Home. Lokalni zapis se
      // briše, jer je mogao ostati Pro iz ranijeg POC prekidača moda u
      // Postavkama — i taj bi nalog inače i dalje vidio Pro panel.
      if (status === 404) {
        const accountId = this.authService.currentUser()?.accountId ?? 'anonymous';

        localStorage.removeItem(this.storageKey(accountId));
        this.hub.set(this.load());

        // Nema uparenog uređaja, pa nema ni veze sa njim. Nije greška.
        this.connectionService.setStatus('offline');
        return;
      }

      // Server nedostupan ili greška: ostaje ono što je zapamćeno od
      // prošlog puta, a traka na ekranu kaže da podaci nisu svježi.
      this.connectionService.setStatus('error');
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

        // Samo zapis stvarno uparenog huba vrijedi čuvati. Neupareni
        // zapis je bila podrazumijevana vrijednost — u starijim
        // verzijama sa izmišljenim serijskim brojem, verzijom i
        // "online" stanjem — pa se zamjenjuje neutralnom.
        if (hub.mode && hub.paired === true) {
          return {
            ...hub,
            softwareVersion: reportedSoftwareVersion(hub.reportedVersions),
          };
        }
      } catch {
        localStorage.removeItem(this.storageKey(accountId));
      }
    }

    // Nalog bez uparenog huba: nema serijskog broja, verzije, veze ni
    // kapaciteta. Ranije su ovdje stajali "FH-POC-001", "0.1.0",
    // online, 20 mjesta i 4 korisnika — izmišljeni podaci koje je
    // ekran prikazivao kao stanje uređaja.
    const fallback: HubInfo = {
      name: 'Fornect Home',
      serialNumber: '',
      kind: 'home',
      mode: 'home',
      softwareVersion: '',
      online: false,
      capacity: 0,
      connectedUsers: 0,
      paired: false,
    };

    // Podrazumijevano stanje se odmah snima da bi uređaj
    // imao zapis i prije prve promjene moda.
    this.save(fallback);

    return fallback;
  }
}
