import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  FleetService,
  type BulkResult,
  type FleetDevice,
  type OtaRing,
} from '../../core/services/fleet';
import { TranslatePipe } from '../../shared/pipes/translate';

/**
 * Fleet / OTA — Zadatak 1, Tačka 6, tačka 5.
 *
 * Ekran drži četiri od pet stavki iz Alenovog spiska: inventar verzija,
 * prsten rolloutu, kill-switch i set filter lista sa rollbackom.
 *
 * Peta, health dashboard, nije ovdje. Uređaj danas ne šalje ni stopu
 * blokiranja, ni Squid error rate, ni boot-counter — pa bi taj dio
 * ekrana crtao nule. Panel koji pokaže izmišljen broj je gori od panela
 * koji tu brojku nema: na osnovu izmišljenog broja neko donese odluku.
 * Umjesto toga, ekran na tom mjestu piše šta čekamo od uređaja.
 *
 * Isto važi i za verzije: dok ih uređaj ne prijavi, piše „uređaj ne
 * prijavljuje verzije", a ne prazna tabela koja izgleda kao da je sve
 * u redu.
 */
@Component({
  selector: 'app-fleet',
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './fleet.html',
  styleUrl: './fleet.scss',
})
export class Fleet {
  private readonly fleetService = inject(FleetService);

  readonly devices = this.fleetService.devices;

  readonly rings: OtaRing[] = ['bench', 'early', 'half', 'all'];

  readonly busy = signal(false);
  readonly saved = signal(false);

  // Dvije vrste greške, pa dva signala. `errorKey` je naša poruka i
  // prevodi se; `errorText` je ono što je server rekao i prikazuje se
  // doslovno. Da idu kroz isti signal, sablon ne bi znao šta od toga
  // smije provući kroz prevod — pa bi se korisniku prikazao ključ.
  readonly errorKey = signal('');
  readonly errorText = signal('');

  /** Parametri za prevod greške (npr. koje liste su odbijene). */
  readonly errorParams = signal<Record<string, string>>({});

  /** URL-ovi koje server prijavljuje kao direktan izvor (rate-limit rizik). */
  readonly warnings = signal<string[]>([]);

  /** Uređaj čiji je editor lista otvoren; null = nijedan. */
  readonly editing = signal<string | null>(null);

  readonly draftUrls = signal('');
  readonly draftLabel = signal('');

  // --- Grupne komande (Tačka 6: „po uređaju / grupi") ---

  /** Grupa: prazno = cijeli nalog, inače jedan prsten. */
  readonly groupRing = signal<OtaRing | ''>('');

  /** Ključ seta koji se grupno poništava. */
  readonly groupSetKey = signal('');

  /** Ishod posljednje grupne komande, uređaj po uređaj. */
  readonly groupResults = signal<BulkResult[] | null>(null);

  /**
   * Grupne komande imaju smisla tek sa više uređaja. Home nalog sa
   * jednim hub-om ih ne vidi — isto bi radile kao dugmad na kartici,
   * samo bi ekran bio duži.
   */
  readonly showGroup = computed(() => (this.devices()?.length ?? 0) > 1);

  /**
   * Različiti setovi lista koji su TRENUTNO aktivni na nekom uređaju.
   *
   * Grupni rollback poništava jedan od njih. Nudi se samo ono što je
   * negdje aktivno: set koji nije nigdje aktivan nema šta poništiti, a
   * lista svih setova iz historije bi natjerala čovjeka da u incidentu
   * pogađa koji je loš.
   */
  readonly activeSets = computed(() => {
    const sets = new Map<string, { key: string; label: string | null; urls: string[]; hubs: number }>();

    for (const device of this.devices() ?? []) {
      const list = device.activeList;

      if (!list || list.urls.length === 0) {
        continue;
      }

      const key = setKey(list.urls);
      const entry = sets.get(key) ?? { key, label: list.label, urls: list.urls, hubs: 0 };

      entry.hubs += 1;
      sets.set(key, entry);
    }

    return [...sets.values()];
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      await this.fleetService.reload();
    } catch {
      this.errorKey.set('fleet.loadFailed');
    }
  }

  versionEntries(device: FleetDevice): { name: string; version: string }[] {
    const versions = device.reportedVersions;

    if (!versions) {
      return [];
    }

    return Object.keys(versions)
      .sort()
      .map((name) => ({ name, version: String(versions[name]) }));
  }

  /**
   * Uređaj je potvrdio posljednju konfiguraciju koju mu je cloud
   * upisao. Dok nije, postavke su snimljene ali još nisu stigle — a to
   * je razlika koju vlasnik mora vidjeti prije nego zaključi da OTA ne
   * radi.
   */
  configDelivered(device: FleetDevice): boolean {
    return (
      device.configVersion !== null &&
      device.ackedVersion !== null &&
      device.ackedVersion >= device.configVersion
    );
  }

  /**
   * Treće stanje, koje se lako previdi: cloud za ovaj hub još nije
   * upisao nijednu konfiguraciju. Nije ni „stiglo" ni „čeka" — nema
   * šta da stigne. Bez ovoga bi ekran pisao „verzija null".
   */
  hasConfig(device: FleetDevice): boolean {
    return device.configVersion !== null;
  }

  /** Prevod prima string ili broj, ne null. */
  configVersionLabel(device: FleetDevice): number {
    return device.configVersion ?? 0;
  }

  openLists(device: FleetDevice): void {
    this.editing.set(device.id);
    this.draftUrls.set((device.activeList?.urls ?? []).join('\n'));
    this.draftLabel.set(device.activeList?.label ?? '');
    this.warnings.set([]);
    this.errorKey.set('');
    this.errorText.set('');
  }

  cancelLists(): void {
    this.editing.set(null);
  }

  async setRing(device: FleetDevice, ring: string): Promise<void> {
    await this.run(() => this.fleetService.saveOta(device.id, { otaRing: ring as OtaRing }));
  }

  async togglePause(device: FleetDevice): Promise<void> {
    await this.run(() => this.fleetService.saveOta(device.id, { otaPaused: !device.otaPaused }));
  }

  async saveWindow(device: FleetDevice, start: string, end: string): Promise<void> {
    await this.run(() =>
      this.fleetService.saveOta(device.id, { maintenanceStart: start, maintenanceEnd: end }),
    );
  }

  async saveLists(device: FleetDevice): Promise<void> {
    const urls = this.draftUrls()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    await this.run(async () => {
      const warnings = await this.fleetService.saveLists(device.id, urls, this.draftLabel());

      this.warnings.set(warnings);
      this.editing.set(null);
    });
  }

  async rollback(device: FleetDevice): Promise<void> {
    await this.run(() => this.fleetService.rollbackLists(device.id));
  }

  async groupPause(paused: boolean): Promise<void> {
    await this.run(async () => {
      this.groupResults.set(
        await this.fleetService.bulk(paused ? 'pause' : 'resume', this.groupRing() || null),
      );
    });
  }

  async groupRollback(): Promise<void> {
    const target = this.activeSets().find((set) => set.key === this.groupSetKey());

    if (!target) {
      return;
    }

    await this.run(async () => {
      this.groupResults.set(
        await this.fleetService.bulk('rollback-lists', this.groupRing() || null, target.urls),
      );
    });
  }

  setLabel(set: { label: string | null; urls: string[] }): string {
    return set.label || set.urls[0] || '';
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.errorKey.set('');
    this.errorText.set('');
    this.errorParams.set({});
    this.saved.set(false);

    try {
      await action();

      this.saved.set(true);
    } catch (error) {
      const body = (error as { error?: { error?: string; code?: string; urls?: string[] } })
        ?.error;

      // Greška sa kodom ima svoj prevod; tekst sa servera je samo za
      // one koji čitaju odgovor bez panela, i na bosanskom je.
      if (body?.code) {
        this.errorKey.set(`fleet.error.${body.code}`);
        this.errorParams.set({ urls: (body.urls ?? []).join(', ') });
      } else if (body?.error) {
        this.errorText.set(body.error);
      } else {
        this.errorKey.set('fleet.saveFailed');
      }
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * Isti ključ kao na serveru (routes/fleet.ts): isti URL-ovi, bilo kojim
 * redom. Ovdje služi samo za izbor u listi — server provjeru radi sam.
 */
function setKey(urls: string[]): string {
  return JSON.stringify(urls.map((url) => url.trim()).sort());
}
