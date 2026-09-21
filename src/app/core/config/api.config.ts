import { Capacitor } from '@capacitor/core';

/**
 * Adresa produkcijskog backend-a za MOBILNU aplikaciju.
 *
 * Provjereno 21.09.2026: `GET /api/v1/health` na ovoj adresi vraća
 * `status: ok, db: ok`. Ako se produkcija preseli, mijenja se samo ovaj
 * red.
 */
const PRODUCTION_API_BASE_URL = 'https://admin.lukmandavran.cc/api/v1';

/**
 * Osnovni URL Fornect backend API-ja (server/, Fastify).
 *
 * Dva slučaja, isti kod:
 *
 *   U PREGLEDAČU je relativna putanja. Panel i backend su na istoj
 *   adresi — u razvoju ih spaja proxy.conf.json, u produkciji nginx —
 *   pa `/api/v1` pogađa backend bez obzira na domen.
 *
 *   U ANDROID APLIKACIJI (Capacitor) mora biti puna adresa. Tamo se
 *   stranica učitava iz same aplikacije (`https://localhost`), pa bi
 *   relativna `/api/v1` otišla nazad u aplikaciju umjesto na server:
 *   ekrani bi se prikazali, a prijava ne bi prošla. Tako je i bilo od
 *   prelaska na pravi backend do ove izmjene.
 *
 * CORS: backend prihvata svaki izvor (`origin: true` u app.ts), pa poziv
 * sa `https://localhost` prolazi. Prijava ide u zaglavlju, ne u
 * kolačiću, pa nije potrebno ništa više.
 */
export const API_BASE_URL = Capacitor.isNativePlatform()
  ? PRODUCTION_API_BASE_URL
  : '/api/v1';
