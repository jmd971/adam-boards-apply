-- ============================================================================
-- SÉCURITÉ — Bucket « invoice » privé + isolation par tenant (15/06/2026)
--
-- Avant : bucket public=true + policies larges (read_invoice / upload_invoice /
-- delete_invoice sur bucket_id='invoice', et invoice_select/invoice_insert sur la
-- démo). Conséquence : les factures scannées (données financières / PII) étaient
-- lisibles et énumérables par n'importe quel utilisateur — voire en URL publique
-- (bucket public). Vérifié par test : un user du tenant A lisait 81 factures du
-- tenant B.
--
-- Après : bucket privé + lecture/écriture/suppression scopées au tenant
-- (foldername[1] = get_my_tenant_id()), superadmin conservé. L'app lit via
-- createSignedUrl et écrit sous {tenant_id}/... → aucune régression.
-- Test post-correctif : son_tenant lisible, autre_tenant = 0.
-- Idempotent, appliqué sur les DEUX bases.
-- ============================================================================
update storage.buckets set public = false where id = 'invoice';

drop policy if exists "read_invoice"                         on storage.objects;
drop policy if exists "auth reads own tenant invoices"       on storage.objects;
drop policy if exists "upload_invoice"                        on storage.objects;
drop policy if exists "auth uploads invoice with tenant path" on storage.objects;
drop policy if exists "delete_invoice"                        on storage.objects;
drop policy if exists "invoice_select"                        on storage.objects;
drop policy if exists "invoice_insert"                        on storage.objects;
drop policy if exists "invoice_select_tenant"                 on storage.objects;
drop policy if exists "invoice_insert_tenant"                 on storage.objects;
drop policy if exists "invoice_delete_tenant"                 on storage.objects;

create policy "invoice_select_tenant" on storage.objects for select
  using (bucket_id = 'invoice' and ((storage.foldername(name))[1] = (get_my_tenant_id())::text or is_superadmin()));
create policy "invoice_insert_tenant" on storage.objects for insert
  with check (bucket_id = 'invoice' and ((storage.foldername(name))[1] = (get_my_tenant_id())::text or is_superadmin()));
create policy "invoice_delete_tenant" on storage.objects for delete
  using (bucket_id = 'invoice' and ((storage.foldername(name))[1] = (get_my_tenant_id())::text or is_superadmin()));
