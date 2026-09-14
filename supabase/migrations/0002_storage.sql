-- Private bucket for receipt files. Objects are stored under `<user_id>/<file>`,
-- so `owner = auth.uid()` scopes access to the uploader.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts read own" on storage.objects
  for select using (bucket_id = 'receipts' and owner = auth.uid());

create policy "receipts insert own" on storage.objects
  for insert with check (bucket_id = 'receipts' and owner = auth.uid());

create policy "receipts delete own" on storage.objects
  for delete using (bucket_id = 'receipts' and owner = auth.uid());
