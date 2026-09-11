/**
 * Poruka koju je backend poslao uz grešku.
 *
 * Backend vraća konkretan razlog u obliku `{ error: '...' }` — npr.
 * "Previše pogrešnih pokušaja. Zatražite novi kod." Takva poruka
 * korisniku kaže šta da uradi, dok ga opšte "nešto je pošlo po zlu"
 * ostavlja bez ikakvog traga, a ponekad i navodi na pogrešan zaključak
 * (da je problem u vezi, kad nije).
 *
 * Na rezervnu poruku se pada samo kad odgovora zaista nema — server
 * nedostupan, prekinuta veza.
 */
export function serverErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { error?: unknown } | null)?.error;

  if (body && typeof body === 'object') {
    const message = (body as { error?: unknown }).error;

    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}
