import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';

export type OtaRing = 'bench' | 'early' | 'half' | 'all';

export interface FilterListSet {
  id: string;
  label: string | null;
  urls: string[];
  source: 'default' | 'panel' | 'rollback';
  createdAt: string;
}

export interface FleetDevice {
  id: string;
  name: string;
  online: boolean;
  otaRing: OtaRing;
  otaPaused: boolean;
  maintenanceStart: string;
  maintenanceEnd: string;

  /** null dok uređaj ne pošalje `versions` u heartbeat-u. */
  reportedVersions: Record<string, string> | null;
  reportedVersionsAt: string | null;

  activeList: FilterListSet | null;
  canRollback: boolean;

  /** Verzija configa koju je cloud upisao, i ona koju je uređaj potvrdio. */
  configVersion: number | null;
  ackedVersion: number | null;
}

interface FleetApiRow {
  id: string;
  name: string;
  online: boolean;
  ota_ring: OtaRing;
  ota_paused: boolean;
  maintenance_start: string;
  maintenance_end: string;
  reported_versions: Record<string, string> | null;
  reported_versions_at: string | null;
  active_list: {
    id: string;
    label: string | null;
    urls: string[];
    source: 'default' | 'panel' | 'rollback';
    created_at: string;
  } | null;
  can_rollback: boolean;
  config_version: number | null;
  acked_version?: number | null;
}

/**
 * Fleet / OTA — Zadatak 1, Tačka 6, tačka 5.
 *
 * Servis drži samo ono što cloud zna. Namjerno NEMA metode za
 * zdravstvene metrike (stopa blokiranja, Squid error rate,
 * boot-counter): uređaj ih ne šalje, pa bi metoda koja ih „dohvata"
 * vraćala nule koje ekran ne bi umio razlikovati od stvarnih nula.
 */
@Injectable({
  providedIn: 'root',
})
export class FleetService {
  private readonly http = inject(HttpClient);

  private readonly hubs = signal<FleetDevice[] | null>(null);

  readonly devices = this.hubs.asReadonly();

  async reload(): Promise<void> {
    const rows = await firstValueFrom(this.http.get<FleetApiRow[]>(`${API_BASE_URL}/app/fleet`));

    this.hubs.set(rows.map(fromApiRow));
  }

  async saveOta(
    deviceId: string,
    changes: {
      otaRing?: OtaRing;
      otaPaused?: boolean;
      maintenanceStart?: string;
      maintenanceEnd?: string;
    },
  ): Promise<void> {
    const row = await firstValueFrom(
      this.http.put<FleetApiRow>(`${API_BASE_URL}/app/fleet/${deviceId}/ota`, {
        ota_ring: changes.otaRing,
        ota_paused: changes.otaPaused,
        maintenance_start: changes.maintenanceStart,
        maintenance_end: changes.maintenanceEnd,
      }),
    );

    this.replace(deviceId, row);
  }

  /** Vraća URL-ove za koje server javlja da se povlače sa direktnog izvora. */
  async saveLists(deviceId: string, urls: string[], label: string): Promise<string[]> {
    const row = await firstValueFrom(
      this.http.put<FleetApiRow & { direct_source_warnings?: string[] }>(
        `${API_BASE_URL}/app/fleet/${deviceId}/lists`,
        { urls, label },
      ),
    );

    this.replace(deviceId, row);

    return row.direct_source_warnings ?? [];
  }

  async rollbackLists(deviceId: string): Promise<void> {
    const row = await firstValueFrom(
      this.http.post<FleetApiRow>(`${API_BASE_URL}/app/fleet/${deviceId}/lists/rollback`, {}),
    );

    this.replace(deviceId, row);
  }

  /**
   * Odgovor pojedinačne izmjene ne nosi sva polja liste (npr. `online`),
   * pa se spaja sa postojećim redom umjesto da ga zamijeni. Inače bi
   * uređaj poslije snimanja postavki ispao „offline" bez razloga.
   */
  private replace(deviceId: string, row: Partial<FleetApiRow>): void {
    const current = this.hubs();

    if (!current) {
      return;
    }

    // Polja kojih u odgovoru NEMA moraju ostati kakva jesu. Obično
    // `{ ...staro, ...novo }` ovdje ne valja: `fromApiRow` za polje koje
    // nije stiglo vrati `undefined`, pa bi spajanje upisalo `undefined`
    // preko dobre vrijednosti i uređaj bi poslije snimanja ispao
    // offline bez razloga.
    const incoming = fromApiRow(row as FleetApiRow);

    // `null` se zadržava — za activeList i reportedVersions null je
    // podatak („nema seta lista", „uređaj ne prijavljuje verzije"), a ne
    // izostanak podatka.
    const defined = Object.fromEntries(
      Object.entries(incoming).filter(([, value]) => value !== undefined),
    ) as Partial<FleetDevice>;

    this.hubs.set(
      current.map((device) => (device.id === deviceId ? { ...device, ...defined } : device)),
    );
  }
}

function fromApiRow(row: FleetApiRow): FleetDevice {
  return {
    id: row.id,
    name: row.name,
    online: row.online,
    otaRing: row.ota_ring,
    otaPaused: row.ota_paused,
    maintenanceStart: row.maintenance_start,
    maintenanceEnd: row.maintenance_end,
    reportedVersions: row.reported_versions,
    reportedVersionsAt: row.reported_versions_at,
    activeList: row.active_list
      ? {
          id: row.active_list.id,
          label: row.active_list.label,
          urls: row.active_list.urls,
          source: row.active_list.source,
          createdAt: row.active_list.created_at,
        }
      : null,
    canRollback: row.can_rollback,
    configVersion: row.config_version ?? null,
    ackedVersion: row.acked_version ?? null,
  };
}
