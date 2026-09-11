import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  RouterLink
} from '@angular/router';

import {
  DeviceService,
  PairingState
} from '../../core/services/device';

import {
  ConsentRecord,
  ConsentService,
  DeviceConsentState
} from '../../core/services/consent';

export type CertificatePlatform =
  | 'android'
  | 'ios'
  | 'desktop';

/**
 * Jedna kontrola sa tri jacine umjesto prekidaca i odvojenog
 * izbora nivoa. Certifikat nije nivo zastite nego preduslov za
 * najvisi - zato je izdvojen u vlastitu sekciju.
 */
export type ProtectionChoice = 'off' | 'standard' | 'full';

import {
  LanguageService
} from '../../core/services/language';

import {
  TranslatePipe
} from '../../shared/pipes/translate';

@Component({
  selector: 'app-protection',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './protection.html',
  styleUrl: './protection.scss'
})
export class Protection {
  private readonly route = inject(ActivatedRoute);
  private readonly deviceService = inject(DeviceService);
  private readonly consentService = inject(ConsentService);
  private readonly languageService = inject(LanguageService);

  /**
   * Aplikacija radi bez zone.js. U tom rezimu Angular sam osvjezi
   * ekran nakon klika, ali NE i kad se async poziv vrati kasnije -
   * tada promjena polja prodje nezapazeno i ekran ostane isti.
   *
   * Ostale komponente ovo nisu trebale jer mijenjaju stanje odmah u
   * obradi klika. Tok pristanka je prvi koji ceka odgovor servera,
   * pa mora sam javiti da je vrijeme za ponovno iscrtavanje.
   */
  private readonly changeDetector = inject(ChangeDetectorRef);

  deviceId =
    this.route.snapshot.paramMap.get('id') ??
    'amar-iphone';

  device =
    this.deviceService.getDevice(this.deviceId) ??
    this.deviceService.getDevice('amar-iphone')!;

  deviceName = this.device.name;

  pairingState: PairingState =
    this.device.pairingState;

  constructor() {
    void this.loadConsent();
  }

  // ---------------------------------------------------------------
  // Pristanak
  // ---------------------------------------------------------------

  /** Zapis pristanka sa servera. `null` dok se ne ucita. */
  consent: DeviceConsentState | null = null;

  consentFormOpen = false;
  consentBusy = false;
  /** Gotov tekst za prikaz, ne kljuc - dio poruka stize sa servera. */
  consentError = '';

  guardianName = '';
  guardianRelation = '';
  subjectIsMinor = false;
  policyAccepted = false;

  get activeConsent(): ConsentRecord | null {
    return this.consent?.active ?? null;
  }

  /** Pristanak koji je uredjaj i tehnicki potvrdio. */
  get consentVerified(): boolean {
    return this.activeConsent?.verifiedAt != null;
  }

  /**
   * Politika je u medjuvremenu dobila novu verziju, pa ono na sta je
   * korisnik ranije pristao vise ne odgovara onome sto danas vazi.
   */
  get needsPolicyReacceptance(): boolean {
    const active = this.activeConsent;

    if (!active || !this.consent) {
      return false;
    }

    return active.policyVersion !== this.consent.policyVersion;
  }

  get consentDateLabel(): string {
    const granted = this.activeConsent?.grantedAt;

    return granted
      ? new Date(granted).toLocaleString()
      : '';
  }

  openConsentForm(): void {
    this.consentError = '';
    this.consentFormOpen = true;

    const active = this.activeConsent;

    // Kod ponovnog prihvatanja nove verzije politike ne tjeramo
    // korisnika da ista polja unosi ponovo.
    if (active) {
      this.guardianName = active.guardianName;
      this.guardianRelation = active.guardianRelation;
      this.subjectIsMinor = active.subjectIsMinor;
    }

    this.policyAccepted = false;
  }

  cancelConsentForm(): void {
    this.consentFormOpen = false;
    this.consentError = '';
    this.policyAccepted = false;
  }

  /** Korak 1 - forma pristanka. */
  submitConsent(): void {
    this.consentError = '';

    if (
      !this.guardianName.trim() ||
      !this.guardianRelation.trim()
    ) {
      this.consentError = this.languageService.t('consent.errorFields');

      return;
    }

    // Bez ovoga zapis ne bi dokazivao da je korisnik uopste vidio
    // na sta pristaje.
    if (!this.policyAccepted) {
      this.consentError = this.languageService.t('consent.errorPolicy');

      return;
    }

    void this.runConsentAction(async () => {
      await this.consentService.grant(this.deviceId, {
        guardianName: this.guardianName.trim(),
        guardianRelation: this.guardianRelation.trim(),
        subjectIsMinor: this.subjectIsMinor,

        // Zapisujemo KOJI certifikat je stajao pred korisnikom u
        // trenutku pristanka. Ako hub kasnije promijeni CA, iz zapisa
        // se vidi da pristanak nije dat za taj novi.
        caFingerprint: this.caFingerprint
      });

      this.consentFormOpen = false;
    });
  }

  /**
   * Korak 3 - rucna potvrda instalacije.
   *
   * Ovo je Alenov fallback, ne glavni put: pravu potvrdu daje uredjaj
   * nakon uspjesnog TLS handshake-a. Zato se u zapis upisuje kao
   * `manual`, da se u reviziji vidi razlika izmedju dokazanog i
   * izjavljenog pristanka.
   */
  confirmInstallation(): void {
    void this.runConsentAction(() =>
      this.consentService.verify(this.deviceId, true, {
        manual: true
      })
    );
  }

  /** Instalacija nije uspjela - uredjaj ide u 'failed', ne na pocetak. */
  reportInstallationProblem(): void {
    void this.runConsentAction(() =>
      this.consentService.verify(this.deviceId, false, {
        error: this.languageService.t('consent.failedByUser')
      })
    );
  }

  /**
   * Povratak na korak instalacije nakon neuspjeha ili kod ponovne
   * instalacije. Pristanak se NE trazi ponovo - on i dalje vazi;
   * ponavlja se samo tehnicki dio.
   */
  retryInstallation(): void {
    this.deviceService.updateDevice(this.deviceId, {
      pairingState: 'pairing'
    });

    this.refreshDevice();
  }

  /** Korak 4 - opoziv. Uredjaj ostaje na osnovnoj zastiti. */
  revokeConsent(): void {
    void this.runConsentAction(() =>
      this.consentService.revoke(this.deviceId)
    );
  }

  private async runConsentAction(
    action: () => Promise<unknown>
  ): Promise<void> {
    this.consentBusy = true;
    this.consentError = '';

    try {
      await action();
      await this.deviceService.reload();
      await this.loadConsent();

      this.refreshDevice();
    } catch (error) {
      this.consentError = this.serverMessage(error);
    } finally {
      this.consentBusy = false;

      // Bez ovoga bi korisnik kliknuo i ne bi vidio nista - ni novo
      // stanje, ni gresku.
      this.changeDetector.markForCheck();
    }
  }

  /**
   * Backend vraca konkretan razlog u obliku { error: '...' } - npr.
   * "Za ovaj uredjaj vec postoji vazeci pristanak". Takva poruka
   * korisniku govori sta da uradi, dok mu opste "provjerite vezu"
   * ne govori nista i jos ga navodi na pogresan trag.
   *
   * Na opstu poruku padamo samo kad servera zaista nema, pa ni
   * odgovora nema.
   */
  private serverMessage(error: unknown): string {
    const body = (error as { error?: unknown } | null)?.error;

    if (body && typeof body === 'object') {
      const message = (body as { error?: unknown }).error;

      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return this.languageService.t('consent.errorServer');
  }

  private async loadConsent(): Promise<void> {
    try {
      this.consent =
        await this.consentService.getForDevice(this.deviceId);
    } catch {
      // Panel mora ostati upotrebljiv i kad backend ne odgovori -
      // sekcija pristanka se tada jednostavno ne prikaze.
      this.consent = null;
    }

    this.changeDetector.markForCheck();
  }

  // ---------------------------------------------------------------
  // Nivo zastite
  // ---------------------------------------------------------------

  get protectionEnabled(): boolean {
    return this.device.protectionEnabled !== false;
  }

  /**
   * Certifikat instaliran na uredjaju. Odvojeno od toga da li
   * se puna zastita trenutno koristi - profil moze ostati
   * instaliran dok je zastita spustena na standardnu.
   */
  get certificateInstalled(): boolean {
    return this.pairingState === 'paired';
  }

  /** Izbor roditelja. Nakon uparivanja podrazumijevano puna. */
  get useFullProtection(): boolean {
    return this.device.useFullProtection !== false;
  }

  /**
   * Stvarni nivo zastite: puna samo ako je certifikat
   * instaliran I ako je roditelj nije spustio na standardnu.
   */
  get effectiveLevel(): 'standard' | 'full' {
    return this.certificateInstalled &&
      this.useFullProtection
      ? 'full'
      : 'standard';
  }

  get protectionStatusLabel(): string {
    if (!this.protectionEnabled) {
      return this.languageService.t(
        'protection.off'
      );
    }

    return this.effectiveLevel === 'full'
      ? this.languageService.t('protection.full')
      : this.languageService.t('protection.standard');
  }

  get blockedAdsToday(): number {
    return this.device.blockedAdsToday ?? 128;
  }

  get awayFromHomeEnabled(): boolean {
    return this.device.protectAwayFromHome === true;
  }

  toggleAwayFromHome(): void {
    if (!this.protectionEnabled) {
      return;
    }

    this.deviceService.updateDevice(
      this.deviceId,
      {
        protectAwayFromHome:
          !this.awayFromHomeEnabled
      }
    );

    this.refreshDevice();
  }

  readonly levels: ProtectionChoice[] = [
    'off',
    'standard',
    'full'
  ];

  /** Trenutno stanje kao jedna od tri jacine. */
  get level(): ProtectionChoice {
    if (!this.protectionEnabled) {
      return 'off';
    }

    return this.effectiveLevel;
  }

  levelTitleKey(level: ProtectionChoice): string {
    switch (level) {
      case 'off':
        return 'protection.levelOff';
      case 'standard':
        return 'protection.standard';
      default:
        return 'protection.full';
    }
  }

  levelDescriptionKey(level: ProtectionChoice): string {
    switch (level) {
      case 'off':
        return 'protection.levelOffDescription';
      case 'standard':
        return 'protection.standardDescription';
      default:
        return 'protection.fullDescription';
    }
  }

  levelIcon(level: ProtectionChoice): string {
    switch (level) {
      case 'off':
        return 'OFF';
      case 'standard':
        return 'DNS';
      default:
        return 'FULL';
    }
  }

  /** Puna jacina je zakljucana dok profil nije instaliran. */
  isLevelLocked(level: ProtectionChoice): boolean {
    return (
      level === 'full' && !this.certificateInstalled
    );
  }

  /**
   * Izbor jacine. Puna trazi pristanak i instaliran profil, pa klik
   * na nju bez toga otvara formu pristanka umjesto da ne uradi nista.
   * Spustanje na standardnu ne dira certifikat ni pristanak - povratak
   * na punu kasnije ne trazi ponovnu instalaciju.
   */
  setLevel(level: ProtectionChoice): void {
    if (level === 'off') {
      this.deviceService.updateDevice(this.deviceId, {
        protectionEnabled: false
      });

      this.refreshDevice();

      return;
    }

    if (level === 'full' && !this.certificateInstalled) {
      this.deviceService.updateDevice(this.deviceId, {
        protectionEnabled: true,
        useFullProtection: true
      });

      this.refreshDevice();
      this.openConsentForm();

      return;
    }

    this.deviceService.updateDevice(this.deviceId, {
      protectionEnabled: true,
      useFullProtection: level === 'full',
      protectionLevel:
        level === 'full' && this.certificateInstalled
          ? 'full'
          : 'standard'
    });

    this.refreshDevice();
  }

  /**
   * Skidanje profila je sada opoziv pristanka, ne samo promjena
   * stanja - jer je pristanak ono sto pravno stoji iza presretanja.
   */
  removeCertificate(): void {
    this.revokeConsent();
  }

  // ---------------------------------------------------------------
  // Instalacija certifikata
  // ---------------------------------------------------------------

  readonly certPlatforms: CertificatePlatform[] = [
    'android',
    'ios',
    'desktop'
  ];

  certPlatform: CertificatePlatform = 'android';

  setCertPlatform(platform: CertificatePlatform): void {
    this.certPlatform = platform;
  }

  platformLabelKey(platform: CertificatePlatform): string {
    return `protection.platform${
      platform.charAt(0).toUpperCase() + platform.slice(1)
    }`;
  }

  /** Koraci instalacije za izabranu platformu. */
  get certificateSteps(): string[] {
    const prefix = `protection.${this.certPlatform}Step`;

    return [1, 2, 3, 4, 5].map(
      step => `${prefix}${step}`
    );
  }

  get platformNoteKey(): string {
    return `protection.${this.certPlatform}Note`;
  }

  /**
   * Firefox na Androidu drzi vlastitu listu certifikata, odvojenu od
   * sistemske. Instalacija u sistem mu zato ne znaci nista i korisnik
   * bi mislio da je zavrsio, a Firefox bi i dalje bio nezasticen.
   * Zadatak 1, Tacka 5, izricito trazi zaseban korak za to.
   */
  get showFirefoxNote(): boolean {
    return this.certPlatform === 'android';
  }

  /**
   * Opoziv pristanka sklanja uredjaj iz presretanja, ali certifikat
   * fizicki ostaje instaliran na telefonu. Dok je tamo, uredjaj i
   * dalje vjeruje tom CA - zato korisniku moramo reci da ga ukloni.
   *
   * Prikazuje se samo ako je pristanak stvarno postojao pa bio
   * opozvan; uredjaju koji nikad nije imao certifikat ta poruka bi
   * bila samo zbunjujuca.
   */
  get certificateStillOnDevice(): boolean {
    return (
      this.pairingState === 'guest' &&
      (this.consent?.history ?? []).some(
        record => record.revokedAt !== null
      )
    );
  }

  /**
   * Otisak certifikata koji korisnik treba uporediti prije nego mu
   * povjeri saobracaj. Dolazi sa Fornect uredjaja - dok uredjaj nije
   * povezan, otiska nema i ekran to otvoreno kaze umjesto da prikaze
   * izmisljenu vrijednost.
   */
  get caFingerprint(): string | null {
    return this.consent?.caFingerprint ?? null;
  }

  /** Preuzimanje javnog CA certifikata za instalaciju na uredjaj. */
  downloadCertificate(): void {
    void this.runConsentAction(() =>
      this.consentService.downloadCertificate(this.deviceId)
    );
  }

  private refreshDevice(): void {
    const updated =
      this.deviceService.getDevice(this.deviceId);

    if (updated) {
      this.device = updated;
      this.deviceName = updated.name;
      this.pairingState = updated.pairingState;
    }
  }
}
