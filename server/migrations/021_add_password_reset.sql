-- Reset zaboravljene lozinke.
--
-- Isti oblik kao potvrda email adrese (migracija 011): server pravi
-- sestocifreni kod, u bazi stoji samo njegov sha256 otisak, kod vrijedi
-- 15 minuta i izdrzi pet pogresnih pokusaja.
--
-- Kolone su ODVOJENE od kolona za potvrdu emaila. Zahtjev za reset ne
-- smije ponistiti kod za potvrdu koji je korisnik mozda upravo dobio,
-- i obrnuto.
--
-- `password_reset_window_started_at` + `password_reset_requests`: najvise
-- pet kodova u 24 sata po nalogu. Pet pokusaja po kodu uz novi kod svake
-- minute daje oko 7.000 pogadjanja dnevno — za kod od milion kombinacija
-- to je stvaran rizik preuzimanja naloga. Sa pet kodova dnevno ostaje
-- 25 pogadjanja.
--
-- `password_changed_at`: tokeni izdati PRIJE promjene lozinke vise ne
-- vrijede (vidi plugins/authenticate-account.ts). Bez toga bi neko ko
-- vec drzi token ostao prijavljen 30 dana i poslije reseta.

ALTER TABLE accounts
  ADD COLUMN password_reset_code_hash text,
  ADD COLUMN password_reset_expires_at timestamptz,
  ADD COLUMN password_reset_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN password_reset_sent_at timestamptz,
  ADD COLUMN password_reset_window_started_at timestamptz,
  ADD COLUMN password_reset_requests integer NOT NULL DEFAULT 0,
  ADD COLUMN password_changed_at timestamptz;
