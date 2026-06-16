/* eslint-disable @typescript-eslint/no-explicit-any */
// Helpers partagés des routes API (validation auth superadmin).

export const DUMMY_TENANT = '00000000-0000-0000-0000-000000000001'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/**
 * Vérifie le JWT de l'appelant via Supabase Auth (signature + expiration validées
 * côté serveur — PAS un simple décodage base64 falsifiable) puis confirme le rôle
 * superadmin en base. Retourne { ok:true, userId } ou { ok:false, status, error }.
 */
export async function requireSuperadmin(
  req: any,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return { ok: false, status: 401, error: 'Authentification requise.' }

  // 1. Valider le JWT auprès de Supabase Auth (vérifie la signature et l'expiration).
  const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: serviceKey },
  })
  if (!userResp.ok) return { ok: false, status: 401, error: 'JWT invalide ou expiré.' }
  const user = await userResp.json() as any
  const userId = user?.id
  if (!isUuid(userId)) return { ok: false, status: 401, error: 'Utilisateur introuvable.' }

  // 2. Confirmer le rôle superadmin en base (service role).
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }
  const roleResp = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers },
  )
  const roleData = await roleResp.json() as any[]
  const isSuperadmin = Array.isArray(roleData) && roleData.some(r => r.role === 'superadmin')
  if (!isSuperadmin) return { ok: false, status: 403, error: 'Accès réservé aux superadmins.' }

  return { ok: true, userId }
}
