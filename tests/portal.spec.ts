import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------
// Captive portal — Zadatak 1, Tacka 5.
//
// Portal se ne servira iz Angulara nego sa samog Fornect uredjaja. U
// testu ga servira portal/dev-server.js, koji glumi fornectd: lokalni
// API je isti, ali su MAC klijenta i dokaz o TLS handshake-u lazni
// (spisak stoji u komentaru tog fajla). Zato ovi testovi dokazuju da
// portal radi ono sto treba KAD uredjaj odgovori — ne da uredjaj radi.
//
// Apsolutne adrese, jer baseURL suite-a pokazuje na panel (4200).
// ---------------------------------------------------------------

const PORTAL = 'http://localhost:4300';

async function openPortal(page: Page, scenario = 'default'): Promise<void> {
  await page.request.post(`${PORTAL}/dev/scenario`, { data: { name: scenario } });

  await page.goto(`${PORTAL}/`);
}

test('P1 - the choice states the real numbers and never claims everything', async ({ page }) => {
  await openPortal(page);

  await expect(page.getByRole('button', { name: /Puna zaštita/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Samo osnovna zaštita/ })).toBeVisible();

  // Iste brojke kao u panelu — dolaze iz texts.json, koji se generise
  // iz language.ts. Ako se raziđu, ovo pada.
  //
  // Lokator je vezan za ekran izbora, jer isti tekst stoji i na ekranu
  // "koja je razlika". Taj je skriven, ali ga getByText svejedno
  // pogodi, pa bi nevezan lokator pao na dva rezultata umjesto da
  // provjeri ono sto je htio.
  const choice = page.locator('#view-choice');

  await expect(choice.getByText('oko 64%')).toBeVisible();
  await expect(choice.getByText('70–85%')).toBeVisible();
  await expect(choice.getByText('Nijedan nivo ne zaustavlja sve')).toBeVisible();

  // "100%" se ne smije pojaviti nigdje, ni na skrivenim ekranima.
  await expect(page.getByText('100%')).toHaveCount(0);
});

test('P2 - basic protection is one tap and says what it does not do', async ({ page }) => {
  await openPortal(page);

  await page.getByRole('button', { name: /Samo osnovna zaštita/ }).click();

  await expect(page.getByRole('heading', { name: 'Osnovna zaštita je uključena' })).toBeVisible();

  // Granica se ne precutkuje: bez certifikata saobracaj se ne pregleda.
  await expect(page.getByText('Certifikat nije instaliran i saobraćaj se ne pregleda')).toBeVisible();
});

test('P3 - consent without a name is refused before it is sent', async ({ page }) => {
  await openPortal(page);

  await page.getByRole('button', { name: /Puna zaštita/ }).click();

  await expect(page.getByRole('heading', { name: 'Pristanak na pregled saobraćaja' })).toBeVisible();

  // Prihvati politiku, ali ostavi ime prazno.
  await page.locator('#accept-policy').check();
  await page.getByRole('button', { name: 'Dajem pristanak' }).click();

  await expect(page.getByText('bez njih zapis ne vrijedi kao pristanak')).toBeVisible();

  // I dalje na formi — nista nije poslano.
  await expect(page.getByRole('heading', { name: 'Pristanak na pregled saobraćaja' })).toBeVisible();
});

test('P4 - consent without accepting the policy is refused too', async ({ page }) => {
  await openPortal(page);

  await page.getByRole('button', { name: /Puna zaštita/ }).click();

  await page.locator('#guardian-name').fill('Inas Bajrektarević');
  await page.locator('#guardian-relation').fill('roditelj');

  await page.getByRole('button', { name: 'Dajem pristanak' }).click();

  await expect(page.getByText('Politiku treba prihvatiti')).toBeVisible();
});

test('P5 - full protection waits for proof, it is not a button', async ({ page }) => {
  await openPortal(page);

  await page.getByRole('button', { name: /Puna zaštita/ }).click();

  await page.locator('#guardian-name').fill('Inas Bajrektarević');
  await page.locator('#guardian-relation').fill('roditelj');
  await page.locator('#accept-policy').check();
  await page.getByRole('button', { name: 'Dajem pristanak' }).click();

  // Uputstvo, sa otiskom koji korisnik moze uporediti.
  await expect(page.getByRole('heading', { name: 'Instalirajte Fornect certifikat' })).toBeVisible();
  await expect(page.locator('#ca-fingerprint')).not.toBeEmpty();

  // Rucne potvrde NEMA dok automatska provjera traje. Kontrakt je
  // predvidja kao fallback, ali da stoji od pocetka, niko ne bi cekao
  // dokaz — a pristanak bi izgledao dokazano a ne bi bio.
  await expect(page.locator('#manual-confirm')).toBeHidden();

  // Dokaz stize sa uredjaja, pa ekran sam prelazi dalje.
  await expect(page.getByRole('heading', { name: 'Puna zaštita je uključena' })).toBeVisible({
    timeout: 15000,
  });
});

test('P6 - when the proof never arrives, the portal says so instead of pretending', async ({
  page,
}) => {
  await openPortal(page, 'never');

  await page.getByRole('button', { name: /Puna zaštita/ }).click();

  await page.locator('#guardian-name').fill('Inas Bajrektarević');
  await page.locator('#guardian-relation').fill('roditelj');
  await page.locator('#accept-policy').check();
  await page.getByRole('button', { name: 'Dajem pristanak' }).click();

  await expect(page.getByText('Provjera nije prošla')).toBeVisible({ timeout: 20000 });

  // Uputstvo ostaje na ekranu — korisniku sada treba bas ono.
  await expect(page.getByRole('heading', { name: 'Instalirajte Fornect certifikat' })).toBeVisible();

  // Tek SADA se nudi rucna potvrda (Tacka 5: fallback uz method=manual).
  await expect(page.locator('#manual-confirm')).toBeVisible();

  await page.locator('#manual-confirm').click();

  await expect(page.getByRole('heading', { name: 'Puna zaštita je uključena' })).toBeVisible();

  // I zapis mora reci da je pristanak izjavljen, a ne dokazan.
  //
  // Lokator je vezan za zavrsnu poruku, jer ista recenica stoji i ispod
  // rucnog dugmeta na ekranu uputstva — namjerno, da se procita PRIJE
  // klika i POSLIJE njega.
  await expect(page.locator('#done-note')).toContainText('vodi kao izjavljen, ne kao dokazan');
});

test('P7 - a full licence shows the capacity page instead of the choice', async ({ page }) => {
  await openPortal(page, 'capacity');

  await expect(page.getByRole('heading', { name: 'Mreža je popunjena' })).toBeVisible();

  // Zadatak 1, Tacka 4, sloj L1: bez registracije nema ni DNS ni MITM
  // usluge. Portal to mora reci tacno — ranije je pisalo da uredjaj
  // "radi na mrezi, samo nije zasticen", sto je obecavalo internet
  // koji uredjaj nema.
  await expect(page.getByText('nije registrovan')).toBeVisible();
  await expect(page.getByText('nema pristupa internetu')).toBeVisible();

  await expect(page.getByRole('button', { name: /Puna zaštita/ })).toHaveCount(0);
});

test('P8 - the instructions cover Firefox on Android, which has its own trust store', async ({
  page,
}) => {
  await openPortal(page, 'never');

  await page.getByRole('button', { name: /Puna zaštita/ }).click();

  await page.locator('#guardian-name').fill('Inas Bajrektarević');
  await page.locator('#guardian-relation').fill('roditelj');
  await page.locator('#accept-policy').check();
  await page.getByRole('button', { name: 'Dajem pristanak' }).click();

  // Scenarij 'never' drzi ekran sa uputstvom otvorenim, da se stigne
  // prosetati kroz platforme.
  await page.locator('#platform-tabs button[data-os="android"]').click();

  await expect(page.getByText('Firefox na Androidu drži vlastitu listu certifikata')).toBeVisible();

  // Napomena nestaje kad platforma nije Android — inace bi na iPhone-u
  // stajalo uputstvo koje se ne odnosi ni na sta.
  await page.locator('#platform-tabs button[data-os="ios"]').click();

  await expect(page.locator('#install-extra')).toBeHidden();
});

// Peti korak uputstva se namjerno NE dijeli sa panelom. U panelu on
// glasi "vratite se ovdje i potvrdite da je profil instaliran", jer
// tamo postoji dugme. Na portalu tog dugmeta nema — potvrda stize sa
// uredjaja. Da se peti korak dijelio, portal bi upucivao korisnika na
// dugme koje ne postoji.
test('P9 - the last install step matches what the portal actually does', async ({ page }) => {
  await openPortal(page, 'never');

  await page.getByRole('button', { name: /Puna zaštita/ }).click();

  await page.locator('#guardian-name').fill('Inas Bajrektarević');
  await page.locator('#guardian-relation').fill('roditelj');
  await page.locator('#accept-policy').check();
  await page.getByRole('button', { name: 'Dajem pristanak' }).click();

  const steps = page.locator('#install-steps li');

  await expect(steps).toHaveCount(5);
  await expect(steps.last()).toContainText('Potvrda stiže sama');

  await expect(page.getByText('potvrdite da je profil instaliran')).toHaveCount(0);
});

// Lukmanov dokument trazi uputstvo po OS-u za Windows/macOS/Android/iOS
// — cetiri, ne tri. Prvo sam Windows i macOS bio spojio u "Racunar", a
// koraci im se stvarno razlikuju: na Windowsu ide carobnjak i "Trusted
// Root Certification Authorities", na Mac-u Keychain Access i "Always
// Trust". Zajednicko uputstvo nije vodilo ni kroz jedno.
test('P10 - the instructions cover all four operating systems, separately', async ({ page }) => {
  await openPortal(page, 'never');

  await page.getByRole('button', { name: /Puna zaštita/ }).click();

  await page.locator('#guardian-name').fill('Inas Bajrektarević');
  await page.locator('#guardian-relation').fill('roditelj');
  await page.locator('#accept-policy').check();
  await page.getByRole('button', { name: 'Dajem pristanak' }).click();

  await expect(page.locator('#platform-tabs button')).toHaveCount(4);

  await page.locator('#platform-tabs button[data-os="windows"]').click();
  await expect(page.locator('#install-steps')).toContainText(
    'Trusted Root Certification Authorities',
  );

  await page.locator('#platform-tabs button[data-os="mac"]').click();
  await expect(page.locator('#install-steps')).toContainText('Keychain Access');
  await expect(page.locator('#install-steps')).toContainText('Always Trust');

  // Windows i Mac nose razlicite napomene o pregledniku.
  await expect(page.locator('#install-note')).toContainText('keychain');
});

// Uredjaj koji se VRACA na mrezu.
//
// Portal je stanje dobijao od uredjaja i nije ga koristio, pa je
// svakome prikazivao izbor — i onome ko je pristanak dao odavno. Za
// uredjaj koji vec ima punu zastitu to je i gore nego suvisno: nudi mu
// se da "izabere" ono sto ima, dok mu pristanak stoji zapisan.
test('P11 - a device that already decided is not asked again', async ({ page }) => {
  await openPortal(page, 'consented');

  await expect(
    page.getByRole('heading', { name: 'Ovaj uređaj već ima punu zaštitu' }),
  ).toBeVisible();

  await expect(page.getByRole('button', { name: /Samo osnovna zaštita/ })).toHaveCount(0);

  // Nema ni ponude da "predje na punu" — vec je ima.
  await expect(page.locator('#known-upgrade')).toBeHidden();
});

test('P12 - a guest can still upgrade, and consent is asked again for it', async ({ page }) => {
  await openPortal(page, 'guest');

  await expect(
    page.getByRole('heading', { name: 'Ovaj uređaj već ima osnovnu zaštitu' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Pređi na punu zaštitu' }).click();

  // Puna zastita i dalje trazi pristanak — nadogradnja ga ne preskace.
  await expect(
    page.getByRole('heading', { name: 'Pristanak na pregled saobraćaja' }),
  ).toBeVisible();
});

// Pristanak je dat, certifikat jos nije dokazan. Tu se nastavlja tamo
// gdje je stalo: uputstvo, bez ponovnog potpisivanja. Pristanak se ne
// trazi dva puta za istu stvar.
test('P13 - a device mid-install resumes at the instructions', async ({ page }) => {
  await openPortal(page, 'verifying');

  await expect(
    page.getByRole('heading', { name: 'Instalirajte Fornect certifikat' }),
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Pristanak na pregled saobraćaja' }),
  ).toHaveCount(0);
});

// Tacka 5, kontrakt: "nova verzija politike → uredjaji sa starom
// verzijom dobijaju banner 'potrebno ponovno prihvatanje' pri sledecoj
// posjeti portalu". Pristanak vrijedi za tekst na koji je dat.
test('P14 - a changed policy asks for consent again', async ({ page }) => {
  await openPortal(page, 'oldpolicy');

  await expect(
    page.getByRole('heading', { name: 'Pristanak na pregled saobraćaja' }),
  ).toBeVisible();

  await expect(page.getByText('Politika pregleda saobraćaja je izmijenjena')).toBeVisible();
});

// Tacka 5: "prebaci na osnovnu" stoji i u portalu, ne samo u panelu.
// Opoziv je pravo davaoca pristanka i ne smije traziti prijavu.
test('P15 - consent can be withdrawn from the portal itself', async ({ page }) => {
  await openPortal(page, 'consented');

  await page.getByRole('button', { name: 'Prebaci na osnovnu zaštitu' }).click();

  await expect(
    page.getByRole('heading', { name: 'Osnovna zaštita je uključena' }),
  ).toBeVisible();
});

// Pravni sloj Zadatka 1: "politika privatnosti u kutiji/portalu".
// Portal trazi pristanak na presretanje saobracaja, pa politika mora
// biti dostupna U TRENUTKU kad se pristanak daje.
test('P16 - the privacy policy is reachable where consent is given', async ({ page }) => {
  await openPortal(page);

  const config = await (await page.request.get(`${PORTAL}/config.json`)).json();

  await page.getByRole('button', { name: /Puna zaštita/ }).click();

  if (config.privacyPolicyUrl) {
    await expect(page.locator('#privacy-link')).toBeVisible();
    await expect(page.locator('#privacy-link')).toHaveAttribute('href', config.privacyPolicyUrl);
  } else {
    // Nije podesena: ne prikazuje se nista. Mrtva veza na ekranu
    // pristanka je gora od nikakve — izgleda kao da je politika
    // ponudjena, a nije.
    await expect(page.locator('#privacy-link-row')).toBeHidden();
  }
});
