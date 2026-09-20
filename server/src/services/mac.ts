// Jedan oblik MAC adrese za cijeli sistem: `aa:bb:cc:dd:ee:ff`.
//
// Zašto postoji: MAC adresa je ista bez obzira na velika i mala slova,
// ali string u bazi nije. Panel je upisivao MAC onako kako ga je
// korisnik otkucao, a hub ga je slao malim slovima. Posljedica:
//
//   - uređaj koji je vlasnik dodao iz panela velikim slovima bio je za
//     hub nevidljiv — svaki opoziv, neuspjela provjera ili
//     klasifikacija sa huba odbijen je kao „nije zaveden na nalogu";
//
//   - kad bi hub javio isti uređaj kao nov, unique indeks
//     (account_id, mac_address) bi ga vidio kao DRUGI uređaj — isti
//     fizički telefon dva puta u listi, i dva mjesta u licenci.
//
// Ruta za prisutnost je jedina to radila kako treba, i to tako što je
// spuštala obje strane u JS-u prije poređenja. To je sakrivalo problem
// umjesto da ga riješi: podatak u bazi je i dalje bio u dva oblika.
//
// Crtice se pretvaraju u dvotačke jer Windows (`ipconfig /all`) MAC
// ispisuje sa crticama, a to je upravo ono što će neko kopirati.

const MAC_PATTERN = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

/**
 * Vraća MAC u jedinom obliku koji se čuva, ili null ako to nije MAC
 * adresa. Poziva se na SVAKOM mjestu gdje MAC ulazi u sistem.
 */
export function normaliseMac(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const candidate = input.trim().toLowerCase().replace(/-/g, ':');

  return MAC_PATTERN.test(candidate) ? candidate : null;
}
