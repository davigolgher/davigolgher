-- Dedup key for Gmail-imported transactions (the Gmail message id).
alter table public.transactions add column if not exists external_id text;

create unique index if not exists transactions_user_external_idx
  on public.transactions (user_id, external_id)
  where external_id is not null;
