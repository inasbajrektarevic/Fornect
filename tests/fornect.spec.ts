import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------
// Backend je sad stvaran (Fastify + PostgreSQL), ne localStorage
// mock. Svaki test dobija SVOJ svježe registrovan nalog (jedinstven
// email po pozivu), pa testovi ne dijele stanje niti moraju čistiti
// bazu između pokretanja — nema kolizije čak ni ako se cijeli suite
// pokrene više puta zaredom protiv iste baze.
// ---------------------------------------------------------------

const PASSWORD = 'Fornect2026!';

// Kod za potvrdu emaila sada generise server i salje ga mailom. U
// razvoju i testovima transport `log` mail upise kao fajl umjesto da
// ga posalje, pa test moze procitati bas svoj kod.
//
// Namjerno NE postoji ruta koja vraca posljednji kod: takva ruta bi
// bila najkraci put do curenja kodova ako se greskom ukljuci u
// produkciji. Fajl na disku se preko mreze ne moze dohvatiti.
const MAIL_OUTBOX = path.resolve(process.cwd(), 'server', '.mail-outbox');

async function readVerificationCode(email: string): Promise<string> {
  const safe = email.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Mail se upisuje neposredno nakon odgovora na registraciju, pa se
  // zna desiti da fajl jos ne postoji u trenutku prvog pogleda.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const files = fs.existsSync(MAIL_OUTBOX)
      ? fs
          .readdirSync(MAIL_OUTBOX)
          .filter((name) => name.includes(safe))
          .sort()
      : [];

    const newest = files[files.length - 1];

    if (newest) {
      const mail = JSON.parse(
        fs.readFileSync(path.join(MAIL_OUTBOX, newest), 'utf8'),
      ) as { text: string };

      const match = /\b(\d{6})\b/.exec(mail.text);

      if (match) {
        return match[1];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Nema maila sa kodom za ${email}`);
}



function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e8)}@fornect.test`;
}

interface LoginApiResponse {
  token: string;
  account: { id: string; name: string; email: string };
}

/** Registruje nalog direktno preko API-ja (bez UI-ja) — koristi se
 * kad test treba samo da nalog POSTOJI da bi ga UI login testirao.
 * Odmah postavlja i jezičku preferencu (en) za taj nalog, da UI
 * nakon login-a ne padne nazad na podrazumijevani bosanski. */
async function registerAccount(page: Page, email: string, name = 'Test User'): Promise<void> {
  const response = await page.request.post('/api/v1/auth/register', {
    data: { name, email, password: PASSWORD },
  });

  const account: { id: string } = await response.json();

  await page.evaluate((accountId) => {
    localStorage.setItem(
      `fornect-account-preferences-${accountId}`,
      JSON.stringify({ language: 'en' }),
    );
  }, account.id);
}

async function apiLogin(page: Page, email: string): Promise<LoginApiResponse> {
  const response = await page.request.post('/api/v1/auth/login', {
    data: { email, password: PASSWORD },
  });

  return response.json();
}

interface RegisteredHub {
  id: string;
  token: string;
  pairing_code: string;
}

// Registracija i uparivanje huba za test.
//
// Obje rute su ogranicene po IP-u: /devices/register
// (DEVICE_REGISTER_MAX_PER_HOUR) i /hub/claim (HUB_CLAIM_MAX_PER_HOUR),
// obje podrazumijevano 10 na sat. To je zastita i ostaje takva. Za
// lokalni rad obje vrijednosti treba podici u server/.env.
//
// PRAVILO ZA NOVE TESTOVE: suite sada poziva ovu funkciju TACNO deset
// puta — koliko je i zadani limit. Test koji treba hub neka koristi
// postojeci (seedHub, ili dopuni test koji ga vec ima). Jedanaesti poziv
// rusi prvo pokretanje kod svakoga ko limit nije podigao.
//
// Zato se provjeravaju OBA odgovora, odmah i odvojeno. Bez toga 429
// izgleda kao "undefined" pet redova kasnije. I desilo se tacno to:
// prvo sam 429 sa uparivanja pripisao registraciji, jer se test nije
// zaustavio tamo gdje je stvarno pukao.
async function registerHub(
  page: Page,
  headers: Record<string, string>,
  data: { name: string; kind?: string; mode?: string; capacity?: number },
): Promise<RegisteredHub> {
  const registered = await page.request.post('/api/v1/devices/register', {
    data: { kind: 'home', mode: 'home', ...data },
  });

  if (registered.status() === 429) {
    throw new Error(
      'Registracija huba odbijena (429): dostignut DEVICE_REGISTER_MAX_PER_HOUR. ' +
        'Za razvoj ga povecajte u server/.env i restartujte backend.',
    );
  }

  expect(registered.status(), 'registracija huba').toBe(201);

  const hub: RegisteredHub = await registered.json();

  const claimed = await page.request.post('/api/v1/app/hub/claim', {
    headers,
    data: { pairing_code: hub.pairing_code },
  });

  if (claimed.status() === 429) {
    throw new Error(
      'Uparivanje huba odbijeno (429): dostignut HUB_CLAIM_MAX_PER_HOUR. ' +
        'Za razvoj ga povecajte u server/.env i restartujte backend.',
    );
  }

  expect(claimed.status(), 'uparivanje huba').toBe(200);

  return hub;
}

const WEEK_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_SELECTED_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function schedule(
  enabled: boolean,
  startHour: string,
  startMinute: string,
  endHour: string,
  endMinute: string,
) {
  return {
    enabled,
    mode: 'sameEveryDay',
    startHour,
    startMinute,
    endHour,
    endMinute,
    days: WEEK_ORDER.map((label) => ({
      label,
      selected: DEFAULT_SELECTED_DAYS.includes(label),
      startHour,
      startMinute,
      endHour,
      endMinute,
    })),
  };
}

// Isti 4 demo uređaja kao u staroj mock verziji (ista imena, profili,
// nivoi zaštite, pairing stanja i rasporedi) — samo se sad stvarno
// kreiraju preko backend API-ja, sa pravim UUID-ovima umjesto
// hardkodiranih string ID-ova poput 'amar-iphone'.
const DEMO_DEVICES = [
  {
    key: 'iphone' as const,
    name: "Amar's iPhone",
    macAddress: '02:00:00:00:01:01',
    type: 'phone',
    profile: 'Child',
    protectionLevel: 'full',
    pairingState: 'paired',
    useFullProtection: true,
    online: true,
    schedule: schedule(true, '21', '00', '07', '00'),
  },
  {
    key: 'tv' as const,
    name: 'Living room TV',
    macAddress: '02:00:00:00:01:02',
    type: 'tv',
    profile: 'Adult',
    protectionLevel: 'standard',
    pairingState: 'unpaired',
    useFullProtection: false,
    online: true,
    schedule: schedule(false, '22', '00', '07', '00'),
  },
  {
    key: 'playstation' as const,
    name: 'PlayStation 5',
    macAddress: '02:00:00:00:01:03',
    type: 'console',
    profile: 'Teen',
    protectionLevel: 'standard',
    pairingState: 'unpaired',
    useFullProtection: false,
    // Offline po dizajnu — test 21 provjerava obavještenje o
    // uređaju koji je napustio mrežu.
    online: false,
    schedule: schedule(true, '22', '00', '08', '00'),
  },
  {
    key: 'unknown' as const,
    name: 'Unknown device',
    macAddress: '02:00:00:00:01:04',
    type: 'unknown',
    profile: null as string | null,
    protectionLevel: 'needs-setup',
    pairingState: 'unpaired',
    useFullProtection: false,
    online: true,
    schedule: schedule(false, '21', '00', '07', '00'),
  },
];

type DeviceKey = (typeof DEMO_DEVICES)[number]['key'];

interface SeededAccount {
  email: string;
  accountId: string;
  /** Pravi UUID svakog demo uređaja, po ključu (npr. deviceIds.iphone). */
  deviceIds: Record<DeviceKey, string>;
}

/**
 * Registruje svjež nalog preko pravog backend-a, po potrebi kreira
 * 4 standardna demo uređaja preko network-devices API-ja (isti kao
 * stari mock), i upisuje sesiju u localStorage u istom obliku kakav
 * AuthService očekuje (fornect-auth-session) — bez prolaska kroz
 * login formu, radi brzine. Naredna navigacija (page.goto) učitava
 * app iznova, pa AuthService/DeviceService/HubService konstruktori
 * sinhrono pokupe ovu sesiju i učitaju uređaje sa API-ja.
 */
async function seedAccount(
  page: Page,
  options: { withDevices?: boolean } = {},
): Promise<SeededAccount> {
  const email = uniqueEmail('demo');

  await registerAccount(page, email, 'Demo User');
  const { token, account } = await apiLogin(page, email);

  const deviceIds = {} as Record<DeviceKey, string>;

  if (options.withDevices !== false) {
    for (const spec of DEMO_DEVICES) {
      const createResponse = await page.request.post('/api/v1/app/network-devices', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          mac_address: spec.macAddress,
          name: spec.name,
          type: spec.type,
          profile: spec.profile,
          protection_level: spec.protectionLevel,
          pairing_state: spec.pairingState,
          use_full_protection: spec.useFullProtection,
          schedule: spec.schedule,
        },
      });

      const created = await createResponse.json();
      deviceIds[spec.key] = created.id;

      // 'online' nije podržan na POST-u (samo PATCH) — vidi
      // server/src/routes/network-devices.ts CREATABLE_FIELDS.
      //
      // Svaki uređaj prvo dođe na mrežu, pa tek onda nestane ako tako
      // treba. Tako je i u stvarnosti: hub ga vidi, pa prestane. Od
      // migracije 012 obavještenje o odlasku nastaje iz PROMJENE
      // stanja, a ne iz zatečenog — uređaj koji nikad nije bio viđen
      // nije nikoga ni napustio.
      await page.request.patch(`/api/v1/app/network-devices/${created.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { online: true },
      });

      if (!spec.online) {
        await page.request.patch(`/api/v1/app/network-devices/${created.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { online: false },
        });
      }
    }
  }

  const session = {
    token,
    user: {
      id: account.id,
      name: account.name,
      email: account.email,
      accountId: account.id,
    },
  };

  await page.evaluate(
    ({ sessionJson, accountId }) => {
      localStorage.setItem('fornect-auth-session', sessionJson);
      localStorage.setItem(
        `fornect-account-preferences-${accountId}`,
        JSON.stringify({ language: 'en' }),
      );
    },
    { sessionJson: JSON.stringify(session), accountId: account.id },
  );

  return { email, accountId: account.id, deviceIds };
}

/** Ekvivalent staroj login(page) helper funkciji — ulaze već
 * prijavljeni na dashboard, sa 4 standardna demo uređaja. */
async function login(page: Page, options: { withDevices?: boolean } = {}): Promise<SeededAccount> {
  const seeded = await seedAccount(page, options);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/dashboard$/);

  // Brze akcije se renderuju tek nakon prvog prolaza. Bez ovog
  // čekanja klik odmah nakon prijave zna promašiti.
  await expect(page.getByRole('button', { name: 'Devices' })).toBeVisible();

  return seeded;
}

test.beforeEach(async ({ page }) => {
  // Jezik za pre-login ekrane (login/register/verify-email) — nalog
  // za te ekrane još ne postoji, pa se koristi 'anonymous' ključ.
  await page.addInitScript(() => {
    localStorage.setItem(
      'fornect-account-preferences-anonymous',
      JSON.stringify({ language: 'en' }),
    );
  });

  // Svaki test počinje sa čistim localStorage stanjem.
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('01 - auth guard blocks dashboard without login', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('02 - login validates fields and creates session', async ({ page }) => {
  const email = uniqueEmail('login');
  await registerAccount(page, email);

  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Invalid email or password.')).toBeVisible();

  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);

  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Your network is protected' })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/dashboard$/);
});

test('03 - logout clears session', async ({ page }) => {
  await login(page, { withDevices: false });

  await page.getByRole('button', { name: 'Logout' }).click();

  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login$/);
});

test('04 - devices are listed and open correct details', async ({ page }) => {
  const seeded = await login(page);

  await page.getByRole('button', { name: 'Devices' }).click();

  await page.waitForURL(/\/devices$/);

  await expect(page.getByText("Amar's iPhone")).toBeVisible();
  await expect(page.getByText('Living room TV')).toBeVisible();
  await expect(page.getByText('PlayStation 5')).toBeVisible();
  await expect(page.getByText('Unknown device')).toBeVisible();

  const tvCard = page.locator('.device-card').filter({ hasText: 'Living room TV' });

  // Oznaka profila zivi na listi uredaja.
  await expect(tvCard.getByText('Adult profile')).toBeVisible();

  await tvCard.getByRole('button', { name: 'Manage' }).click();

  await expect(page).toHaveURL(new RegExp(`/devices/${seeded.deviceIds.tv}$`));

  await expect(
    page.getByRole('heading', { name: 'Living room TV', exact: true }).first(),
  ).toBeVisible();

  // Detalji uredaja isti podatak pisu punom recenicom,
  // i to na dva mjesta (header i kartica profila).
  await expect(
    page.getByText('This device uses the Adult protection profile.').first(),
  ).toBeVisible();
});

test('05 - profile change survives refresh', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.iphone}`);

  await page.getByRole('button', { name: 'Change profile' }).click();
  await page.getByRole('button', { name: 'Teen', exact: true }).click();

  const teenProfileText = page.getByText('This device uses the Teen protection profile.').first();

  await expect(teenProfileText).toBeVisible();

  await page.reload();

  await expect(teenProfileText).toBeVisible();
});

test('06 - schedule saves and survives refresh', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.tv}/schedule`);

  await page.locator('.slider').click();

  const selects = page.locator('.time-picker select');

  await selects.nth(0).selectOption('18');
  await selects.nth(1).selectOption('30');
  await selects.nth(2).selectOption('22');
  await selects.nth(3).selectOption('15');

  await page.getByRole('button', { name: 'Save schedule' }).click();

  await expect(page.getByText('Schedule saved successfully.')).toBeVisible();

  await page.reload();

  await expect(selects.nth(0)).toHaveValue('18');
  await expect(selects.nth(1)).toHaveValue('30');
  await expect(selects.nth(2)).toHaveValue('22');
  await expect(selects.nth(3)).toHaveValue('15');

  await page.getByRole('button', { name: 'Back to device' }).click();

  await expect(page.getByText('18:30 - 22:15')).toBeVisible();
});

test('07 - emergency override survives refresh', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.iphone}`);

  await page.getByRole('button', { name: '30 min' }).click();

  await expect(page.getByRole('heading', { name: 'Temporarily allowed' })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Temporarily allowed' })).toBeVisible();

  await page.getByRole('button', { name: 'End override' }).click();

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
});

test('08 - protection pairing survives refresh', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.tv}/protection`);

  await page.getByRole('button', { name: 'Continue with consent' }).click();

  await giveConsent(page);

  await expect(page.getByText('Waiting for confirmation')).toBeVisible();

  await page.getByRole('button', { name: 'Profile installed' }).click();

  await expect(page.getByText('Paired', { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByText('Paired', { exact: true })).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Full Protection', exact: true }).first(),
  ).toBeVisible();
});

test('09 - unknown device setup flow works', async ({ page }) => {
  const seeded = await login(page);
  await page.goto('/devices');

  await page.getByRole('button', { name: 'Set up' }).click();

  await expect(page).toHaveURL(new RegExp(`/devices/${seeded.deviceIds.unknown}/setup$`));

  await page.getByPlaceholder("e.g. Amina's tablet").fill('Test iPhone');

  await page.getByRole('button', { name: /Teen/ }).click();

  await page.getByRole('button', { name: /Standard Protection/ }).click();

  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page).toHaveURL(new RegExp(`/devices/${seeded.deviceIds.unknown}$`));

  await expect(
    page.getByRole('heading', { name: 'Test iPhone', exact: true }).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Back to devices' }).click();

  const newDeviceCard = page.locator('.device-card').filter({ hasText: 'Test iPhone' });

  await expect(newDeviceCard).toBeVisible();
  await expect(newDeviceCard.getByText('Teen profile')).toBeVisible();
});

test('10 - another account cannot see demo account devices', async ({ page }) => {
  // Prvi (demo) nalog postoji u bazi sa svojim uređajima, ali se ne
  // prijavljujemo na njega — samo dokazujemo da drugi nalog ne može
  // vidjeti njegove uređaje čak i kad oni stvarno postoje.
  await seedAccount(page);

  await login(page, { withDevices: false });

  await page.goto('/devices');

  await expect(page.getByText("Amar's iPhone")).not.toBeVisible();
  await expect(page.getByText('Living room TV')).not.toBeVisible();
  await expect(page.getByText('PlayStation 5')).not.toBeVisible();

  const counts = page.locator('.summary-card strong');

  await expect(counts.nth(0)).toHaveText('0');
  await expect(counts.nth(1)).toHaveText('0');
  await expect(counts.nth(2)).toHaveText('0');
});

test('11 - main devices screen fits mobile width', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844,
  });

  await login(page);
  await page.goto('/devices');

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });

  expect(hasHorizontalOverflow).toBe(false);

  await expect(page.getByRole('heading', { name: 'Devices', exact: true })).toBeVisible();
});

test('12 - dashboard quick actions all work', async ({ page }) => {
  await login(page);

  // Devices
  await page.getByRole('button', { name: 'Devices' }).click();
  await page.waitForURL(/\/devices$/);

  // Schedules
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Schedules' }).click();
  await page.waitForURL(/\/schedules$/);
  await expect(page.getByRole('heading', { name: 'Schedules', exact: true })).toBeVisible();

  // Protection
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Protection' }).click();
  await page.waitForURL(/\/protection$/);
  await expect(page.getByRole('heading', { name: 'Protection', exact: true })).toBeVisible();

  // Pause internet
  await page.goto('/dashboard');

  await page.getByRole('button', { name: 'Pause internet' }).click();

  await expect(page.getByRole('button', { name: 'Resume internet' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Internet is paused' })).toBeVisible();

  // Pause state survives refresh
  await page.reload();

  await expect(page.getByRole('button', { name: 'Resume internet' })).toBeVisible();

  // Resume internet
  await page.getByRole('button', { name: 'Resume internet' }).click();

  await expect(page.getByRole('button', { name: 'Pause internet' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Your network is protected' })).toBeVisible();
});

test('13 - help page is reachable from settings', async ({ page }) => {
  await login(page, { withDevices: false });
  await page.goto('/settings');

  await page.getByRole('link', { name: /How can we help/ }).click();

  await expect(page).toHaveURL(/\/help$/);

  await expect(page.getByRole('heading', { name: 'Help & Support' })).toBeVisible();

  await page.getByRole('button', { name: 'Send request' }).click();

  await expect(page.getByText('Please enter at least 10 characters.')).toBeVisible();

  await page.getByLabel('Message').fill('My living room TV keeps going offline.');

  await page.getByRole('button', { name: 'Send request' }).click();

  await expect(page.getByText('Your support request has been received.')).toBeVisible();
});

test('14 - registration survives an interrupted pairing step', async ({ page }) => {
  const email = uniqueEmail('register-flow');

  await page.goto('/register');

  await page.getByRole('button', { name: 'EN' }).click();

  await page.getByLabel('Full name').fill('Inas Test');

  await page.getByLabel('Email address').fill(email);

  await page.getByLabel('Password', { exact: true }).fill('Fornect2026');

  await page.getByLabel('Confirm password').fill('Fornect2026');

  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/verify-email$/);

  const code = await readVerificationCode(email);

  await page.getByLabel('Verification code').fill(code);

  await page.getByRole('button', { name: 'Verify email' }).click();

  await expect(
    page.getByRole('heading', {
      name: 'Your account is verified',
    }),
  ).toBeVisible();

  // Korisnik prekida flow prije pairinga uređaja.
  await page.goto('/login');

  await page.getByLabel('Email address').fill(email);

  await page.getByLabel('Password').fill('Fornect2026');

  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
});

test('15 - content restrictions can be customized and reset', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.iphone}`);

  const card = page.locator('.settings-card').filter({ hasText: 'Content restrictions' });

  const socialMedia = card
    .locator('.restriction-item')
    .filter({ hasText: 'Block social media' })
    .locator('input');

  // Bedz se gadja klasom: tekst 'Profile defaults' se
  // inace poklopi i sa dugmetom za reset.
  const badge = card.locator('.restrictions-badge');

  await expect(badge).toHaveText('Profile defaults');
  await expect(socialMedia).toBeChecked();

  await socialMedia.uncheck();

  await expect(badge).toHaveText('Customized');

  await page.reload();

  await expect(badge).toHaveText('Customized');
  await expect(socialMedia).not.toBeChecked();

  await card.getByRole('button', { name: 'Reset to profile defaults' }).click();

  await expect(badge).toHaveText('Profile defaults');
  await expect(socialMedia).toBeChecked();
});

test('16 - profile change applies the new restriction preset', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.iphone}`);

  const card = page.locator('.settings-card').filter({ hasText: 'Content restrictions' });

  const adultContent = card
    .locator('.restriction-item')
    .filter({ hasText: 'Block adult content' })
    .locator('input');

  await expect(adultContent).toBeChecked();

  await page.getByRole('button', { name: 'Change profile' }).click();

  await page.getByRole('button', { name: 'Admin', exact: true }).click();

  await expect(adultContent).not.toBeChecked();

  await expect(card.locator('.restrictions-badge')).toHaveText('Profile defaults');
});

test('17 - account without devices sees the pairing empty state', async ({ page }) => {
  await login(page, { withDevices: false });

  await page.goto('/devices');

  await expect(page.getByRole('heading', { name: 'No devices connected' })).toBeVisible();

  await page.getByRole('link', { name: 'Pair Fornect device' }).click();

  await expect(page).toHaveURL(/\/pair-device$/);
});

// Nivo zastite je jedna kontrola sa tri jacine, a certifikat je
// preduslov za najvisu - ne jacina za sebe. Ova cetiri testa
// pokrivaju upravo tu razliku, jer se na njoj vec grijesilo.

// Puna zastita vise ne pocinje instalacijom nego pristankom: forma
// biljezi ko je pristao i na koju verziju politike. Testovi zato
// prolaze kroz nju umjesto da klikaju pravo na instalaciju.
async function giveConsent(page: Page) {
  await page
    .getByLabel('Full name of the person giving consent')
    .fill('Test Guardian');

  await page.getByLabel('Relationship to the device user').fill('parent');

  await page
    .getByLabel('I have read and accept the traffic inspection policy')
    .check();

  await page.getByRole('button', { name: 'Give consent' }).click();
}

function levelOption(page: Page, title: string) {
  return page.locator('.protection-option').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  });
}

test('18 - lowering to standard keeps the certificate installed', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.iphone}/protection`);

  await expect(page.locator('.section-heading h2')).toHaveText('Full Protection');

  await levelOption(page, 'Standard Protection').click();

  await expect(page.locator('.section-heading h2')).toHaveText('Standard Protection');

  // Profil ostaje na uredjaju - to je cijela poenta izmjene.
  await expect(page.getByText('Paired', { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.locator('.section-heading h2')).toHaveText('Standard Protection');

  await expect(page.getByText('Paired', { exact: true })).toBeVisible();
});

test('19 - full protection is locked until the profile is installed', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.tv}/protection`);

  const full = levelOption(page, 'Full Protection');

  await expect(full.locator('.option-lock')).toHaveText('Requires an installed protection profile');

  // Klik ne smije ostati mrtav: vodi u pristanak, pa u instalaciju.
  await full.click();

  await expect(
    page.getByRole('heading', { name: 'Consent to full protection' }),
  ).toBeVisible();

  await giveConsent(page);

  await expect(page.getByText('Waiting for confirmation')).toBeVisible();
});

test('20 - protection can be switched off and back on', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.iphone}/protection`);

  await levelOption(page, 'Off').click();

  await expect(page.locator('.section-heading h2')).toHaveText('Off');

  await page.reload();

  await expect(page.locator('.section-heading h2')).toHaveText('Off');

  await levelOption(page, 'Standard Protection').click();

  await expect(page.locator('.section-heading h2')).toHaveText('Standard Protection');
});

test('21 - offline device raises a notification that can be turned off', async ({ page }) => {
  const seeded = await login(page);

  // PlayStation 5 je offline i ima tinejdzerski profil, pa je
  // pracenje prisutnosti podrazumijevano ukljuceno.
  await page.goto('/notifications');

  await expect(page.getByText('PlayStation 5').first()).toBeVisible();

  await page.goto(`/devices/${seeded.deviceIds.playstation}`);

  const row = page.locator('.restriction-item').filter({
    hasText: 'Notify me when this device is off the network',
  });

  await expect(row.locator('input')).toBeChecked();

  await row.locator('input').uncheck();

  await expect(row.locator('input')).not.toBeChecked();

  await page.reload();

  await expect(row.locator('input')).not.toBeChecked();

  // Obavjestenje prati stvarno stanje, pa nestaje samo.
  await page.goto('/notifications');

  await expect(page.getByText('PlayStation 5')).toHaveCount(0);
});

// Pristanak je dokument, ne prekidac: mora se vidjeti ko ga je dao i
// da li je instalacija stvarno potvrdjena ili samo izjavljena.
test('22 - consent is recorded, shown, and can be withdrawn', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.tv}/protection`);

  await page.getByRole('button', { name: 'Continue with consent' }).click();
  await giveConsent(page);

  await page.getByRole('button', { name: 'Profile installed' }).click();

  const record = page.locator('.consent-record');

  await expect(record).toBeVisible();
  await expect(record).toContainText('Test Guardian');
  await expect(record).toContainText('parent');

  // Potvrdio je covjek, ne uredjaj - i zapis to mora reci.
  await expect(record).toContainText('Confirmed manually');

  await page.reload();

  await expect(page.locator('.consent-record')).toContainText('Test Guardian');

  await page.getByRole('button', { name: 'Withdraw consent' }).click();

  // "Full Protection" postoji i kao naziv kartice nivoa, pa se stanje
  // mora citati iz statusa u zaglavlju, ne iz bilo kojeg naslova.
  await expect(page.locator('.section-heading h2')).toHaveText(
    'Standard Protection',
  );

  // Nakon opoziva certifikat fizicki ostaje na uredjaju, pa korisnik
  // mora dobiti uputstvo kako da ga skine.
  await expect(page.getByText('Remove the certificate from the device')).toBeVisible();
});

// Verifikacija je do sada bila privid: kod je bio zakucan u frontendu,
// pa je bilo ko mogao "potvrditi" tudju adresu. Ovaj test cuva to da
// se ne vrati - pogresan kod mora biti odbijen NA SERVERU.
test('23 - a wrong verification code is rejected', async ({ page }) => {
  const email = uniqueEmail('verify-reject');

  await page.request.post('/api/v1/auth/register', {
    data: { name: 'Verify Test', email, password: PASSWORD },
  });

  const realCode = await readVerificationCode(email);

  const wrongCode = realCode === '000000' ? '111111' : '000000';

  const rejected = await page.request.post('/api/v1/auth/verify-email', {
    data: { email, code: wrongCode },
  });

  expect(rejected.status()).toBe(400);

  // Nalog i dalje nije potvrdjen.
  const stillUnverified = await page.request.post('/api/v1/auth/login', {
    data: { email, password: PASSWORD },
  });

  const body = await stillUnverified.json();

  expect(body.account.email_verified).toBe(false);

  // Pravi kod prolazi...
  const accepted = await page.request.post('/api/v1/auth/verify-email', {
    data: { email, code: realCode },
  });

  expect(accepted.ok()).toBe(true);
  expect((await accepted.json()).email_verified).toBe(true);

  // ...ali samo jednom: iskoristen kod se ponistava.
  const reused = await page.request.post('/api/v1/auth/verify-email', {
    data: { email, code: realCode },
  });

  expect((await reused.json()).already_verified).toBe(true);
});

// Red "Novi uredjaji" (Zadatak 1, Tacka 5). Uredjaji bez ekrana nikad
// nece sami otvoriti captive portal, pa je ovo jedino mjesto na kojem
// ce vlasnik primijetiti uredjaj koji ne prepoznaje.
test('24 - unclassified devices are queued for a decision', async ({ page }) => {
  await login(page);

  // Tri zasijana uredjaja su `unpaired` - niko im jos nije odlucio
  // zastitu. iPhone je uparen, pa ne ulazi u red.
  const banner = page.locator('.new-devices-banner');

  await expect(banner).toBeVisible();
  await expect(banner.locator('.new-devices-count')).toHaveText('3');

  await banner.click();

  await expect(page).toHaveURL(/\/new-devices$/);
  await expect(page.locator('.queue-item')).toHaveCount(3);

  // Osnovna zastita skida uredjaj sa reda. Pristup mu se ne mijenja -
  // gost i neklasifikovan uredjaj oba imaju DNS zastitu; mijenja se
  // samo to da prestaje biti otvoreno pitanje.
  await page
    .locator('.queue-item')
    .filter({ hasText: 'Unknown device' })
    .getByRole('button', { name: 'Basic protection' })
    .click();

  await expect(page.locator('.queue-item')).toHaveCount(2);

  await page.reload();

  await expect(page.locator('.queue-item')).toHaveCount(2);
});

// Zadatak 1, Oblast C trazi da se domet zastite navede iskreno, sa
// stvarnim brojkama i granicama. Alen to vezuje za njemacki UWG i
// rizik od Abmahnunga, pa ovo nije kozmetika nego pravna izlozenost —
// test postoji da tvrdnja ne moze tiho nestati iz teksta.
test('25 - protection coverage is stated honestly, with limits', async ({ page }) => {
  const seeded = await login(page);
  await page.goto(`/devices/${seeded.deviceIds.iphone}/protection`);

  const standard = levelOption(page, 'Standard Protection');
  const full = levelOption(page, 'Full Protection');

  await expect(standard).toContainText('64%');
  await expect(full).toContainText('70–85%');

  // Brojka bez granica je obecanje. Granice moraju stajati uz nju.
  const note = page.locator('.coverage-note');

  await expect(note).toContainText('No level stops everything');
  await expect(note).toContainText('QUIC/HTTP3');

  // Brojac blokiranih reklama mora reci sta NE broji.
  await expect(page.locator('.ads-note')).toContainText('DNS level');

  // Nigdje se ne smije tvrditi potpuna zastita.
  await expect(page.getByText('100%')).toHaveCount(0);

  // Zadatak 1, Oblast C: kozmeticko filtriranje NIJE dio POC obecanja i
  // mora stajati kao ogranicenje. Bez ovoga "blokiranih reklama: 128"
  // korisnik cita kao "128 reklama nisam vidio", a DNS blokira zahtjev,
  // ne uklanja element sa stranice.
  await expect(page.getByText('ads are not removed from the page')).toBeVisible();
});

// Obavjestenja su do sada zivjela u localStorage-u pregledaca i
// nastajala tek kad bi neko otvorio listu. To je znacilo da funkcija
// koju smo obecali ("javicemo kad uredjaj napusti mrezu") u stvari
// nije radila: roditelj koji aplikaciju ne otvori nocu ne bi dobio
// nista, a da se uredjaj do jutra vratio, obavjestenje ne bi ni
// nastalo. Ovaj test cuva da se to ne vrati.
test('26 - leaving the network during bedtime is recorded on the server', async ({
  page,
  browser,
}) => {
  const seeded = await login(page);
  const { token, account } = await apiLogin(page, seeded.email);

  const headers = { Authorization: `Bearer ${token}` };

  // Raspored se namjesta oko trenutnog vremena, da test ne zavisi od
  // sata u kojem se pokrece. Svi dani su izabrani iz istog razloga.
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const end = new Date(now.getTime() + 60 * 60 * 1000);

  const pad = (value: number) => String(value).padStart(2, '0');

  await page.request.patch(`/api/v1/app/network-devices/${seeded.deviceIds.iphone}`, {
    headers,
    data: {
      schedule: {
        enabled: true,
        mode: 'sameEveryDay',
        startHour: pad(start.getHours()),
        startMinute: pad(start.getMinutes()),
        endHour: pad(end.getHours()),
        endMinute: pad(end.getMinutes()),
        days: WEEK_ORDER.map((label) => ({
          label,
          selected: true,
          startHour: pad(start.getHours()),
          startMinute: pad(start.getMinutes()),
          endHour: pad(end.getHours()),
          endMinute: pad(end.getMinutes()),
        })),
      },
    },
  });

  // Uredjaj nestaje sa mreze. Nista vise nije otvoreno u pregledacu
  // sto bi obavjestenje moglo napraviti - pravi ga server.
  await page.request.patch(`/api/v1/app/network-devices/${seeded.deviceIds.iphone}`, {
    headers,
    data: { online: false },
  });

  await page.goto('/notifications');

  // Provjerava se obavjestenje O iPHONEU, ne bilo koje. Pocetni podaci
  // imaju i PlayStation, koji je namjerno van mreze (test 21) i ima
  // raspored 22:00-08:00 radnim danom. Pokrenut u tom vremenu, i on je
  // stvarno "napustio mrezu za vrijeme spavanja" - server ispravno
  // pravi i to obavjestenje, a nevezan lokator nadje dva i padne.
  // Raspored iPhonea je namjesten oko trenutnog vremena; pocetni podaci
  // nisu, i to se dugo nije vidjelo jer se testovi nisu pokretali nocu.
  const iphoneNotice = page
    .getByRole('article')
    .filter({ hasText: "Amar's iPhone" })
    .filter({ hasText: 'Device left the network during bedtime' });

  await expect(iphoneNotice).toBeVisible();

  // Vrijeme je stvarno, a ne dio teksta. Ranije je pisalo "1 hour ago"
  // i sedmicu kasnije.
  await expect(iphoneNotice.locator('.notification-time')).toHaveText(
    /just now|\d+ min ago|today at \d{2}:\d{2}/,
  );

  await expect(page.getByText('1 hour ago')).toHaveCount(0);

  // Dokaz da zapis nije u pregledacu: drugi kontekst, prazan
  // localStorage, u njega se upisuje samo sesija - a obavjestenje je
  // i dalje tu.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();

  await freshPage.goto('/login');

  await freshPage.evaluate(
    ({ sessionJson, accountId }) => {
      localStorage.clear();
      localStorage.setItem('fornect-auth-session', sessionJson);
      localStorage.setItem(
        `fornect-account-preferences-${accountId}`,
        JSON.stringify({ language: 'en' }),
      );
    },
    {
      sessionJson: JSON.stringify({
        token,
        user: {
          id: account.id,
          name: account.name,
          email: account.email,
          accountId: account.id,
        },
      }),
      accountId: account.id,
    },
  );

  await freshPage.goto('/notifications');

  await expect(
    freshPage
      .getByRole('article')
      .filter({ hasText: "Amar's iPhone" })
      .getByText('Device left the network during bedtime'),
  ).toBeVisible();

  await fresh.close();
});

// Zadatak 1, Tacka 4, sloj L1: licenca hub-a pokriva odredjen broj
// uredjaja. Do sada je panel na to samo upozoravao trakom, i to po
// granici koju je sam izmislio - zakucanih 20, cak i za nalog koji
// nema nijedan hub. Sada granicu daje hub, a server racuna ko je
// preko nje.
//
// Hub se registruje kroz registerHub() — vidi tamo zasto, i sta uraditi
// kad udari granica registracija po satu.
test('27 - devices beyond the licence are named, and a freed slot is noticed', async ({
  page,
}) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);

  const headers = { Authorization: `Bearer ${token}` };

  // Hub sa kapacitetom 2, uparen sa ovim nalogom. Nalog vec ima 4
  // uredjaja, dakle dva su preko licence.
  await registerHub(page, headers, { name: 'Test hub', capacity: 2 });

  await page.goto('/devices');

  await expect(page.getByText('Licence capacity exceeded')).toBeVisible();

  await page.getByRole('link', { name: 'See details' }).click();

  await expect(page).toHaveURL(/\/capacity$/);

  await expect(page.getByText('Beyond the licence: 2')).toBeVisible();

  const overflow = page.locator('.overflow-list');

  // Preko licence su dva najkasnije zavedena uredjaja, a ne bilo koja
  // dva - redoslijed pojavljivanja odlucuje ko je unutra.
  await expect(overflow).toContainText('PlayStation 5');
  await expect(overflow).toContainText('Unknown device');
  await expect(overflow).not.toContainText("Amar's iPhone");

  // Granica se ne smije precutati, ali ni pogresno navesti. Zadatak 1,
  // Tacka 4, sloj L1: limit se primjenjuje pri REGISTRACIJI uredjaja, u
  // panelu — ne u DNS-u ni u proxyju.
  await expect(
    page.getByText('The limit is enforced when a device is registered', {
      exact: false,
    }),
  ).toBeVisible();

  // Prekoracenje se racuna, a ne pamti: brisanje jednog uredjaja
  // oslobadja mjesto i sljedeci ulazi u licencu.
  const deleteResponse = await page.request.delete(
    `/api/v1/app/network-devices/${seeded.deviceIds.iphone}`,
    { headers },
  );

  expect(deleteResponse.ok()).toBeTruthy();

  await page.goto('/capacity');

  await expect(page.getByText('Beyond the licence: 1')).toBeVisible();
});

// Kontrakt iz Zadatka 1, Tacka 5: hub salje evente ka cloud-u i oni su
// ULAZ za red "Novi uredjaji". Red je postojao od ranije, ali ga je
// punio iskljucivo panel — hub je mogao vidjeti nepoznat uredjaj na
// mrezi a da vlasnik za njega nikad ne sazna.
//
// Hub se registruje kroz registerHub() — vidi tamo zasto, i sta uraditi
// kad udari granica registracija po satu.
test('28 - the hub can report a new device, and a repeat does not duplicate it', async ({
  page,
}) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);

  const headers = { Authorization: `Bearer ${token}` };

  const hub = await registerHub(page, headers, { name: 'Event hub' });

  const hubHeaders = { Authorization: `Bearer ${hub.token}` };
  const mac = '02:00:00:00:09:01';

  const newDeviceEvent = {
    event_id: 'ev-new-1',
    type: 'device.new',
    mac,
    name: 'Kuhinjski tablet',
    device_type: 'unknown',
    at: new Date().toISOString(),
  };

  const first = await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: { events: [newDeviceEvent] },
  });

  expect((await first.json()).results[0].status).toBe('applied');

  // Mreza pada, pa uredjaj koji ne dobije odgovor MORA smjeti poslati
  // isto ponovo. Drugi put se prepoznaje kao ponavljanje.
  const again = await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: { events: [newDeviceEvent] },
  });

  expect((await again.json()).results[0].status).toBe('duplicate');

  await page.goto('/new-devices');

  await expect(page.getByText('Kuhinjski tablet')).toHaveCount(1);

  // Uredjaj sa praznim pristankom ne smije proci: prazan potpis je
  // gori od nikakvog, jer izgleda kao dokaz a nije.
  const emptyConsent = await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: {
      events: [
        {
          event_id: 'ev-bad-1',
          type: 'device.classified',
          mac,
          state: 'consented',
          consent: {},
        },
      ],
    },
  });

  expect((await emptyConsent.json()).results[0].status).toBe('rejected');

  // Izjasnjavanje kroz portal skida uredjaj sa reda.
  await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: {
      events: [
        {
          event_id: 'ev-class-1',
          type: 'device.classified',
          mac,
          state: 'guest',
          method: 'portal',
        },
      ],
    },
  });

  await page.goto('/new-devices');

  await expect(page.getByText('Kuhinjski tablet')).toHaveCount(0);
});

// Stavka 1.2: tekst i brend portala se ureduju u panelu i STVARNO
// stizu na uredjaj. Do sada je editor postojao samo za hospitality mod
// i pisao u localStorage — korisnik unese tekst, vidi "sacuvano", a na
// uredjaj ne ode nista.
test('29 - portal text is edited in the panel and the hub pulls exactly that', async ({
  page,
}) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);

  const headers = { Authorization: `Bearer ${token}` };

  const hub = await registerHub(page, headers, { name: 'Portal hub' });

  const hubHeaders = { Authorization: `Bearer ${hub.token}` };

  // Prazan naslov bi ostavio portal bez ijedne recenice objasnjenja.
  const empty = await page.request.put('/api/v1/app/portal-settings', {
    headers,
    data: { welcome_title_bs: '   ' },
  });

  expect(empty.status()).toBe(400);

  // Predugacak tekst se ne prima: ovo zavrsi na ekranu telefona iza
  // captive portala.
  const tooLong = await page.request.put('/api/v1/app/portal-settings', {
    headers,
    data: { welcome_title_bs: 'x'.repeat(200) },
  });

  expect(tooLong.status()).toBe(400);

  await page.goto('/portal-branding');

  await page.locator('input[name="brandName"]').fill('Hotel Neretva');
  await page.locator('input[name="titleBs"]').fill('Dobrodošli u Hotel Neretva');

  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText(/Devices will pick up version/)).toBeVisible();

  // Pregled prikazuje ono sto je uneseno.
  await expect(page.locator('.preview')).toContainText('Hotel Neretva');

  // I ono sto je najvaznije: hub povlaci bas taj tekst.
  const bundleResponse = await page.request.get(
    `/api/v1/devices/${hub.id}/portal-bundle`,
    { headers: hubHeaders },
  );

  const bundle = await bundleResponse.json();

  expect(bundle.config.brandName).toBe('Hotel Neretva');
  expect(bundle.config.welcomeTitle.bs).toBe('Dobrodošli u Hotel Neretva');

  // Engleski nije diran, pa je ostao podrazumijevani — portal govori
  // jezikom gosta i oba moraju postojati.
  expect(bundle.config.welcomeTitle.en).toBe('Welcome to a protected network');

  // Hub koji vec ima ovu verziju ne povlaci isti paket ponovo.
  const unchanged = await page.request.get(
    `/api/v1/devices/${hub.id}/portal-bundle?version=${bundle.version}`,
    { headers: hubHeaders },
  );

  expect(unchanged.status()).toBe(304);
});

// Zadatak 1, Tacka 6: Fleet / OTA.
//
// Pomocna funkcija, jer sva tri testa ispod trebaju nalog sa uparenim
// hub-om i jednim uredjajem na mrezi.
async function seedHub(page: Page, email: string, token: string) {
  const headers = { Authorization: `Bearer ${token}` };

  const hub = await registerHub(page, headers, { name: 'Fleet hub', capacity: 10 });

  // Jedan uparen uredjaj, da se vidi da OTA izmjena ne obrise MAC-ove.
  await page.request.post('/api/v1/app/network-devices', {
    headers,
    data: {
      mac_address: 'AA:BB:CC:00:11:22',
      name: 'Telefon',
      type: 'phone',
      pairing_state: 'paired',
    },
  });

  return { hub, headers, hubHeaders: { Authorization: `Bearer ${hub.token}` } };
}

test('30 - OTA settings reach the device without dropping consented MACs', async ({
  page,
}) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);
  const { hub, headers, hubHeaders } = await seedHub(page, seeded.email, token);

  const before = await (
    await page.request.get(`/api/v1/devices/${hub.id}/config`, { headers: hubHeaders })
  ).json();

  // seedHub je uredjaj zaveo VELIKIM slovima; uredjaj dobija jedini
  // oblik koji sistem cuva (services/mac.ts). Da ovdje stoje velika
  // slova, hub bi dobio MAC koji ne odgovara onome sto sam vidi.
  expect(before.config_json.consented_macs).toContain('aa:bb:cc:00:11:22');

  await page.goto('/fleet');

  // Prsten se bira klikom; ekran salje izmjenu odmah.
  await page.getByRole('button', { name: 'First 5%', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const after = await (
    await page.request.get(`/api/v1/devices/${hub.id}/config`, { headers: hubHeaders })
  ).json();

  expect(after.config_json.ota.ring).toBe('early');

  // OVO je poenta testa. Config je JEDAN objekat koji uredjaj uzima
  // cijeli; parcijalan upis OTA postavki bi tiho obrisao MAC adrese i
  // uredjaj bi ostao bez zastite, bez ijedne greske u logu.
  expect(after.config_json.consented_macs).toContain('aa:bb:cc:00:11:22');

  // Verzija configa je porasla, jer se sadrzaj promijenio.
  expect(after.version).toBeGreaterThan(before.version);

  // Prozor odrzavanja nosi i vremensku zonu: "02:00 lokalno" uredjaju
  // ne znaci nista bez nje.
  expect(after.config_json.ota.maintenance_window.timezone).toBeTruthy();

  // Isti config se ne upisuje ponovo — ponovni klik na isti prsten ne
  // smije podici verziju.
  await page.getByRole('button', { name: 'First 5%', exact: true }).click();

  const again = await (
    await page.request.get(`/api/v1/devices/${hub.id}/config`, { headers: hubHeaders })
  ).json();

  expect(again.version).toBe(after.version);

  // Prozor nulte duzine nije prozor.
  const zeroWindow = await page.request.put(`/api/v1/app/fleet/${hub.id}/ota`, {
    headers,
    data: { maintenance_start: '02:00', maintenance_end: '02:00' },
  });

  expect(zeroWindow.status()).toBe(400);
});

test('31 - a bad filter list set can be rolled back in one click', async ({ page }) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);
  const { hub, headers, hubHeaders } = await seedHub(page, seeded.email, token);

  // Lista preko obicnog http-a se ne prima: nju neko na putu moze
  // zamijeniti, a ona odlucuje i sta se NE blokira.
  const insecure = await page.request.put(`/api/v1/app/fleet/${hub.id}/lists`, {
    headers,
    data: { urls: ['http://lists.example.com/ads.txt'], label: 'Nesigurna' },
  });

  expect(insecure.status()).toBe(400);

  // Zadatak 1, Oblast C i Tacka 1: Ultimate i TIF su zabranjeni na Home
  // liniji — prevelike su za 2 GB, a Pi-hole bez memorije obori internet
  // cijeloj mrezi. seedHub pravi Home hub, pa se ovo provjerava ovdje:
  // novi test sa svojim hubom prebacio bi zadani limit registracija.
  const hagezi = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard';
  const ultimate = `${hagezi}/ultimate.txt`;
  const tif = `${hagezi}/tif.medium.txt`;

  const tooLarge = await page.request.put(`/api/v1/app/fleet/${hub.id}/lists`, {
    headers,
    data: { urls: [`${hagezi}/pro.txt`, ultimate, tif], label: 'Previse' },
  });

  expect(tooLarge.status()).toBe(400);

  const refusal = await tooLarge.json();

  expect(refusal.code).toBe('list-too-large-for-home');

  // Kaze TACNO koje su odbijene; Pro, koji je dozvoljen, nije medju njima.
  expect(refusal.urls).toEqual([ultimate, tif]);

  await page.request.put(`/api/v1/app/fleet/${hub.id}/lists`, {
    headers,
    data: { urls: ['https://lists.example.com/dobra.txt'], label: 'Dobra lista' },
  });

  await page.request.put(`/api/v1/app/fleet/${hub.id}/lists`, {
    headers,
    data: { urls: ['https://lists.example.com/losa.txt'], label: 'Losa lista' },
  });

  await page.goto('/fleet');

  // Isto odbijanje u panelu, na jeziku korisnika a ne sa servera.
  await page.getByRole('button', { name: 'Edit lists' }).click();

  const editor = page.locator('.block', { has: page.locator('textarea') });

  await editor.locator('textarea').fill(ultimate);
  await editor.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.locator('#fleet-error')).toContainText('not allowed on a Home device');
  await expect(page.locator('#fleet-error')).toContainText('ultimate.txt');

  await editor.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByText('Losa lista')).toBeVisible();

  await page.getByRole('button', { name: 'Restore previous set' }).click();

  await expect(page.getByText('Dobra lista')).toBeVisible();
  await expect(page.getByText('This is a restored earlier set.')).toBeVisible();

  // Uredjaj dobija vracen set.
  const config = await (
    await page.request.get(`/api/v1/devices/${hub.id}/config`, { headers: hubHeaders })
  ).json();

  expect(config.config_json.filter_lists.urls).toEqual([
    'https://lists.example.com/dobra.txt',
  ]);

  // Historija pamti SVA tri koraka. Rollback koji obrise trag rollbacka
  // ne moze odgovoriti na pitanje "sta je bilo aktivno i od kada".
  const history = await (
    await page.request.get(`/api/v1/app/fleet/${hub.id}/lists`, { headers })
  ).json();

  expect(history).toHaveLength(3);
  expect(history[0].source).toBe('rollback');
  expect(history[0].restored_from).toBe(history[2].id);
});

test('32 - the fleet screen says what the device does not report', async ({ page }) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);
  const { hub, hubHeaders } = await seedHub(page, seeded.email, token);

  await page.goto('/fleet');

  // Uredjaj jos nije poslao verzije. Prazna tabela bi izgledala kao da
  // je sve u redu, pa ekran mora reci da podatka nema.
  await expect(page.locator('#versions-pending')).toContainText(
    'does not report versions yet',
  );

  // Zdravstveni pregled se ne crta iz niceg, i ekran to kaze naglas.
  await expect(page.getByText('What is deliberately not here')).toBeVisible();

  // Kad uredjaj posalje verzije, prikazuju se tacno one koje je poslao.
  await page.request.post(`/api/v1/devices/${hub.id}/heartbeat`, {
    headers: hubHeaders,
    data: { stats: {}, versions: { fornectd: '0.4.1', pihole: '6.0.2' } },
  });

  await page.reload();

  await expect(page.locator('#versions-pending')).toHaveCount(0);
  await expect(page.getByText('0.4.1')).toBeVisible();
  await expect(page.getByText('6.0.2')).toBeVisible();

  // Heartbeat bez verzija ih NE brise: uredjaj na starijem agentu ne
  // smije ostaviti panel da misli da nista nije poznato.
  await page.request.post(`/api/v1/devices/${hub.id}/heartbeat`, {
    headers: hubHeaders,
    data: { stats: {} },
  });

  await page.reload();

  await expect(page.getByText('0.4.1')).toBeVisible();
});

test('33 - the owner is told about a new device and a failed consent', async ({ page }) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);
  const { hub, headers, hubHeaders } = await seedHub(page, seeded.email, token);

  const mac = '02:00:00:00:33:01';

  await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: {
      events: [
        {
          event_id: 'ev-33-new',
          type: 'device.new',
          mac,
          name: 'Nepoznat tablet',
          device_type: 'unknown',
          at: new Date().toISOString(),
        },
      ],
    },
  });

  await page.goto('/notifications');

  // Do sada je hub ovo uredno upisivao u red "Novi uredjaji", ali je
  // vlasnik za to saznavao samo ako bi sam otvorio taj ekran.
  await expect(page.getByText('New device on the network')).toBeVisible();
  await expect(page.getByText(/Nepoznat tablet/)).toBeVisible();

  // Ponovljen event ne pravi drugo obavjestenje o istom uredjaju: hub
  // koji ponovo digne mrezu javi sve sto vidi, i to nije greska.
  await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: {
      events: [
        {
          event_id: 'ev-33-new-again',
          type: 'device.new',
          mac,
          name: 'Nepoznat tablet',
          at: new Date().toISOString(),
        },
      ],
    },
  });

  await page.reload();

  await expect(page.getByText('New device on the network')).toHaveCount(1);

  // Kad odluka padne, pitanje nestaje. Lista koja nudi odluku o
  // uredjaju o kojem je odluka vec pala tjera covjeka da otvori ekran
  // i vidi da nema sta da radi.
  await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: {
      events: [
        {
          event_id: 'ev-33-guest',
          type: 'device.classified',
          mac,
          state: 'guest',
          method: 'auto',
          at: new Date().toISOString(),
        },
      ],
    },
  });

  await page.reload();

  await expect(page.getByText('New device on the network')).toHaveCount(0);

  // Drugi dio: pristanak dat, instalacija pala.
  //
  // Hub salje malim slovima, a seedHub je uredjaj zaveo VELIKIM — tacno
  // ono sto je ovaj test prvi put otkrio: bez normalizacije MAC adrese
  // hub taj uredjaj nije mogao naci.
  const consentMac = 'aa:bb:cc:00:11:22';

  const consentBatch = await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: {
      events: [
        {
          event_id: 'ev-33-consent',
          type: 'device.classified',
          mac: consentMac,
          state: 'consented',
          method: 'portal',
          consent: { guardian_name: 'Amra H.', guardian_relation: 'Majka' },
          at: new Date().toISOString(),
        },
        {
          event_id: 'ev-33-failed',
          type: 'consent.verify_failed',
          mac: consentMac,
          error: 'Certifikat nije prepoznat.',
          at: new Date().toISOString(),
        },
      ],
    },
  });

  // Ishod SVAKOG eventa se provjerava. Bez ovoga odbijen event izgleda
  // kao obavjestenje koje nije stiglo — i trazi se na pogresnom mjestu.
  const outcomes = (await consentBatch.json()).results;

  expect(outcomes.map((r: { status: string; reason?: string }) => [r.status, r.reason])).toEqual([
    ['applied', undefined],
    ['applied', undefined],
  ]);

  await page.reload();

  // Ovo je rupa koja se zatvara: bez javljanja covjek ostaje u
  // uvjerenju da je puna zastita ukljucena, a nije.
  await expect(page.getByText('Full protection is not on')).toBeVisible();

  // Kad instalacija na kraju prodje, poruka nestaje — ne stoji kao
  // trajna optuzba.
  const devices = await (
    await page.request.get('/api/v1/app/network-devices', { headers })
  ).json();

  const consented = devices.find(
    (device: { mac_address: string }) => device.mac_address === consentMac,
  );

  await page.request.post(
    `/api/v1/app/network-devices/${consented.id}/consent/verify`,
    { headers, data: { success: true, manual: true } },
  );

  await page.reload();

  await expect(page.getByText('Full protection is not on')).toHaveCount(0);
});

test('34 - one device is one device, however its MAC address is typed', async ({ page }) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);
  const { hub, headers, hubHeaders } = await seedHub(page, seeded.email, token);

  // Vlasnik kopira MAC iz Windowsa: velika slova, crtice.
  const created = await page.request.post('/api/v1/app/network-devices', {
    headers,
    data: { mac_address: 'AA-BB-CC-00-44-01', name: 'Laptop', type: 'unknown' },
  });

  expect(created.status()).toBe(201);

  // Cuva se u jednom obliku.
  expect((await created.json()).mac_address).toBe('aa:bb:cc:00:44:01');

  // Hub javi isti uredjaj kao nov, svojim oblikom.
  const reported = await page.request.post(`/api/v1/devices/${hub.id}/events`, {
    headers: hubHeaders,
    data: {
      events: [
        {
          event_id: 'ev-34-new',
          type: 'device.new',
          mac: 'aa:bb:cc:00:44:01',
          name: 'Laptop',
          at: new Date().toISOString(),
        },
        {
          event_id: 'ev-34-guest',
          type: 'device.classified',
          mac: 'aa:bb:cc:00:44:01',
          state: 'guest',
          method: 'auto',
          at: new Date().toISOString(),
        },
      ],
    },
  });

  // Hub ga NALAZI. Prije ove izmjene drugi event bi bio odbijen kao
  // "nije zaveden na nalogu".
  const outcomes = (await reported.json()).results;

  expect(outcomes.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied']);

  // I sto je vaznije: to je i dalje JEDAN uredjaj. Ranije bi ovdje
  // nastao drugi red — isti laptop dva puta u listi, i dva mjesta u
  // licenci.
  const devices = await (
    await page.request.get('/api/v1/app/network-devices', { headers })
  ).json();

  const laptops = devices.filter(
    (device: { mac_address: string }) => device.mac_address === 'aa:bb:cc:00:44:01',
  );

  expect(laptops).toHaveLength(1);
  expect(laptops[0].pairing_state).toBe('guest');

  // Nesto sto nije MAC adresa se ne prima ni sa jedne strane.
  const garbage = await page.request.post('/api/v1/app/network-devices', {
    headers,
    data: { mac_address: 'nije-mac', name: 'Pokvaren unos' },
  });

  expect(garbage.status()).toBe(400);
});

// Direktan pristup bazi, SAMO iz testova i samo za ono sto nijedna ruta
// ne smije uraditi.
//
// Pristanak na stariju verziju politike je upravo takav slucaj: verzija
// je konstanta u kodu (services/consent-policy.ts) i mijenja se novim
// releaseom, a ne pozivom. Ruta koja bi to dozvolila bila bi ruta za
// falsifikovanje traga pristanka. Isto nacelo kao kod koda za
// verifikaciju, koji testovi citaju iz server/.mail-outbox jer ga
// nijedna ruta ne smije vratiti.
//
// `pg` se uzima iz server/node_modules, a DATABASE_URL iz server/.env —
// iste koje koristi backend, pa test ne moze gledati u drugu bazu.
async function withDatabase<T>(
  work: (query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>) => Promise<T>,
): Promise<T> {
  const serverDir = path.resolve(process.cwd(), 'server');

  let connectionString = process.env['DATABASE_URL'];

  if (!connectionString) {
    const line = fs
      .readFileSync(path.join(serverDir, '.env'), 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.startsWith('DATABASE_URL='));

    if (!line) {
      throw new Error('DATABASE_URL nije pronadjen u server/.env.');
    }

    connectionString = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }

  const { Client } = createRequire(path.join(serverDir, 'package.json'))('pg');
  const client = new Client({ connectionString });

  await client.connect();

  try {
    return await work((sql, params) => client.query(sql, params));
  } finally {
    await client.end();
  }
}

test('35 - devices whose consent predates the current policy are listed together', async ({
  page,
}) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);
  const headers = { Authorization: `Bearer ${token}` };

  // Bez huba: pristanak ne trazi hub, a svaka registracija trosi jedno
  // od malo dozvoljenih mjesta po satu (vidi registerHub).
  const ids: string[] = [];

  for (const [mac, name] of [
    ['02:00:00:00:35:01', 'Tablet Lejla'],
    ['02:00:00:00:35:02', 'Telefon Adi'],
  ]) {
    const created = await page.request.post('/api/v1/app/network-devices', {
      headers,
      data: { mac_address: mac, name, type: 'phone' },
    });

    expect(created.status()).toBe(201);

    const device = await created.json();

    const granted = await page.request.post(
      `/api/v1/app/network-devices/${device.id}/consent`,
      { headers, data: { guardian_name: 'Amra H.', guardian_relation: 'Majka' } },
    );

    expect(granted.status()).toBe(201);

    ids.push(device.id);
  }

  await page.goto('/notifications');

  // Oba pristanka su na vazecoj verziji — nema sta javiti.
  await expect(page.getByText('Consent needs renewing')).toHaveCount(0);

  // Politika dobija novu verziju. U stvarnosti je to novi release; ovdje
  // oba zapisa "ostare" direktno u bazi, jer to nijedna ruta ne smije.
  await withDatabase((query) =>
    query(
      `UPDATE consent_records SET policy_version = '0.9'
       WHERE network_device_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
      [ids],
    ),
  );

  await page.reload();

  // Jedno obavjestenje, oba uredjaja po imenu — vlasnik ne mora otvarati
  // svaki uredjaj da sazna koji trazi ponovno prihvatanje.
  await expect(page.getByText('Consent needs renewing')).toHaveCount(1);
  await expect(page.getByText(/earlier terms \(2\)/)).toBeVisible();
  await expect(page.getByText(/Tablet Lejla, Telefon Adi/)).toBeVisible();

  // Jedan obnovi pristanak. Broj se MORA promijeniti — obavjestenje koje
  // i dalje kaze "2" kad je ostao jedan je upravo greska na koju je
  // servis pazio (createNotification preskace upis kad isto vec stoji).
  await page.request.post(`/api/v1/app/network-devices/${ids[0]}/consent`, {
    headers,
    data: { guardian_name: 'Amra H.', guardian_relation: 'Majka' },
  });

  await page.reload();

  await expect(page.getByText('Consent needs renewing')).toHaveCount(1);
  await expect(page.getByText(/earlier terms \(1\)/)).toBeVisible();
  await expect(page.getByText(/Tablet Lejla/)).toHaveCount(0);

  // I kad obnovi i drugi, obavjestenja vise nema.
  await page.request.post(`/api/v1/app/network-devices/${ids[1]}/consent`, {
    headers,
    data: { guardian_name: 'Amra H.', guardian_relation: 'Majka' },
  });

  await page.reload();

  await expect(page.getByText('Consent needs renewing')).toHaveCount(0);

  // Stari pristanci nisu obrisani nego zatvoreni, sa razlogom — trag
  // revizije mora pokazati i sta je bilo prije.
  const history = await withDatabase((query) =>
    query(
      `SELECT policy_version, revoked_reason FROM consent_records
       WHERE network_device_id = ANY($1::uuid[])
       ORDER BY granted_at`,
      [ids],
    ),
  );

  expect(history.rows.filter((row) => row.policy_version === '0.9')).toHaveLength(2);
  expect(history.rows.every((row) => row.policy_version !== '0.9' || row.revoked_reason)).toBe(
    true,
  );
});

test('36 - group commands pause a ring and undo a list set only where it is active', async ({
  page,
}) => {
  const seeded = await login(page);
  const { token } = await apiLogin(page, seeded.email);
  const headers = { Authorization: `Bearer ${token}` };

  // Dva huba na istom nalogu — grupne komande se sa jednim ni ne prikazuju.
  const sarajevo = await registerHub(page, headers, { name: 'Hub Sarajevo' });
  const mostar = await registerHub(page, headers, { name: 'Hub Mostar' });

  const setLists = (id: string, urls: string[], label: string) =>
    page.request.put(`/api/v1/app/fleet/${id}/lists`, { headers, data: { urls, label } });

  const configOf = async (hub: RegisteredHub) =>
    (
      await (
        await page.request.get(`/api/v1/devices/${hub.id}/config`, {
          headers: { Authorization: `Bearer ${hub.token}` },
        })
      ).json()
    ).config_json;

  // Sarajevo: dobra lista, pa losa. Mostar: svoja, losa do njega nije
  // ni stigla. To je upravo slucaj u kojem bi "vrati prethodni svima"
  // na Mostaru ponistio dobru izmjenu.
  await setLists(sarajevo.id, ['https://lists.example.com/dobra.txt'], 'Dobra lista');
  await setLists(sarajevo.id, ['https://lists.example.com/losa.txt'], 'Losa lista');
  await setLists(mostar.id, ['https://lists.example.com/mostar.txt'], 'Mostarska lista');

  await page.request.put(`/api/v1/app/fleet/${sarajevo.id}/ota`, {
    headers,
    data: { ota_ring: 'bench' },
  });

  await page.goto('/fleet');

  const results = page.locator('#group-results');

  // --- Kill-switch za cijeli nalog.
  await page.getByRole('button', { name: 'Pause group' }).click();

  await expect(results).toContainText('Hub Sarajevo: done');
  await expect(results).toContainText('Hub Mostar: done');
  await expect(page.getByText('Updates paused', { exact: true })).toHaveCount(2);

  // I to je stiglo do uredjaja, ne samo na ekran.
  expect((await configOf(sarajevo)).ota.paused).toBe(true);
  expect((await configOf(mostar)).ota.paused).toBe(true);

  // --- Nastavak samo za klupu.
  await page.locator('#group-ring').selectOption('bench');
  await page.getByRole('button', { name: 'Resume group' }).click();

  await expect(results).toContainText('Hub Sarajevo: done');
  await expect(results).not.toContainText('Hub Mostar');
  await expect(page.getByText('Updates paused', { exact: true })).toHaveCount(1);

  expect((await configOf(sarajevo)).ota.paused).toBe(false);
  expect((await configOf(mostar)).ota.paused).toBe(true);

  // --- Ponistavanje seta na cijelom nalogu.
  await page.locator('#group-ring').selectOption('');
  await page
    .locator('#group-set')
    .selectOption(JSON.stringify(['https://lists.example.com/losa.txt']));

  await page.getByRole('button', { name: 'Undo set on group' }).click();

  await expect(results).toContainText('Hub Sarajevo: done');

  // OVO je poenta. Mostar nije imao losu listu, pa se ne dira — i to se
  // kaze, ne precutkuje.
  await expect(results).toContainText(
    'Hub Mostar: skipped — another set is active on the device',
  );

  expect((await configOf(sarajevo)).filter_lists.urls).toEqual([
    'https://lists.example.com/dobra.txt',
  ]);

  expect((await configOf(mostar)).filter_lists.urls).toEqual([
    'https://lists.example.com/mostar.txt',
  ]);

  // Grupni rollback bez navedenog seta server odbija: to bi bilo upravo
  // "vrati prethodni svima".
  const blind = await page.request.post('/api/v1/app/fleet/bulk', {
    headers,
    data: { action: 'rollback-lists', ring: null },
  });

  expect(blind.status()).toBe(400);
});
