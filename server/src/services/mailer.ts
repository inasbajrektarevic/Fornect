// Slanje mailova, sa dva transporta koja se biraju konfiguracijom.
//
// Poenta je da je put kroz kod ISTI u razvoju i u produkciji: ruta
// uvijek zove sendMail(), a samo transport odlucuje gdje mail zavrsi.
// Prelazak na pravi mail je time izmjena konfiguracije, ne koda.
//
//   MAIL_TRANSPORT=log   (podrazumijevano) — mail se ispise u log i
//                        snimi u `.mail-outbox/`. Nista ne izlazi na
//                        internet, pa razvoj i testovi ne traze SMTP.
//   MAIL_TRANSPORT=smtp  — pravi SMTP preko nodemailer-a.
//
// Namjerno NEMA rute koja vraca posljednji poslani kod. Takva ruta bi
// bila najkraci put do curenja kodova ako se greskom ukljuci u
// produkciji. Testovi umjesto toga citaju fajl iz `.mail-outbox/`,
// cemu se preko mreze ne moze pristupiti.

import fs from 'node:fs';
import path from 'node:path';

import nodemailer from 'nodemailer';

import { env } from '../env';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  /**
   * HTML verzija istog sadrzaja. Neobavezna: tekst ostaje glavni i
   * potpun (citaju ga i testovi i klijenti koji HTML ne prikazuju), a
   * HTML je ista poruka, samo uredjenija. Mail sa obje verzije filteri
   * za spam tretiraju kao uobicajeniji od golog teksta.
   */
  html?: string;
}

const OUTBOX_DIR = path.resolve(process.cwd(), '.mail-outbox');

function outboxFileName(to: string): string {
  // Vrijeme na pocetku da se abecednim sortiranjem dobije i hronoloski
  // red; adresa u imenu da test moze naci bas svoj mail.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTo = to.replace(/[^a-zA-Z0-9._-]/g, '_');

  return `${stamp}__${safeTo}.json`;
}

async function sendViaLog(mail: OutgoingMail): Promise<void> {
  await fs.promises.mkdir(OUTBOX_DIR, { recursive: true });

  await fs.promises.writeFile(
    path.join(OUTBOX_DIR, outboxFileName(mail.to)),
    JSON.stringify({ ...mail, sent_at: new Date().toISOString() }, null, 2),
    'utf8',
  );

  // I u log, da se pri ručnom testiranju ne mora otvarati fajl.
  console.log(`[mail:log] za ${mail.to} — ${mail.subject}\n${mail.text}`);
}

// Tip se izvodi iz same funkcije umjesto da se imenuje. Nodemailer je
// kroz verzije mijenjao oblik izvoza tipova (v6 je nudio imenski
// prostor, v10 vise ne), pa ovako ostaje tacan bez obzira na to.
type MailTransporter = ReturnType<typeof nodemailer.createTransport>;

let transporter: MailTransporter | null = null;

function smtpTransporter(): MailTransporter {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    // Port 465 je implicitni TLS; 587 kreće nesigurno pa se podiže
    // kroz STARTTLS, sto nodemailer radi sam.
    secure: env.smtpPort === 465,
    auth:
      env.smtpUser && env.smtpPassword
        ? { user: env.smtpUser, pass: env.smtpPassword }
        : undefined,
  });

  return transporter;
}

async function sendViaSmtp(mail: OutgoingMail): Promise<void> {
  await smtpTransporter().sendMail({
    from: env.mailFrom,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    ...(mail.html ? { html: mail.html } : {}),
  });
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  if (env.mailTransport === 'smtp') {
    return sendViaSmtp(mail);
  }

  return sendViaLog(mail);
}

/** Za sve sto u HTML ulazi od korisnika (adresa) — nikad sirovo. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface CodeMailContent {
  to: string;
  /** Kratak red koji klijent prikaze uz naslov u listi poruka. */
  preheader: string;
  heading: string;
  intro: string;
  code: string;
  ttlMinutes: number;
  /** Zasto je mail stigao i sta ako korisnik nije on to trazio. */
  reason: string;
  ignoreNote: string;
}

/**
 * HTML verzija maila sa kodom.
 *
 * Pravila za HTML mail, zbog kojih izgleda staromodno:
 * - raspored tabelama i stilovi u samim elementima: Gmail i Outlook
 *   ignorisu <style> blok i vecinu modernog CSS-a;
 * - nijedna slika ni resurs izvana: ne ucitavaju se bez dozvole, a
 *   slika-pikseli su upravo ono po cemu filteri prepoznaju masovnu posiljku;
 * - nijedan link: kod se prepisuje (vidi verificationMail).
 */
function codeMailHtml(content: CodeMailContent): string {
  const to = escapeHtml(content.to);

  return `<!doctype html>
<html lang="bs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:'Segoe UI',Arial,sans-serif;color:#172033;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e2e7ef;border-radius:16px;">
<tr><td style="padding:28px 28px 8px;">
<span style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:10px;background:#f5821f;color:#ffffff;font-weight:700;font-size:18px;text-align:center;">F</span>
<span style="margin-left:10px;font-size:18px;font-weight:700;vertical-align:middle;">Fornect</span>
</td></tr>
<tr><td style="padding:12px 28px 0;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${escapeHtml(content.heading)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#2a3546;">${escapeHtml(content.intro)}</p>
</td></tr>
<tr><td align="center" style="padding:0 28px;">
<div style="display:inline-block;padding:14px 24px;border-radius:12px;background:#fff4ea;border:1px solid #fcd9b6;font-family:Consolas,'Courier New',monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:#172033;">${escapeHtml(content.code)}</div>
<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Kod vrijedi ${content.ttlMinutes} minuta.</p>
</td></tr>
<tr><td style="padding:24px 28px 28px;">
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(content.reason)}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(content.ignoreNote)}</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#9aa3b2;">Poslano na ${to} · Fornect</p>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Tekst maila sa kodom.
 *
 * Namjerno bez linka na koji se klikne: kod se prepisuje rucno, pa
 * mail ne moze posluziti kao mamac za klik. Uz to, kod radi i kad je
 * korisnik registraciju zapoceo na drugom uredjaju.
 */
export function verificationMail(to: string, code: string, ttlMinutes: number): OutgoingMail {
  const reason =
    'Ovaj mail ste dobili jer je sa ovom adresom započeta registracija na Fornect panelu.';
  const ignoreNote =
    'Ako niste vi pokrenuli registraciju, slobodno zanemarite ovu poruku — bez unosa koda nalog neće biti potvrđen.';

  return {
    to,
    subject: 'Fornect — potvrda email adrese',
    text: [
      'Vaš kod za potvrdu email adrese je:',
      '',
      `    ${code}`,
      '',
      `Kod vrijedi ${ttlMinutes} minuta.`,
      '',
      reason,
      ignoreNote,
    ].join('\n'),
    html: codeMailHtml({
      to,
      preheader: `Vaš kod za potvrdu: ${code}`,
      heading: 'Potvrdite email adresu',
      intro: 'Upišite ovaj kod na ekranu „Provjerite svoj email" u Fornect panelu:',
      code,
      ttlMinutes,
      reason,
      ignoreNote,
    }),
  };
}

/**
 * Tekst maila sa kodom za novu lozinku.
 *
 * Kao i kod potvrde: bez linka, kod se prepisuje rucno. Mail kaze sta
 * se desava ako korisnik nije sam trazio reset — lozinka se ne mijenja
 * bez koda, pa ne mora nista raditi.
 */
export function passwordResetMail(to: string, code: string, ttlMinutes: number): OutgoingMail {
  const reason = 'Ovaj mail ste dobili jer je za nalog sa ovom adresom zatražena nova lozinka.';
  const ignoreNote =
    'Ako niste vi tražili novu lozinku, zanemarite ovu poruku — bez unosa koda lozinka ostaje ista.';

  return {
    to,
    subject: 'Fornect — kod za novu lozinku',
    text: [
      'Zatražena je nova lozinka za vaš Fornect nalog. Vaš kod je:',
      '',
      `    ${code}`,
      '',
      `Kod vrijedi ${ttlMinutes} minuta.`,
      '',
      reason,
      ignoreNote,
    ].join('\n'),
    html: codeMailHtml({
      to,
      preheader: `Vaš kod za novu lozinku: ${code}`,
      heading: 'Kod za novu lozinku',
      intro: 'Upišite ovaj kod na ekranu „Zaboravljena lozinka" u Fornect panelu, zajedno sa novom lozinkom:',
      code,
      ttlMinutes,
      reason,
      ignoreNote,
    }),
  };
}
