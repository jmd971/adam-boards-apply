# CLAUDE.md — AdamBoards

> **RÈGLE FONDAMENTALE** : Ne modifier que ce qui est explicitement demandé.
> Ne jamais "améliorer", "refactoriser" ou "nettoyer" du code non ciblé par la demande.
> Chaque modification non nécessaire est une régression potentielle.

---

## Workflow de modification (PAS de clone local)

Toutes les modifications passent par l'API GitHub :

```bash
# Lire un fichier
gh api repos/jmd971/adam-boards-apply/contents/src/path/to/file.tsx --jq '.content' | base64 -d

# Pousser un fichier modifié
CONTENT=$(base64 -i /tmp/file.tsx | tr -d '\n')
gh api repos/jmd971/adam-boards-apply/contents/src/path/to/file.tsx \
  --method PUT \
  --field message="fix: description précise" \
  --field content="$CONTENT" \
  --field sha="<sha_du_fichier>" \
  --field branch="develop"
```

- Branche `develop` → déploiement automatique sur **demo.adamboards.fr**
- Ne jamais pousser directement sur `main`/`prod` sans demande explicite
- Supabase project ref : `fuxelqeizkmksapnetqz`

---

## Stack

- **Vite 5 + React 18 + TypeScript 5** — build : `tsc -b && vite build`
- **Zustand** — état global (`src/store/index.ts`)
- **TanStack Query** — fetching Supabase (`useCompanyData`)
- **Supabase** — auth + BDD + storage (bucket `invoice`)
- Alias : `@/*` → `./src/*`

---

## Flux de données — NE PAS CASSER

```
Supabase (company_data + budget + manual_entries)
        ↓  useCompanyData (TanStack Query, staleTime: 5min)
        ↓  buildRAW(cd, bd, manualEntries)  ←── src/lib/calc.ts
        ↓  RAWData dans Zustand (setRAW)
        ↓  Tous les modules lisent useAppStore(s => s.RAW)
```

### buildRAW — invariants critiques

- Fusionne `company_data` FEC + `manual_entries` dans `pn` (comptes du plan comptable)
- **Ignore les entries avec `company_key` vide** (`if (!mco) continue`)
- Calcule `RAW.mn` = union de tous les mois couverts (utilisé par `usePeriodFilter`)
- Les mois des manual_entries sont ajoutés à `allMsN` → apparaissent dans `mn`

### Filtre de période — invariant critique

`usePeriodFilter` : `selectedMs = allMonths.filter(m => monthIdx(m) >= monthIdx(startM) && monthIdx(m) <= monthIdx(endM))`

**Si une entry a une date hors de `filters.startM`/`filters.endM`, elle est INVISIBLE dans Équilibre et Trésorerie.**

---

## Règles anti-régression — BUGS DÉJÀ CORRIGÉS

### 1. `account_num` — extraction depuis la sous-catégorie

**JAMAIS** utiliser `catConfig?.acc` directement pour `account_num`.  
**TOUJOURS** extraire le compte depuis le libellé de sous-catégorie :

```typescript
const extractAcc = (sub: string, fallback: string) => {
  const m = sub?.match(/\((\d{3,})[^)]*\)/)
  return m ? m[1] : fallback
}
// "Publicité et marketing (623)" → "623"
// "Loyer et charges locatives (613/614)" → "613"
```

Cette fonction doit être utilisée **partout** où `account_num` est assigné :
- `handleSubmit` (saisie manuelle)
- `handleCSV` (import CSV)
- OCR → form → handleSubmit (via form.subcategory)

### 2. `refreshStore` — après chaque saisie manuelle

**TOUJOURS** inclure le filtre `tenant_id` ET étendre la période :

```typescript
const refreshStore = async (newEntry: ManualEntry) => {
  const allEntries = [newEntry, ...manualEntries]
  setManualEntries(allEntries)
  if (!tenantId) return
  const { data: cd } = await sb.from('company_data').select('*').eq('tenant_id', tenantId)  // ← tenant_id obligatoire
  const { data: bd } = await sb.from('budget').select('*').eq('tenant_id', tenantId)         // ← tenant_id obligatoire
  if (cd) {
    const newRAW = buildRAW(cd as any, (bd ?? []) as any, allEntries)
    setRAW(newRAW)
    if (newRAW.mn.length > 0) {
      const newStart = newRAW.mn[0]
      const newEnd   = newRAW.mn[newRAW.mn.length - 1]
      setFilters({
        startM: (!filters.startM || newStart < filters.startM) ? newStart : filters.startM,
        endM:   (!filters.endM   || newEnd   > filters.endM)   ? newEnd   : filters.endM,
      })
    }
  }
}
```

Sans le `eq('tenant_id', tenantId)`, on charge les données de tous les tenants.  
Sans l'extension de période, une entry en 2026-04 reste invisible si le FEC couvre 2024.

### 3. Historique Saisie — utiliser le store, pas une query locale

**JAMAIS** faire un fetch Supabase local dans Saisie.tsx pour l'historique.  
**TOUJOURS** lire `manualEntries` depuis le store Zustand :

```typescript
const manualEntries = useAppStore(s => s.manualEntries)
```

Un fetch local sans `tenant_id` retourne les données de tous les tenants (RLS parfois permissive en test).

### 4. Rôles — `canEdit` et `canWrite`

`Import.tsx` — `canEdit` doit inclure `superadmin` :
```typescript
const canEdit = role === 'admin' || role === 'comptable' || role === 'superadmin'
```

Ne jamais retirer `superadmin` de cette liste.

### 5. Parser FEC — BOM et variantes de colonnes

`src/lib/fec.ts` doit :
- Striper le BOM UTF-8 en premier : `text.replace(/^﻿/, '')`
- Normaliser les fins de ligne : `.replace(/\r\n/g, '\n').replace(/\r/g, '\n')`
- Supporter les variantes de noms de colonnes (CompteNum, compte_num, accountnum…)
- Supporter un seul champ `Montant` + `Sens` quand pas de Débit/Crédit séparés

### 6. Double comptage en Trésorerie

`Tresorerie.tsx` — les saisies manuelles sont déjà dans `pn` via `buildRAW`.  
Ne les ajouter à `eM`/`dM` **que si leur compte n'est PAS dans ENC_CATS/DEC_CATS** :

```typescript
const inStdCat = catOf(acc, ENC_CATS) || catOf(acc, DEC_CATS)
if (!inStdCat) {
  // ajouter à eM ou dM
}
```

Pour les paiements échelonnés : annuler la contribution pn au mois de la facture, répartir sur les dates d'échéance.

### 7. `RAW` peut être `null` — optional chaining obligatoire

Dans les `useMemo` qui s'exécutent avant le guard `if (!RAW) return` :
```typescript
// ❌ RAW.companies[co]?.name  → TS18047
// ✅ RAW?.companies[co]?.name
```

---

## Structure des fichiers clés

| Fichier | Rôle |
|---------|------|
| `src/store/index.ts` | Zustand store : RAW, manualEntries, filters, role, tenantId |
| `src/lib/calc.ts` | `buildRAW`, `computePlCalc`, `mergeEntries`, `fmt`, `fiscalIndex` |
| `src/lib/fec.ts` | Parser FEC : `parseFEC`, `detectCompany`, `detectPeriod`, `lastFecError` |
| `src/lib/roles.ts` | `canWrite(role)` — read-only si viewer/client |
| `src/lib/structure.ts` | Définition des lignes du plan comptable (SigRow) |
| `src/hooks/useCompanyData.ts` | TanStack Query → charge company_data + budget + manual_entries |
| `src/hooks/usePeriodFilter.ts` | Filtre les mois selon `filters.startM`/`filters.endM` |
| `src/modules/saisie/Saisie.tsx` | Saisie manuelle + OCR + CSV ; historique via store |
| `src/modules/import/Import.tsx` | Import FEC ; accessible superadmin + admin + comptable |
| `src/modules/tresorerie/Tresorerie.tsx` | Tréso réalisée + prévisionnel + vue journalière |
| `src/modules/equilibre/Equilibre.tsx` | Vue mensuelle par compte PCG |
| `src/types/index.ts` | Types TypeScript : ManualEntry, RAWData, CompanyRaw… |

---

## Supabase — tables et colonnes importantes

### `manual_entries`
```
id, tenant_id, company_key, entry_date, category, subcategory,
label, amount_ht, amount_ht_saisie, amount_ttc, tva_amount, tva_rate,
counterpart, payment_mode, payment_date, account_num,
source ('manual'|'ocr'|'csv'|'echeance'),
invoice_url, echeancier_data (jsonb), created_at
```

### `company_data`
```
tenant_id, company_key, company_name, period ('N'|'N-1'|'N-2'),
fiscal_year, pl_data, bilan_data, months_covered, entry_count,
source ('manual'|'fec'), client_data, ve_entries
```

### `budget`
```
tenant_id, company_key, period, data (jsonb)
```

---

## Build — erreurs TypeScript courantes

- **TS18047** `'X' is possibly 'null'` : utiliser optional chaining `X?.prop` dans les `useMemo`
- **TS2339** property does not exist : vérifier `src/types/index.ts` avant d'ajouter un champ
- Ne jamais utiliser `// @ts-ignore` — corriger le type à la source

---

## Conventions de code

- **Pas de `useEffect` pour charger des données** déjà dans le store Zustand
- **Pas de state local** pour des données qui viennent du store
- **Styles inline** (pas de classes Tailwind custom) dans les modules — c'est volontaire
- Formatage français : `Intl.NumberFormat('fr-FR')` ou `fmt()` de calc.ts
- Dates : stockées en `YYYY-MM-DD`, affichées en `DD/MM/YYYY` via `fmtDate()`
