import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth';
import { createDays, DeviceSchedule, normalizeSchedule } from './schedule';

export type { DayWindow, DeviceSchedule, ScheduleDay, ScheduleMode } from './schedule';

export type DeviceProfile = 'Child' | 'Teen' | 'Adult' | 'Admin' | null;
export type ProtectionLevel = 'standard' | 'full' | 'needs-setup';
/**
 * `guest` je uređaj za koji je vlasnik svjesno izabrao samo osnovnu
 * zaštitu, ili kojem je pristanak opozvan. Razlikuje se od `unpaired`,
 * koji znači "još niko nije odlučio" — uređaj u tom stanju na mreži
 * dobija poziv kroz captive portal, a gost ne dobija ništa.
 */
export type PairingState =
  | 'unpaired'
  | 'guest'
  | 'pairing'
  | 'paired'
  | 'failed';

export interface DeviceRestrictions {
  blockAdultContent: boolean;
  blockSocialMedia: boolean;
  blockGaming: boolean;
  blockStreaming: boolean;
  blockAdsTrackers: boolean;
  safeSearch: boolean;
  youtubeRestricted: boolean;
}

export const restrictionKeys: (keyof DeviceRestrictions)[] = [
  'blockAdultContent',
  'blockSocialMedia',
  'blockGaming',
  'blockStreaming',
  'blockAdsTrackers',
  'safeSearch',
  'youtubeRestricted',
];

export interface FornectNetworkDevice {
  id: string;
  accountId: string;
  macAddress: string;
  name: string;
  type: 'phone' | 'tv' | 'console' | 'unknown';
  profile: DeviceProfile;
  protectionLevel: ProtectionLevel;
  protectionEnabled?: boolean;
  protectAwayFromHome?: boolean;
  pairingState: PairingState;
  /**
   * Da li se koristi puna zaštita. Odvojeno od pairingState:
   * certifikat može ostati instaliran dok je zaštita spuštena
   * na standardnu, pa povratak na punu ne traži novu instalaciju.
   */
  useFullProtection?: boolean;
  online: boolean;
  blockedAdsToday?: number;
  overrideUntil?: number | null;
  restrictions?: DeviceRestrictions;
  alertWhenOffline?: boolean;
  schedule: DeviceSchedule;
  /**
   * Kad je uređaj prvi put zaveden. Do trenutka kad hub bude
   * prijavljivao stvarno vrijeme pojavljivanja na mreži, ovo je
   * najbliže tome što imamo — koristi ga red "Novi uređaji".
   */
  createdAt?: string;
  /**
   * Da li je uređaj izvan onoga što licenca hub-a pokriva. Računa ga
   * server pri čitanju liste, po redoslijedu pojavljivanja — panel ga
   * samo prikazuje. Nalog bez uparenog hub-a nema licencu, pa nema ni
   * prekoračenja.
   */
  overCapacity?: boolean;
  /** Koje je po redu mjesto uređaj zauzeo (1 = prvi zavedeni). */
  licenceSlot?: number;
}

interface NetworkDeviceApiRow {
  id: string;
  account_id: string;
  mac_address: string;
  name: string;
  type: FornectNetworkDevice['type'];
  profile: DeviceProfile;
  protection_level: ProtectionLevel;
  pairing_state: PairingState;
  use_full_protection: boolean;
  online: boolean;
  blocked_ads_today: number;
  override_until: string | null;
  restrictions: DeviceRestrictions | null;
  alert_when_offline: boolean | null;
  schedule: DeviceSchedule | null;
  created_at: string;
  over_capacity?: boolean;
  licence_slot?: number;
}

// Polja koja backend ne poznaje uopšte (nema ih u network_devices
// šemi) — ostaju samo lokalno, po uređaju, umjesto da se šalju u
// PATCH tijelu.
const LOCAL_ONLY_FIELDS: (keyof FornectNetworkDevice)[] = [
  'protectionEnabled',
  'protectAwayFromHome',
];

@Injectable({
  providedIn: 'root',
})
export class DeviceService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly defaultSelectedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  private makeSchedule(
    enabled: boolean,
    startHour: string,
    startMinute: string,
    endHour: string,
    endMinute: string,
  ): DeviceSchedule {
    return {
      enabled,
      mode: 'sameEveryDay',
      startHour,
      startMinute,
      endHour,
      endMinute,
      days: createDays(this.defaultSelectedDays, startHour, startMinute, endHour, endMinute),
    };
  }

  private readonly defaultSchedule = this.makeSchedule(false, '21', '00', '07', '00');

  // Prazno dok se ne učita sa backend-a — nema više statičkog demo
  // seed niza (POC "test@fornect.com" naloga više nema, auth ide
  // isključivo preko pravog API-ja).
  private readonly allDevices = signal<FornectNetworkDevice[]>([]);

  readonly devices = computed(() => {
    const accountId = this.authService.currentUser()?.accountId;

    if (!accountId) {
      return [];
    }

    return this.allDevices().filter((device) => device.accountId === accountId);
  });

  // Prati u toku li je (ili je bio) inicijalni load — koristi ga
  // ensureLoaded() (route resolver) da sačeka da se завrši prije
  // nego se komponenta za konkretan uređaj konstruiše. Bez ovoga,
  // svjež (puni) page load direktno na /devices/:id zna pokušati
  // pročitati uređaj PRIJE nego što API odgovor stigne.
  private loadPromise: Promise<void> = Promise.resolve();

  constructor() {
    if (this.authService.isAuthenticated()) {
      this.loadPromise = this.loadFromApi();
    }
  }

  /**
   * Poziva se nakon logina (kao i hubService.syncWithCurrentAccount())
   * da učita network_devices trenutnog naloga sa backend-a.
   */
  syncWithCurrentAccount(): void {
    this.loadPromise = this.loadFromApi();
  }

  /**
   * Sačeka da se trenutni (ili prethodni) load uređaja završi.
   * Koristi ga route resolver za rute koje pretpostavljaju da je
   * konkretan uređaj već učitan u trenutku konstrukcije komponente
   * (device-details, schedule, protection, device-setup).
   */
  ensureLoaded(): Promise<void> {
    return this.loadPromise;
  }

  /**
   * Uređaji koje niko još nije klasifikovao — ni kao goste, ni kao
   * uparene. To je red "Novi uređaji" iz Zadatka 1, Tačke 5: mjesto
   * na kojem vlasnik primijeti uređaj koji ne prepoznaje.
   *
   * `unpaired` ovdje znači "niko još nije odlučio". Uređaj kojem je
   * vlasnik svjesno izabrao osnovnu zaštitu je `guest` i više se ne
   * pojavljuje kao pitanje.
   */
  readonly unclassifiedDevices = computed(() =>
    this.devices().filter((device) => device.pairingState === 'unpaired'),
  );

  /**
   * Uređaji koje licenca hub-a više ne pokriva.
   *
   * Do sada je panel granicu računao sam, iz zakucane vrijednosti koja
   * je postojala i kad nalog nema nijedan hub — dakle izmišljao je
   * limit. Sada je izvor istine hub: nema hub-a, nema ni limita.
   */
  readonly overCapacityDevices = computed(() =>
    this.devices().filter((device) => device.overCapacity === true),
  );

  /**
   * Svrstavanje među goste: osnovna (DNS) zaštita, bez presretanja.
   *
   * Puna zaštita se odavde NE može dodijeliti — ona traži izričit
   * pristanak, pa ide kroz ekran zaštite tog uređaja.
   */
  markAsGuest(id: string): void {
    this.updateDevice(id, {
      pairingState: 'guest',
      useFullProtection: false,
      protectionLevel: 'standard',
    });
  }

  /**
   * Ponovo učitava uređaje sa servera i vraća promise, za razliku od
   * syncWithCurrentAccount() koji ga guta. Potrebno nakon radnji koje
   * stanje uređaja mijenjaju NA SERVERU — npr. tok pristanka, gdje
   * backend sam prebacuje pairing_state — jer lokalna kopija tada
   * ostaje zastarjela i ekran bi prikazao staro stanje.
   */
  reload(): Promise<void> {
    return this.loadFromApi();
  }

  discoverDemoDevicesForCurrentAccount(): void {
    const accountId = this.authService.currentUser()?.accountId;

    if (!accountId) {
      return;
    }

    void this.discoverViaApi();
  }

  setTemporaryOverride(id: string, minutes: number): void {
    const overrideUntil = Date.now() + minutes * 60 * 1000;

    this.updateDevice(id, {
      overrideUntil,
    });
  }

  clearOverride(id: string): void {
    this.updateDevice(id, {
      overrideUntil: null,
    });
  }

  updateSchedule(id: string, schedule: DeviceSchedule): void {
    this.updateDevice(id, { schedule });
  }

  /**
   * Podrazumijevano pratimo nestanak sa mreže samo za dječije i
   * tinejdžerske uređaje. Za TV ili roditeljski telefon to bi
   * bila samo buka, jer se oni gase svaki dan bez razloga za
   * uzbunu. Roditelj podešavanje može promijeniti po uređaju.
   */
  offlineAlertEnabled(device: FornectNetworkDevice): boolean {
    if (device.alertWhenOffline !== undefined) {
      return device.alertWhenOffline;
    }

    return device.profile === 'Child' || device.profile === 'Teen';
  }

  setOfflineAlert(id: string, enabled: boolean): void {
    this.updateDevice(id, {
      alertWhenOffline: enabled,
    });
  }

  getDefaultRestrictions(profile: DeviceProfile): DeviceRestrictions {
    switch (profile) {
      case 'Admin':
        return {
          blockAdultContent: false,
          blockSocialMedia: false,
          blockGaming: false,
          blockStreaming: false,
          blockAdsTrackers: false,
          safeSearch: false,
          youtubeRestricted: false,
        };

      case 'Adult':
        return {
          blockAdultContent: false,
          blockSocialMedia: false,
          blockGaming: false,
          blockStreaming: false,
          blockAdsTrackers: true,
          safeSearch: false,
          youtubeRestricted: false,
        };

      case 'Teen':
        return {
          blockAdultContent: true,
          blockSocialMedia: false,
          blockGaming: false,
          blockStreaming: false,
          blockAdsTrackers: true,
          safeSearch: true,
          youtubeRestricted: false,
        };

      // Child i jos nedodijeljeni uredaji dobijaju
      // najstroziji preset kao sigurnu polaznu tacku.
      default:
        return {
          blockAdultContent: true,
          blockSocialMedia: true,
          blockGaming: false,
          blockStreaming: false,
          blockAdsTrackers: true,
          safeSearch: true,
          youtubeRestricted: true,
        };
    }
  }

  getRestrictions(id: string): DeviceRestrictions {
    const device = this.getDevice(id);

    if (!device) {
      return this.getDefaultRestrictions(null);
    }

    return device.restrictions ?? this.getDefaultRestrictions(device.profile);
  }

  usesProfileDefaults(id: string): boolean {
    const device = this.getDevice(id);

    if (!device) {
      return true;
    }

    const defaults = this.getDefaultRestrictions(device.profile);

    const current = this.getRestrictions(id);

    return restrictionKeys.every((key) => current[key] === defaults[key]);
  }

  setRestriction(id: string, key: keyof DeviceRestrictions, value: boolean): void {
    const current = this.getRestrictions(id);

    this.updateDevice(id, {
      restrictions: {
        ...current,
        [key]: value,
      },
    });
  }

  resetRestrictions(id: string): void {
    const device = this.getDevice(id);

    if (!device) {
      return;
    }

    this.updateDevice(id, {
      restrictions: this.getDefaultRestrictions(device.profile),
    });
  }

  getDevice(id: string): FornectNetworkDevice | undefined {
    const accountId = this.authService.currentUser()?.accountId;

    if (!accountId) {
      return undefined;
    }

    return this.allDevices().find((device) => device.id === id && device.accountId === accountId);
  }

  updateDevice(id: string, changes: Partial<FornectNetworkDevice>): void {
    const accountId = this.authService.currentUser()?.accountId;

    if (!accountId) {
      return;
    }

    const device = this.allDevices().find((item) => item.id === id && item.accountId === accountId);

    if (!device) {
      return;
    }

    // Promjena profila povlaci novi preset
    // ogranicenja, osim ako pozivalac salje svoja.
    const appliedChanges: Partial<FornectNetworkDevice> =
      changes.profile !== undefined && changes.restrictions === undefined
        ? {
            ...changes,
            restrictions: this.getDefaultRestrictions(changes.profile),
          }
        : changes;

    // Optimistički lokalni update — UI reaguje odmah, ne čeka HTTP.
    this.allDevices.update((devices) =>
      devices.map((item) =>
        item.id === id && item.accountId === accountId ? { ...item, ...appliedChanges } : item,
      ),
    );

    this.persistLocalOnlyFields(id, appliedChanges);
    void this.pushUpdateToApi(id, appliedChanges);
  }

  private async loadFromApi(): Promise<void> {
    try {
      const rows = await firstValueFrom(
        this.http.get<NetworkDeviceApiRow[]>(`${API_BASE_URL}/app/network-devices`),
      );

      this.allDevices.set(rows.map((row) => this.fromApiRow(row)));
    } catch (error) {
      console.warn('Fornect: učitavanje network-devices nije uspjelo', error);
    }
  }

  private async discoverViaApi(): Promise<void> {
    try {
      const existing = await firstValueFrom(
        this.http.get<NetworkDeviceApiRow[]>(`${API_BASE_URL}/app/network-devices`),
      );

      // Ne dodaj ponovo uređaje ako su već otkriveni.
      if (existing.length > 0) {
        this.allDevices.set(existing.map((row) => this.fromApiRow(row)));
        return;
      }

      const demoDevices: Array<Pick<NetworkDeviceApiRow, 'mac_address' | 'name' | 'type'>> = [
        { mac_address: '02:00:00:00:00:01', name: 'iPhone', type: 'phone' },
        { mac_address: '02:00:00:00:00:02', name: 'Living Room TV', type: 'tv' },
        { mac_address: '02:00:00:00:00:03', name: 'Game Console', type: 'console' },
        { mac_address: '02:00:00:00:00:04', name: 'New device', type: 'unknown' },
      ];

      const created = await Promise.all(
        demoDevices.map((demoDevice) =>
          firstValueFrom(
            this.http.post<NetworkDeviceApiRow>(`${API_BASE_URL}/app/network-devices`, demoDevice),
          ),
        ),
      );

      this.allDevices.set(created.map((row) => this.fromApiRow(row)));
    } catch (error) {
      console.warn('Fornect: otkrivanje demo uređaja nije uspjelo', error);
    }
  }

  private async pushUpdateToApi(id: string, changes: Partial<FornectNetworkDevice>): Promise<void> {
    const payload = this.toApiPayload(changes);

    if (Object.keys(payload).length === 0) {
      return;
    }

    try {
      await firstValueFrom(
        this.http.patch<NetworkDeviceApiRow>(`${API_BASE_URL}/app/network-devices/${id}`, payload),
      );
    } catch (error) {
      console.warn(`Fornect: PATCH network-devices/${id} nije uspio`, error);
    }
  }

  private toApiPayload(changes: Partial<FornectNetworkDevice>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (changes.name !== undefined) {
      payload['name'] = changes.name;
    }

    if (changes.type !== undefined) {
      payload['type'] = changes.type;
    }

    if (changes.profile !== undefined) {
      payload['profile'] = changes.profile;
    }

    if (changes.protectionLevel !== undefined) {
      payload['protection_level'] = changes.protectionLevel;
    }

    if (changes.pairingState !== undefined) {
      payload['pairing_state'] = changes.pairingState;
    }

    if (changes.useFullProtection !== undefined) {
      payload['use_full_protection'] = changes.useFullProtection;
    }

    if (changes.online !== undefined) {
      payload['online'] = changes.online;
    }

    if (changes.blockedAdsToday !== undefined) {
      payload['blocked_ads_today'] = changes.blockedAdsToday;
    }

    if (changes.overrideUntil !== undefined) {
      payload['override_until'] =
        changes.overrideUntil === null ? null : new Date(changes.overrideUntil).toISOString();
    }

    if (changes.restrictions !== undefined) {
      payload['restrictions'] = changes.restrictions;
    }

    if (changes.alertWhenOffline !== undefined) {
      payload['alert_when_offline'] = changes.alertWhenOffline;
    }

    if (changes.schedule !== undefined) {
      payload['schedule'] = changes.schedule;
    }

    return payload;
  }

  private fromApiRow(row: NetworkDeviceApiRow): FornectNetworkDevice {
    return {
      id: row.id,
      accountId: row.account_id,
      macAddress: row.mac_address,
      name: row.name,
      type: row.type,
      profile: row.profile,
      protectionLevel: row.protection_level,
      pairingState: row.pairing_state,
      useFullProtection: row.use_full_protection,
      online: row.online,
      blockedAdsToday: row.blocked_ads_today,
      overrideUntil: row.override_until ? new Date(row.override_until).getTime() : null,
      restrictions: row.restrictions ?? undefined,
      alertWhenOffline: row.alert_when_offline ?? undefined,
      schedule: normalizeSchedule(row.schedule) ?? this.defaultSchedule,
      createdAt: row.created_at,
      overCapacity: row.over_capacity === true,
      licenceSlot: row.licence_slot,
      ...this.loadLocalOnlyFields(row.id),
    };
  }

  // protectionEnabled/protectAwayFromHome nemaju kolonu na backend-u
  // — čuvaju se samo lokalno, po uređaju, i preklapaju preko podataka
  // učitanih sa API-ja.
  private persistLocalOnlyFields(id: string, changes: Partial<FornectNetworkDevice>): void {
    const localChanges: Partial<FornectNetworkDevice> = {};

    for (const key of LOCAL_ONLY_FIELDS) {
      if (changes[key] !== undefined) {
        (localChanges as Record<string, unknown>)[key] = changes[key];
      }
    }

    if (Object.keys(localChanges).length === 0) {
      return;
    }

    const storageKey = `fornect-device-local-${id}`;

    let saved: Partial<FornectNetworkDevice> = {};

    const existing = localStorage.getItem(storageKey);

    if (existing) {
      try {
        saved = JSON.parse(existing);
      } catch {
        saved = {};
      }
    }

    localStorage.setItem(storageKey, JSON.stringify({ ...saved, ...localChanges }));
  }

  private loadLocalOnlyFields(id: string): Partial<FornectNetworkDevice> {
    const saved = localStorage.getItem(`fornect-device-local-${id}`);

    if (!saved) {
      return {};
    }

    try {
      return JSON.parse(saved) as Partial<FornectNetworkDevice>;
    } catch {
      return {};
    }
  }
}
