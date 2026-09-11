// Automatsko svrstavanje neklasifikovanih uredjaja medju goste.
//
// Zadatak 1, Tacka 5: uredjaji bez ekrana (TV, stampac, konzola,
// sijalice) nikad nece otvoriti captive portal i sami se izjasniti.
// Ako bi cekali njihovu odluku, red "Novi uredjaji" bi se punio
// zauvijek i vlasnik bi ga prestao gledati — a upravo u tom redu
// treba da primijeti uredjaj koji ne prepoznaje.
//
// Zato se uredjaj koji nakon N sati i dalje nije klasifikovan sam
// svrstava medju goste. To mu NE mijenja zastitu — gost i
// neklasifikovan uredjaj oba dobijaju osnovnu (DNS) zastitu. Mijenja
// se samo to da prestaje biti pitanje na koje vlasnik treba odgovoriti.
//
// Puna zastita se nikad ne dodjeljuje automatski: ona trazi izricit
// pristanak, pa ovaj mehanizam ide iskljucivo u smjeru osnovne.

import type { PoolClient } from 'pg';

import { env } from '../env';

/**
 * Vraca broj uredjaja koji su ovim prebaceni u goste.
 *
 * Racuna se pri citanju liste, kao i obavjestenja o kapacitetu i
 * prisutnosti — nema posebnog posla u pozadini koji bi mogao stati
 * neprimjetno.
 */
export async function applyAutoGuestPolicy(
  client: PoolClient,
  accountId: string,
): Promise<number> {
  // Nula iskljucuje politiku — za nekog ko hoce da svaki uredjaj
  // ceka rucnu odluku koliko god treba.
  if (env.autoGuestAfterHours <= 0) {
    return 0;
  }

  const { rowCount } = await client.query(
    `UPDATE network_devices
     SET pairing_state = 'guest'
     WHERE account_id = $1
       AND pairing_state = 'unpaired'
       AND created_at < now() - ($2 || ' hours')::interval`,
    [accountId, String(env.autoGuestAfterHours)],
  );

  return rowCount ?? 0;
}
