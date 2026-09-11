// Verzija politike pristanka na presretanje saobraćaja.
//
// Drži se kao konstanta u kodu, a ne u .env-u, namjerno: verzija
// politike nije stvar okruženja (dev/prod imaju istu politiku), nego
// stvar isporučene verzije aplikacije. Kad pravnik odobri novi tekst,
// mijenja se ovdje i ide u release — a svi uređaji koji su prihvatili
// stariju verziju automatski traže ponovno prihvatanje, jer se
// poređenje radi nad ovom vrijednošću.
//
// Format: MAJOR.MINOR. Povećati MAJOR kad se mijenja ono na šta
// korisnik pristaje (obim presretanja, ko ima pristup podacima,
// rok čuvanja). MINOR je za jezičke ispravke koje ne mijenjaju
// suštinu — ali i one traže novu verziju, da se zna šta je tačno
// stajalo pred korisnikom u trenutku pristanka.
export const CONSENT_POLICY_VERSION = '1.0';
