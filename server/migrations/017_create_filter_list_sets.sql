-- Zadatak 1, Tačka 6, tačka 2.1: „Jedan-klik rollback liste u admin
-- panelu (vraćanje prethodnog URL seta + updateGravity)."
--
-- Tabela je append-only, kao device_configs. Vraćanje na prethodni set
-- ne briše i ne mijenja nijedan red — upisuje NOVI red sa starim
-- URL-ovima i oznakom `rollback`.
--
-- Razlog nije uredno vođenje evidencije nego ovo: loša lista je incident
-- (Alen: canary prsten, skok stope blokiranja, pauza rolloutu). Poslije
-- incidenta se pita „šta je tačno bilo aktivno i od kada", a tabela koja
-- se prepisuje na to ne može odgovoriti. Rollback koji obriše trag
-- rollbacka je gori od nikakvog.
--
-- Same liste NE povlači cloud. Uređaj ih povlači sa našeg mirrora
-- (lists.fornect.*) uz jitter; ovdje stoji samo KOJI set URL-ova važi.

CREATE TABLE IF NOT EXISTS filter_list_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,

  -- Niz URL-ova. jsonb, a ne text[], jer se ovako doslovno prepisuje u
  -- config_json bez pretvaranja tipova.
  urls jsonb NOT NULL,

  -- Kratka oznaka za čovjeka: „HaGeZi Pro 2026-09-18".
  label text,

  -- Kako je set nastao. 'panel' = neko ga je postavio; 'rollback' =
  -- vraćanje na raniji; 'default' = početni set pri uparivanju huba.
  source text NOT NULL DEFAULT 'panel'
    CHECK (source IN ('default', 'panel', 'rollback')),

  -- Na koji red se vraćalo, kad je source='rollback'. Bez ovoga se iz
  -- historije ne vidi ŠTA je vraćeno, samo da jeste.
  restored_from uuid REFERENCES filter_list_sets(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Aktivan set je najnoviji red za taj uređaj. Indeks služi tom upitu,
-- koji se radi na svako čitanje flote i na svaki upis configa.
CREATE INDEX IF NOT EXISTS filter_list_sets_device_id_created_at_idx
  ON filter_list_sets (device_id, created_at DESC, id DESC);
