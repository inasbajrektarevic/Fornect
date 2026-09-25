import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  accountId: string;
}

interface AccountApiResponse {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  created_at: string;
}

interface LoginApiResponse {
  token: string;
  account: AccountApiResponse;
}

interface StoredSession {
  token: string;
  user: AuthUser;
}

interface PendingRegistration extends StoredSession {
  name: string;
  email: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly storageKey = 'fornect-auth-session';
  private readonly pendingRegistrationKey = 'fornect-pending-registration';

  private readonly session = signal<StoredSession | null>(this.loadSession());

  readonly currentUser = computed(() => this.session()?.user ?? null);

  // Bearer token trenutne sesije — čita ga authInterceptor da bi ga
  // zakačio na svaki zahtjev ka backend API-ju.
  readonly token = computed(() => this.session()?.token ?? null);

  readonly isAuthenticated = computed(() => this.session() !== null);

  async login(email: string, password: string, rememberMe = false): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const response = await firstValueFrom(
        this.http.post<LoginApiResponse>(`${API_BASE_URL}/auth/login`, {
          email: normalizedEmail,
          password,
        }),
      );

      this.saveSession(this.toSession(response), rememberMe);

      return true;
    } catch {
      // Pogrešna lozinka, nepostojeći nalog, ili backend nedostupan
      // — sve tretiramo kao neuspjelu prijavu, isto kao i ranije.
      return false;
    }
  }

  async prepareRegistration(name: string, email: string, password: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    const trimmedName = name.trim();

    try {
      await firstValueFrom(
        this.http.post<AccountApiResponse>(`${API_BASE_URL}/auth/register`, {
          name: trimmedName,
          email: normalizedEmail,
          password,
          // Server po ovoj zoni računa da li je uređaj napustio mrežu
          // "u vrijeme rasporeda". Bez nje bi računao po svom vremenu
          // (produkcija je u UTC-u) i noćni odlazak u 21:30 vidio kao
          // 19:30, dakle prije početka rasporeda.
          timezone: detectTimeZone(),
        }),
      );
    } catch (error) {
      if (isHttpStatus(error, 409)) {
        throw new Error('An account with this email already exists.');
      }

      throw error;
    }

    // Nalog je kreiran na backend-u, ali korisnik se formalno
    // prijavljuje tek nakon "verifikacije emaila" (verify-email
    // ekran). Prijavu radimo odmah i čuvamo je kao pending, da
    // completeRegistration() ostane sinhrona funkcija — pozivaju je
    // verify-email.ts i device-pairing.ts bez await-a.
    const loginResponse = await firstValueFrom(
      this.http.post<LoginApiResponse>(`${API_BASE_URL}/auth/login`, {
        email: normalizedEmail,
        password,
      }),
    );

    const pending: PendingRegistration = {
      name: trimmedName,
      email: normalizedEmail,
      ...this.toSession(loginResponse),
    };

    sessionStorage.setItem(this.pendingRegistrationKey, JSON.stringify(pending));

    sessionStorage.removeItem('fornect-email-verified');
  }

  /**
   * Potvrda email adrese kodom koji je server poslao na mail.
   *
   * Kod se provjerava NA SERVERU — ranije je bio zakucan u frontendu
   * (123456), pa je provjera bila samo privid: bilo ko je mogao
   * "potvrditi" bilo koju adresu.
   */
  async verifyEmail(email: string, code: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/auth/verify-email`, {
        email: email.trim().toLowerCase(),
        code: code.trim(),
      }),
    );
  }

  /** Novi kod na istu adresu. Server ograničava koliko često. */
  async resendVerification(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/auth/resend-verification`, {
        email: email.trim().toLowerCase(),
      }),
    );
  }

  /**
   * Zatraži kod za novu lozinku. Server odgovara isto postojao nalog ili
   * ne, pa uspjeh ovdje NE znači da je mail poslan.
   */
  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/auth/forgot-password`, {
        email: email.trim().toLowerCase(),
      }),
    );
  }

  /** Nova lozinka uz kod iz maila. Poslije ovoga stari tokeni ne važe. */
  async resetPassword(email: string, code: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/auth/reset-password`, {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        password,
      }),
    );
  }

  completeRegistration(): boolean {
    const saved = sessionStorage.getItem(this.pendingRegistrationKey);

    // Nema pending registracije: nalog je vec
    // kreiran ranije (odmah nakon verifikacije
    // emaila), pa je ovaj korak idempotentan.
    if (!saved) {
      return this.currentUser() !== null;
    }

    const verified = sessionStorage.getItem('fornect-email-verified') === 'true';

    if (!verified) {
      return false;
    }

    try {
      const pending = JSON.parse(saved) as PendingRegistration;

      this.saveSession({ token: pending.token, user: pending.user }, true);

      // Nalog sada trajno postoji, pa pending
      // podaci vise nisu potrebni.
      sessionStorage.removeItem(this.pendingRegistrationKey);

      sessionStorage.removeItem('fornect-email-verified');

      return true;
    } catch {
      return false;
    }
  }

  logout(): void {
    this.session.set(null);

    localStorage.removeItem(this.storageKey);
    sessionStorage.removeItem(this.storageKey);
  }

  private toSession(response: LoginApiResponse): StoredSession {
    return {
      token: response.token,
      user: {
        id: response.account.id,
        name: response.account.name,
        email: response.account.email,
        // Backend nema odvojen koncept "user" vs "account" — jedan
        // nalog je i jedan account, pa je accountId isto sto i id.
        accountId: response.account.id,
      },
    };
  }

  private saveSession(session: StoredSession, rememberMe: boolean): void {
    this.session.set(session);

    localStorage.removeItem(this.storageKey);
    sessionStorage.removeItem(this.storageKey);

    const storage = rememberMe ? localStorage : sessionStorage;

    storage.setItem(this.storageKey, JSON.stringify(session));
  }

  private loadSession(): StoredSession | null {
    const saved = localStorage.getItem(this.storageKey) ?? sessionStorage.getItem(this.storageKey);

    if (!saved) {
      return null;
    }

    try {
      return JSON.parse(saved) as StoredSession;
    } catch {
      localStorage.removeItem(this.storageKey);
      sessionStorage.removeItem(this.storageKey);

      return null;
    }
  }
}

function isHttpStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === status
  );
}

/** IANA zona pregledača, sa padom nazad ako je okruženje ne zna. */
function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Sarajevo';
  } catch {
    return 'Europe/Sarajevo';
  }
}
