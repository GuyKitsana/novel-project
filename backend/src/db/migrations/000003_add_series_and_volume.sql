BEGIN;

CREATE TABLE IF NOT EXISTS public.series (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  normalized_title VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT series_normalized_unique UNIQUE (normalized_title)
);

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS series_id INTEGER,
  ADD COLUMN IF NOT EXISTS volume_no INTEGER;

-- Backfill: create a series per book title (safe default)
INSERT INTO public.series (title, normalized_title)
SELECT DISTINCT b.title, LOWER(TRIM(b.title))
FROM public.books b
LEFT JOIN public.series s ON s.normalized_title = LOWER(TRIM(b.title))
WHERE s.id IS NULL;

-- Backfill: link each book to its series by title
UPDATE public.books b
SET series_id = s.id
FROM public.series s
WHERE b.series_id IS NULL
  AND s.normalized_title = LOWER(TRIM(b.title));

-- Add FK (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_books_series'
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT fk_books_series
      FOREIGN KEY (series_id)
      REFERENCES public.series(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_series_normalized_title ON public.series (normalized_title);
CREATE INDEX IF NOT EXISTS idx_books_series_id ON public.books (series_id);
CREATE INDEX IF NOT EXISTS idx_books_volume_no ON public.books (volume_no);

COMMIT;
