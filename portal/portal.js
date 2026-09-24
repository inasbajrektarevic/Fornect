/*
 * Captive portal — Zadatak 1, Tačka 5.
 *
 * Ovo se servira sa samog Fornect uređaja (fornectd), uređaju koji se
 * tek pojavio na mreži. Zadatak portala je jedan: da vlasnik uređaja
 * donese odluku o zaštiti, i da ta odluka bude zapisana kao odluka, a
 * ne kao klik.
 *
 * Tri stvari koje ovdje NAMJERNO nisu urađene lakše:
 *
 *   Nema dugmeta "instalirao sam certifikat". U panelu takvo dugme
 *   postoji i zapis se označi kao `manual`, jer tamo stoji čovjek koji
 *   odgovara za tvrdnju. Ovdje ne stoji niko — portal čeka dok uređaj
 *   sam ne dokaže da TLS handshake prolazi. Dugme koje bi to preskočilo
 *   pravilo bi pristanak koji izgleda dokazano a nije.
 *
 *   Pristanak bez imena i odnosa davaoca se ne šalje. Prazan potpis je
 *   gori od nikakvog, jer u zapisu izgleda kao dokaz.
 *
 *   Brojke o dometu zaštite se ne pišu ovdje nego dolaze iz texts.json,
 *   koji se generiše iz panela (vidi build-texts.js). Portal i panel ne
 *   smiju korisniku tvrditi različite stvari.
 */

(function () {
  'use strict';

  var LOCAL_API = '/v1';
  var CHECK_INTERVAL_MS = 2000;

  // Koliko se čeka na dokaz prije nego se ponudi pomoć. Vrijednost daje
  // uređaj (session.check_timeout_ms), jer on zna koliko njegov Squid
  // treba — ovo je samo vrijednost ako je ne pošalje.
  var DEFAULT_CHECK_TIMEOUT_MS = 90000;

  var state = {
    lang: 'bs',
    texts: null,
    config: null,
    session: null,
    platform: 'ios',
    checkStartedAt: 0,
    checkTimer: null,
    proven: false,
  };

  // Tekstovi koje portal ima svoje — naslovi, dugmad, forma. Ono što
  // dijeli sa panelom (domet zaštite, uputstvo za certifikat) dolazi iz
  // texts.json i ovdje se ne prepisuje.
  var OWN = {
    bs: {
      loading: 'Učitavanje…',
      chooseFullTitle: 'Puna zaštita',
      chooseGuestTitle: 'Samo osnovna zaštita',
      differenceLink: 'Koja je razlika?',
      differenceTitle: 'Koja je razlika',
      back: 'Nazad',
      consentTitle: 'Pristanak na pregled saobraćaja',
      consentIntro:
        'Puna zaštita znači da Fornect pregleda web saobraćaj ovog uređaja. Za to je potreban pristanak osobe koja za uređaj odgovara.',
      guardianName: 'Ime i prezime',
      guardianRelation: 'Odnos prema korisniku uređaja (roditelj, staratelj, vlasnik…)',
      subjectIsMinor: 'Uređaj koristi maloljetna osoba',
      acceptPolicy: 'Prihvatam politiku pregleda saobraćaja, verzija',
      consentSubmit: 'Dajem pristanak',
      privacyLink: 'Pročitajte politiku privatnosti',
      consentMissing: 'Ime i odnos su obavezni — bez njih zapis ne vrijedi kao pristanak.',
      consentPolicyMissing: 'Politiku treba prihvatiti da bi puna zaštita bila uključena.',
      knownGuestTitle: 'Ovaj uređaj već ima osnovnu zaštitu',
      knownGuestBody:
        'Ne morate ništa raditi. Ako želite da Fornect pregleda i web saobraćaj, možete preći na punu zaštitu.',
      knownGuestAction: 'Pređi na punu zaštitu',
      knownDowngradeAction: 'Prebaci na osnovnu zaštitu',
      reconsentBanner:
        'Politika pregleda saobraćaja je izmijenjena. Vaš pristanak se odnosio na raniju verziju, pa je potrebno da ponovo odlučite.',
      manualConfirm: 'Instalirao sam certifikat',
      manualNote:
        'Ovako potvrđen pristanak se u zapisu vodi kao izjavljen, ne kao dokazan — jer uređaj nije uspio sam potvrditi da certifikat radi.',
      knownFullTitle: 'Ovaj uređaj već ima punu zaštitu',
      knownFullBody:
        'Certifikat je potvrđen i saobraćaj se filtrira. Ne morate ništa raditi.',
      installTitle: 'Instalirajte Fornect certifikat',
      installStepLast:
        'Vratite se na ovu stranicu. Potvrda stiže sama — ne treba ništa pritiskati.',
      downloadCa: 'Preuzmi certifikat',
      fingerprintLabel: 'Otisak certifikata (SHA-256)',
      fingerprintHint:
        'Uporedite ovaj otisak sa onim koji uređaj prikazuje pri instalaciji. Ako se razlikuju, prekinite instalaciju.',
      checkingTitle: 'Provjeravam certifikat',
      checkingBody:
        'Čekam da uređaj potvrdi da certifikat radi. Ovo se dešava samo od sebe, ne treba ništa pritiskati.',
      checkingNote:
        'Puna zaštita se uključuje tek kad provjera prođe. Ne postoji dugme koje to preskače — pristanak koji nije dokazan ne bi vrijedio.',
      checkingFailed:
        'Provjera nije prošla ni nakon više pokušaja. Certifikat vjerovatno nije instaliran ili nije označen kao pouzdan.',
      doneFullTitle: 'Puna zaštita je uključena',
      doneFullBody: 'Uređaj je potvrđen i saobraćaj mu se filtrira.',
      doneGuestTitle: 'Osnovna zaštita je uključena',
      doneGuestBody:
        'Uređaj koristi filtriranje na nivou DNS-a. Certifikat nije instaliran i saobraćaj se ne pregleda.',
      doneGuestNote:
        'Punu zaštitu možete uključiti kasnije — ponovo se spojite na mrežu i ova stranica će se javiti.',
      capacityTitle: 'Mreža je popunjena',
      capacityBody:
        'Licenca ovog Fornect uređaja pokriva određen broj uređaja i taj broj je dostignut.',
      capacityNote:
        'Dok se mjesto ne oslobodi, ovaj uređaj nije registrovan i Fornect mu ne pruža uslugu — preko ove mreže nema pristupa internetu. Vlasnik mreže može osloboditi mjesto ili proširiti licencu.',
      errorTitle: 'Nešto nije proradilo',
      retry: 'Pokušaj ponovo',
      deviceLabel: 'Ovaj uređaj',
      networkError: 'Fornect uređaj se ne javlja. Provjerite da ste i dalje na ovoj mreži.',
    },
    en: {
      loading: 'Loading…',
      chooseFullTitle: 'Full protection',
      chooseGuestTitle: 'Basic protection only',
      differenceLink: 'What is the difference?',
      differenceTitle: 'What is the difference',
      back: 'Back',
      consentTitle: 'Consent to traffic inspection',
      consentIntro:
        'Full protection means Fornect inspects this device’s web traffic. That requires consent from the person responsible for the device.',
      guardianName: 'Full name',
      guardianRelation: 'Relation to the person using the device (parent, guardian, owner…)',
      subjectIsMinor: 'This device is used by a minor',
      acceptPolicy: 'I accept the traffic inspection policy, version',
      consentSubmit: 'I give consent',
      privacyLink: 'Read the privacy policy',
      consentMissing: 'Name and relation are required — without them the record is not consent.',
      consentPolicyMissing: 'The policy has to be accepted for full protection to be enabled.',
      knownGuestTitle: 'This device already has basic protection',
      knownGuestBody:
        'Nothing to do. If you want Fornect to inspect web traffic as well, you can switch to full protection.',
      knownGuestAction: 'Switch to full protection',
      knownDowngradeAction: 'Switch to basic protection',
      reconsentBanner:
        'The traffic inspection policy has changed. Your consent covered an earlier version, so you need to decide again.',
      manualConfirm: 'I have installed the certificate',
      manualNote:
        'Consent confirmed this way is recorded as declared, not proven — because the device could not confirm on its own that the certificate works.',
      knownFullTitle: 'This device already has full protection',
      knownFullBody:
        'The certificate is confirmed and traffic is being filtered. Nothing to do.',
      installTitle: 'Install the Fornect certificate',
      installStepLast:
        'Come back to this page. The confirmation arrives on its own — nothing to press.',
      downloadCa: 'Download the certificate',
      fingerprintLabel: 'Certificate fingerprint (SHA-256)',
      fingerprintHint:
        'Compare this fingerprint with the one your device shows during installation. If they differ, stop the installation.',
      checkingTitle: 'Checking the certificate',
      checkingBody:
        'Waiting for the device to confirm the certificate works. This happens on its own — nothing to press.',
      checkingNote:
        'Full protection turns on only once the check passes. There is no button that skips it — consent that is not proven would not be worth anything.',
      checkingFailed:
        'The check did not pass after several attempts. The certificate is probably not installed, or not marked as trusted.',
      doneFullTitle: 'Full protection is on',
      doneFullBody: 'The device is confirmed and its traffic is being filtered.',
      doneGuestTitle: 'Basic protection is on',
      doneGuestBody:
        'The device uses DNS-level filtering. No certificate is installed and traffic is not inspected.',
      doneGuestNote:
        'You can turn on full protection later — reconnect to the network and this page will appear again.',
      capacityTitle: 'The network is full',
      capacityBody:
        'This Fornect device’s licence covers a set number of devices, and that number has been reached.',
      capacityNote:
        'Until a slot frees up this device is not registered and Fornect gives it no service — it has no internet access through this network. The network owner can free up a slot or extend the licence.',
      errorTitle: 'Something did not work',
      retry: 'Try again',
      deviceLabel: 'This device',
      networkError: 'The Fornect device is not responding. Check that you are still on this network.',
    },
  };

  function t(key) {
    var own = OWN[state.lang];

    if (own && Object.prototype.hasOwnProperty.call(own, key)) {
      return own[key];
    }

    var shared = state.texts && state.texts[state.lang];

    return (shared && shared[key]) || '';
  }

  function el(id) {
    return document.getElementById(id);
  }

  function show(name) {
    var views = document.querySelectorAll('.view');

    for (var i = 0; i < views.length; i += 1) {
      views[i].hidden = views[i].id !== 'view-' + name;
    }
  }

  function applyTexts() {
    var nodes = document.querySelectorAll('[data-t]');

    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-t'));
    }

    document.documentElement.lang = state.lang;
    el('lang-toggle').textContent = state.lang === 'bs' ? 'EN' : 'BS';

    if (state.config) {
      el('brand').textContent = state.config.brandName || 'Fornect';
      el('welcome-title').textContent = pick(state.config.welcomeTitle);
      el('welcome-message').textContent = pick(state.config.welcomeMessage);
      el('support').textContent = state.config.supportContact || '';
    }

    if (state.session) {
      var label = t('deviceLabel') + ': ' + (state.session.device_name || state.session.mac);

      el('choice-mac').textContent = label;
      el('capacity-mac').textContent = label;
      el('policy-version').textContent = state.session.policy_version || '';
      el('ca-fingerprint').textContent = state.session.ca_fingerprint || '';
    }

    renderSteps();
  }

  function pick(value) {
    if (!value) {
      return '';
    }

    return value[state.lang] || value.bs || '';
  }

  function renderSteps() {
    var list = el('install-steps');

    if (!list) {
      return;
    }

    list.innerHTML = '';

    // Koraci 1-4 dolaze iz panela; peti je portalov vlastiti, jer se
    // ova dva mjesta tu stvarno razlikuju — u panelu korisnik potvrdi
    // instalaciju dugmetom, ovdje potvrda stiže sa uređaja.
    var steps = [];

    for (var step = 1; step <= 4; step += 1) {
      var text = t('protection.' + state.platform + 'Step' + step);

      if (text) {
        steps.push(text);
      }
    }

    steps.push(t('installStepLast'));

    for (var i = 0; i < steps.length; i += 1) {
      var li = document.createElement('li');
      li.textContent = steps[i];
      list.appendChild(li);
    }

    el('install-note').textContent = t('protection.' + state.platform + 'Note');

    // Firefox na Androidu drži vlastitu listu certifikata. Bez ove
    // napomene korisnik instalira certifikat, vidi da radi u jednom
    // pregledniku i misli da je gotov.
    var extra = el('install-extra');

    if (state.platform === 'android') {
      extra.textContent = t('protection.androidFirefoxNote');
      extra.hidden = false;
    } else {
      extra.hidden = true;
    }

    var tabs = document.querySelectorAll('#platform-tabs button');

    for (var i = 0; i < tabs.length; i += 1) {
      var active = tabs[i].getAttribute('data-os') === state.platform;

      if (active) {
        tabs[i].classList.add('active');
      } else {
        tabs[i].classList.remove('active');
      }
    }
  }

  function api(path, options) {
    return fetch(path, options).then(function (response) {
      if (!response.ok) {
        var error = new Error('HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }

      return response.json();
    });
  }

  function fail(message) {
    el('error-body').textContent = message || t('networkError');
    show('error');
  }

  function classify(body) {
    return api(LOCAL_API + '/devices/' + encodeURIComponent(state.session.mac) + '/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function chooseGuest() {
    classify({ state: 'guest', method: 'portal' })
      .then(function () {
        el('done-title').textContent = t('doneGuestTitle');
        el('done-body').textContent = t('doneGuestBody');
        el('done-note').textContent = t('doneGuestNote');
        show('done');
      })
      .catch(function () {
        fail();
      });
  }

  function submitConsent(event) {
    event.preventDefault();

    var name = el('guardian-name').value.trim();
    var relation = el('guardian-relation').value.trim();
    var error = el('consent-error');

    // Prazan potpis je gori od nikakvog — u zapisu izgleda kao dokaz.
    if (!name || !relation) {
      error.textContent = t('consentMissing');
      error.hidden = false;

      return;
    }

    if (!el('accept-policy').checked) {
      error.textContent = t('consentPolicyMissing');
      error.hidden = false;

      return;
    }

    error.hidden = true;

    el('checking-error').hidden = true;
    el('check-status').hidden = false;

    classify({
      state: 'consented',
      method: 'portal',
      consent: {
        guardian_name: name,
        guardian_relation: relation,
        subject_is_minor: el('subject-minor').checked,
        policy_version: state.session.policy_version,
      },
    })
      .then(function () {
        show('install');
        startChecking();
      })
      .catch(function () {
        fail();
      });
  }

  /*
   * Dokaz da certifikat radi.
   *
   * Tok je iz kontrakta (Zadatak 1, Tacka 5): portal otvori
   * `check_url` — HTTPS adresu koju Squid bump-uje. Ako pregledac
   * stvarno vjeruje nasem CA, TLS handshake prodje i endpoint vrati
   * 204. Handshake vidi SAM UREDJAJ, pa on i promovise MAC u
   * `consented` i pise audit zapis.
   *
   * Zato portal ne presudjuje nista: pokrene zahtjev, pa gleda svoje
   * stanje dok se ne promijeni. Ranije sam ovdje imao suprotno —
   * portal je javljao uredjaju ishod, sto znaci da je o dokazu
   * odlucivala strana koja ga ne moze vidjeti.
   *
   * `no-cors` jer endpoint vraca 204 bez CORS zaglavlja: odgovor se ne
   * moze procitati, ali to i ne treba — bitno je samo je li handshake
   * prosao. Stariji WebView bez fetch-a pada na ucitavanje slike.
   *
   * GRANICA: sve ovo radi tek kad Squid MITM radi, dakle na pravom
   * hardveru (Zadatak 2). Do tada ga glumi portal/dev-server.js.
   */
  function startChecking() {
    state.checkStartedAt = Date.now();
    state.proven = false;

    el('checking-error').hidden = true;
    el('check-status').hidden = false;
    el('manual-confirm').hidden = true;
    el('manual-note').hidden = true;

    if (state.checkTimer) {
      clearInterval(state.checkTimer);
    }

    state.checkTimer = setInterval(tick, CHECK_INTERVAL_MS);

    tick();
  }

  function tick() {
    if (state.proven) {
      return;
    }

    var timeout = state.session.check_timeout_ms || DEFAULT_CHECK_TIMEOUT_MS;

    if (Date.now() - state.checkStartedAt > timeout) {
      clearInterval(state.checkTimer);
      offerManual();

      return;
    }

    triggerHandshake();
    readState();
  }

  /** Natjera pregledac na TLS handshake kroz Squid. */
  function triggerHandshake() {
    var url = state.session.check_url;

    if (!url) {
      return;
    }

    // Bez ovoga bi pregledac posluzio prvi neuspjeh iz kesa i provjera
    // ne bi prosla ni nakon uspjesne instalacije.
    var fresh = url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();

    if (typeof fetch === 'function') {
      fetch(fresh, { mode: 'no-cors', cache: 'no-store' }).catch(function () {
        // Neuspjeh je ocekivano stanje dok korisnik instalira
        // certifikat, ne kvar.
      });

      return;
    }

    var image = new Image();

    image.onerror = function () {
      // Isto: sljedeci tick pokusava ponovo.
    };

    image.src = fresh;
  }

  /** Uredjaj je taj koji promovise — portal samo gleda svoje stanje. */
  function readState() {
    api(LOCAL_API + '/portal/session')
      .then(function (session) {
        state.session = session;

        if (session.state === 'consented' || session.state === 'paired') {
          state.proven = true;
          clearInterval(state.checkTimer);

          el('done-title').textContent = t('doneFullTitle');
          el('done-body').textContent = t('doneFullBody');
          el('done-note').textContent = t('protection.pinningNote');
          show('done');
        }
      })
      .catch(function () {
        // Veza zna zatreperiti dok se uredjaj prebacuje na presretanje.
      });
  }

  /**
   * Automatska provjera nije prosla.
   *
   * Tek sada se nudi rucna potvrda — kontrakt je predvidja kao
   * fallback, uz oznaku `manual` u zapisu. Nije precica: da stoji od
   * pocetka, niko ne bi cekao dokaz.
   */
  function offerManual() {
    var error = el('checking-error');

    error.textContent = t('checkingFailed');
    error.hidden = false;
    el('check-status').hidden = true;
    el('manual-confirm').hidden = false;
    el('manual-note').hidden = false;
  }

  function confirmManually() {
    classify({ state: 'consented', method: 'manual' })
      .then(function () {
        el('done-title').textContent = t('doneFullTitle');
        el('done-body').textContent = t('doneFullBody');
        el('done-note').textContent = t('manualNote');
        show('done');
      })
      .catch(function () {
        fail();
      });
  }

  function routeByState() {
    if (state.session.capacity_full) {
      show('capacity');

      return;
    }

    // Rjecnik je onaj iz kontrakta (Zadatak 1, Tacka 5): unknown →
    // (guest | verifying → consented). Stanja panela (pairing, paired,
    // failed) se primaju uz njih, jer isti tok vodi i panel.
    var known = state.session.state;

    if (known === 'consented' || known === 'paired') {
      // Politika se u medjuvremenu promijenila: pristanak je dat na
      // raniji tekst i ne vrijedi za ovaj. Trazi se ponovo.
      if (policyChanged()) {
        openConsent(true);

        return;
      }

      el('known-title').textContent = t('knownFullTitle');
      el('known-body').textContent = t('knownFullBody');
      el('known-upgrade').hidden = true;
      el('known-downgrade').hidden = false;
      show('known');

      return;
    }

    if (known === 'verifying' || known === 'pairing' || known === 'failed') {
      show('install');
      startChecking();

      return;
    }

    if (known === 'guest') {
      el('known-title').textContent = t('knownGuestTitle');
      el('known-body').textContent = t('knownGuestBody');
      el('known-upgrade').hidden = false;
      el('known-downgrade').hidden = true;
      show('known');

      return;
    }

    show('choice');
  }

  /** Da li je uredjaj pristao na stariju verziju politike od trenutne. */
  function policyChanged() {
    var accepted = state.session.accepted_policy_version;

    return Boolean(accepted) && accepted !== state.session.policy_version;
  }

  function openConsent(reconsent) {
    // Prazno znaci da vlasnik mreze nije podesio vezu. Tada se ne
    // prikazuje nista: mrtva veza na ekranu pristanka je gora od
    // nikakve, jer izgleda kao da je politika ponudjena a nije.
    var url = state.config && state.config.privacyPolicyUrl;
    var row = el('privacy-link-row');

    if (url) {
      var link = el('privacy-link');

      link.setAttribute('href', url);
      link.textContent = t('privacyLink');
      row.hidden = false;
    } else {
      row.hidden = true;
    }

    var banner = el('reconsent-banner');

    banner.textContent = reconsent ? t('reconsentBanner') : '';
    banner.hidden = !reconsent;

    show('consent');
  }

  /** Opoziv: uredjaj ostaje na mrezi, ali bez presretanja. */
  function switchToBasic() {
    api(LOCAL_API + '/consent/' + encodeURIComponent(state.session.mac) + '/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Opozvano sa portala.' }),
    })
      .then(function () {
        el('done-title').textContent = t('doneGuestTitle');
        el('done-body').textContent = t('doneGuestBody');
        el('done-note').textContent = t('doneGuestNote');
        show('done');
      })
      .catch(function () {
        fail();
      });
  }

  function bind() {
    el('lang-toggle').addEventListener('click', function () {
      state.lang = state.lang === 'bs' ? 'en' : 'bs';
      applyTexts();
    });

    el('choose-guest').addEventListener('click', chooseGuest);

    el('choose-full').addEventListener('click', function () {
      openConsent(false);
    });

    // Gost se predomislio: puna zaštita i dalje traži pristanak, pa ide
    // kroz istu formu kao i prvi put.
    el('known-upgrade').addEventListener('click', function () {
      openConsent(false);
    });

    el('known-downgrade').addEventListener('click', switchToBasic);

    el('manual-confirm').addEventListener('click', confirmManually);

    el('show-difference').addEventListener('click', function () {
      show('difference');
    });

    el('difference-back').addEventListener('click', function () {
      show('choice');
    });

    el('consent-back').addEventListener('click', function () {
      show('choice');
    });

    el('consent-form').addEventListener('submit', submitConsent);

    el('error-retry').addEventListener('click', start);

    var tabs = document.querySelectorAll('#platform-tabs button');

    for (var i = 0; i < tabs.length; i += 1) {
      tabs[i].addEventListener('click', function (event) {
        state.platform = event.currentTarget.getAttribute('data-os');
        renderSteps();
      });
    }

    // Uputstvo se otvara na platformi koju uređaj vjerovatno koristi,
    // da korisnik ne bira ono što je već očigledno.
    var ua = navigator.userAgent || '';

    if (/Android/i.test(ua)) {
      state.platform = 'android';
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      state.platform = 'ios';
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      state.platform = 'mac';
    } else {
      state.platform = 'windows';
    }
  }

  function start() {
    show('loading');

    Promise.all([
      api('texts.json'),
      api('config.json'),
      api(LOCAL_API + '/portal/session'),
    ])
      .then(function (results) {
        state.texts = results[0];
        state.config = results[1];
        state.session = results[2];

        if (state.session.language === 'en' || state.session.language === 'bs') {
          state.lang = state.session.language;
        }

        el('ca-download').setAttribute('href', state.session.ca_url || LOCAL_API + '/portal/ca.crt');

        applyTexts();
        el('portal').hidden = false;

        routeByState();
      })
      .catch(function () {
        el('portal').hidden = false;
        applyTexts();
        fail();
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    start();
  });
})();
