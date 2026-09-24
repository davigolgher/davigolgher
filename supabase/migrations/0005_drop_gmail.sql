-- Gmail import is dropped.
--
-- Reading a user's inbox needs Google's `gmail.readonly`, which is a restricted
-- scope: production access requires OAuth verification plus a third-party CASA
-- security assessment, renewed yearly. That's a real recurring cost for a
-- feature that was a convenience, so the feature goes rather than the cost
-- being carried.
--
-- Nothing was ever stored here — the integration was never switched on — so
-- this drops structure, not data.

drop table if exists public.gmail_tokens;

alter table public.preferences drop column if exists gmail_connected;

-- The dedup key for imported messages (0003). Dropping the column drops its
-- unique index with it.
alter table public.transactions drop column if exists external_id;

-- Every transaction is hand-entered now, so 'gmail' is no longer a valid source.
update public.transactions set source = 'manual' where source <> 'manual';
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check check (source in ('manual'));
