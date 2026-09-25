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
  });
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  if (env.mailTransport === 'smtp') {
    return sendViaSmtp(mail);
  }

  return sendViaLog(mail);
}

/**
 * Tekst maila sa kodom.
 *
 * Namjerno bez linka na koji se klikne: kod se prepisuje rucno, pa
 * mail ne moze posluziti kao mamac za klik. Uz to, kod radi i kad je
 * korisnik registraciju zapoceo na drugom uredjaju.
 */
export function verificationMail(to: string, code: string, ttlMinutes: number): OutgoingMail {
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
      'Ako niste vi pokrenuli registraciju, slobodno zanemarite ovu poruku —',
      'bez unosa koda nalog neće biti potvrđen.',
    ].join('\n'),
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
      'Ako niste vi tražili novu lozinku, zanemarite ovu poruku —',
      'bez unosa koda lozinka ostaje ista.',
    ].join('\n'),
  };
}
