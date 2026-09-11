import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';

/**
 * Zapis pristanka na presretanje saobraćaja (puna zaštita).
 *
 * Nije stanje uređaja nego dokument: ko je pristao, kada, na koju
 * verziju politike i kojim putem. Zato se čita sa servera i nikad ne
 * drži samo u browseru — zapis mora postojati i kad korisnik obriše
 * podatke pregledača ili se prijavi sa drugog uređaja.
 */
export interface ConsentRecord {
  id: string;
  networkDeviceId: string | null;
  macAddress: string;
  deviceName: string;
  guardianName: string;
  guardianRelation: string;
  subjectIsMinor: boolean;
  policyVersion: string;
  method: 'portal' | 'panel' | 'auto' | 'manual';
  caFingerprint: string | null;
  grantedAt: string;
  /** Popunjeno tek kad je certifikat tehnički potvrđen na uređaju. */
  verifiedAt: string | null;
  verificationFailedAt: string | null;
  verificationError: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface ConsentGrantInput {
  guardianName: string;
  guardianRelation: string;
  subjectIsMinor: boolean;
  caFingerprint?: string | null;
}

export interface DeviceConsentState {
  active: ConsentRecord | null;
  history: ConsentRecord[];
  policyVersion: string;
  /**
   * Otisak CA certifikata hub-a sa kojim je uređaj uparen. `null` dok
   * hub nije prijavio svoj certifikat — tada panel to otvoreno kaže
   * umjesto da prikaže izmišljenu vrijednost.
   */
  caFingerprint: string | null;
}

interface ConsentApiRow {
  id: string;
  network_device_id: string | null;
  mac_address: string;
  device_name: string;
  guardian_name: string;
  guardian_relation: string;
  subject_is_minor: boolean;
  policy_version: string;
  method: ConsentRecord['method'];
  ca_fingerprint: string | null;
  granted_at: string;
  verified_at: string | null;
  verification_failed_at: string | null;
  verification_error: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

interface DeviceConsentApiResponse {
  active: ConsentApiRow | null;
  history: ConsentApiRow[];
  policy_version: string;
  ca_fingerprint: string | null;
}

function toRecord(row: ConsentApiRow): ConsentRecord {
  return {
    id: row.id,
    networkDeviceId: row.network_device_id,
    macAddress: row.mac_address,
    deviceName: row.device_name,
    guardianName: row.guardian_name,
    guardianRelation: row.guardian_relation,
    subjectIsMinor: row.subject_is_minor,
    policyVersion: row.policy_version,
    method: row.method,
    caFingerprint: row.ca_fingerprint,
    grantedAt: row.granted_at,
    verifiedAt: row.verified_at,
    verificationFailedAt: row.verification_failed_at,
    verificationError: row.verification_error,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
  };
}

@Injectable({
  providedIn: 'root'
})
export class ConsentService {
  private readonly http = inject(HttpClient);

  private deviceBase(deviceId: string): string {
    return `${API_BASE_URL}/app/network-devices/${deviceId}`;
  }

  private base(deviceId: string): string {
    return `${this.deviceBase(deviceId)}/consent`;
  }

  /** Aktivan pristanak za uređaj + njegova istorija. */
  async getForDevice(deviceId: string): Promise<DeviceConsentState> {
    const response = await firstValueFrom(
      this.http.get<DeviceConsentApiResponse>(this.base(deviceId))
    );

    return {
      active: response.active ? toRecord(response.active) : null,
      history: (response.history ?? []).map(toRecord),
      policyVersion: response.policy_version,
      caFingerprint: response.ca_fingerprint ?? null,
    };
  }

  /**
   * Preuzimanje javnog CA certifikata hub-a.
   *
   * Ide kroz HttpClient, a ne kao obična veza, jer ruta traži JWT —
   * njega dodaje interceptor, a obična `<a href>` veza ga ne bi
   * ponijela. Zato se sadržaj prvo dovuče, pa se od njega napravi
   * fajl koji browser snimi.
   */
  async downloadCertificate(deviceId: string): Promise<void> {
    const pem = await firstValueFrom(
      this.http.get(`${this.deviceBase(deviceId)}/ca`, {
        responseType: 'text'
      })
    );

    const url = URL.createObjectURL(
      new Blob([pem], { type: 'application/x-pem-file' })
    );

    const link = document.createElement('a');

    link.href = url;
    link.download = 'fornect-ca.crt';
    link.click();

    URL.revokeObjectURL(url);
  }

  /** Korak 1 — korisnik je popunio i potvrdio formu pristanka. */
  async grant(
    deviceId: string,
    input: ConsentGrantInput
  ): Promise<ConsentRecord> {
    const row = await firstValueFrom(
      this.http.post<ConsentApiRow>(this.base(deviceId), {
        guardian_name: input.guardianName,
        guardian_relation: input.guardianRelation,
        subject_is_minor: input.subjectIsMinor,
        ca_fingerprint: input.caFingerprint ?? null,
        method: 'panel',
      })
    );

    return toRecord(row);
  }

  /**
   * Korak 3 — rezultat tehničke provjere certifikata.
   *
   * Kad hub iz Zadatka 2 proradi, ovu potvrdu šalje sam uređaj nakon
   * uspješnog TLS handshake-a kroz Squid — panel je tada više ne
   * poziva. Do tada je ovo jedini način da se tok zatvori, pa panel
   * javlja ishod umjesto uređaja.
   */
  async verify(
    deviceId: string,
    success: boolean,
    options: { manual?: boolean; error?: string } = {}
  ): Promise<ConsentRecord> {
    const row = await firstValueFrom(
      this.http.post<ConsentApiRow>(`${this.base(deviceId)}/verify`, {
        success,
        manual: options.manual === true,
        error: options.error ?? null,
      })
    );

    return toRecord(row);
  }

  /** Korak 4 — opoziv. Uređaj ostaje na osnovnoj zaštiti. */
  async revoke(deviceId: string, reason?: string): Promise<ConsentRecord> {
    const row = await firstValueFrom(
      this.http.post<ConsentApiRow>(`${this.base(deviceId)}/revoke`, {
        reason: reason ?? null,
      })
    );

    return toRecord(row);
  }
}
