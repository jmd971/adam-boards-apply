-- ============================================================================
-- SÉCURITÉ — Escalade de privilège via user_roles (corrigé le 15/06/2026)
--
-- La démo avait des policies d'ÉCRITURE permissives sur user_roles
-- (« admins manage tenant roles » FOR ALL, user_roles_update_own_tenant, etc.)
-- qui permettaient à un utilisateur authentifié de faire :
--     update user_roles set role='superadmin' where user_id = auth.uid()
-- → auto-promotion superadmin + accès à tous les tenants. (Test d'attaque confirmé.)
--
-- La prod n'avait JAMAIS eu ces policies (seulement des SELECT) → non vulnérable.
-- Ce script supprime ces policies (idempotent, no-op en prod) pour garantir que
-- user_roles n'accepte AUCUNE écriture côté client. L'attribution de rôle se fait
-- exclusivement via :
--   - provision_new_user() (SECURITY DEFINER) à l'inscription
--   - les routes API superadmin (service_role key, bypass RLS)
-- Le client ne fait que des SELECT sur user_roles → aucune régression.
-- Appliqué sur les DEUX bases (démo + prod).
-- ============================================================================
drop policy if exists "admins manage tenant roles"  on user_roles;
drop policy if exists "user_roles_delete_own_tenant" on user_roles;
drop policy if exists "user_roles_insert_admin"      on user_roles;
drop policy if exists "user_roles_insert_own"        on user_roles;
drop policy if exists "user_roles_update_admin"      on user_roles;
drop policy if exists "user_roles_update_own_tenant" on user_roles;
