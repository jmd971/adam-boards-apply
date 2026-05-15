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

### 8. Saisie sans FEC — dropdown société

Quand `RAW.keys.length === 0` (pas de FEC importé), le select société est vide.
**TOUJOURS** afficher un champ texte libre dans ce cas :

```tsx
{RAW.keys.length > 0
  ? <select value={form.company_key} ...>{RAW.keys.map(...)}</select>
  : <input type="text" value={form.company_key}
      onChange={e => setForm(f => ({...f, company_key: e.target.value.trim().toUpperCase().replace(/\s+/g,'_')}))}
      placeholder="Ex : STE_COMMERCIALE" />
}
```

Ne jamais remplacer par un select seul — l'utilisateur doit pouvoir saisir sans FEC.

### 9. Contrainte Supabase `company_data_period_check`

La table `company_data` a une contrainte CHECK sur `period` :
```sql
CHECK (period IN ('N', 'N-1', 'N-2'))
```

**Ne jamais** utiliser une valeur de `period` hors de ces 3 valeurs.
**Ne jamais** ajouter un nouveau cas de période sans mettre à jour la contrainte DB.

`detectPeriod()` dans `src/lib/fec.ts` retourne `'N' | 'N-1' | 'N-2'` :
- `maxY >= cy`     → `'N'`
- `maxY === cy-1`  → `'N-1'`
- `maxY <= cy-2`   → `'N-2'`

Si une nouvelle valeur de période est ajoutée dans le code, exécuter en SQL :
```sql
ALTER TABLE company_data DROP CONSTRAINT IF EXISTS company_data_period_check;
ALTER TABLE company_data ADD CONSTRAINT company_data_period_check
  CHECK (period IN ('N', 'N-1', 'N-2', '<nouvelle_valeur>'));
```

### 10. Parser FEC — formats de colonnes connus

Le parser `src/lib/fec.ts` doit supporter ces variantes de noms de colonnes :

| Colonne | Variantes reconnues |
|---------|-------------------|
| CompteNum | `comptenum`, `n° compte`, **`n° de compte`**, `no de compte`, `numero de compte` |
| EcritureDate | `ecrituredate`, `date ecriture`, `date comptable`, `date` |
| Débit | `debit`, `montant debit`, `debit eur` |
| Crédit | `credit`, `montant credit`, `credit eur` |

**Fallback compte** : exclure les valeurs à 8 chiffres (`YYYYMMDD` comme `20260101`) — c'est une date, pas un compte.

**Ne jamais** réduire la liste de variantes. Toujours ajouter, jamais supprimer.

Format EBP Grand Livre testé :
```
Code journal;Description du journal;Date;Date au format L47;N° de compte;Intitulé du compte;...;Débit;Crédit;...;Sens;...
```

### 11. Saisies manuelles (factures Achat / Vente / Dépense) — parcours complet

> **INVARIANT** : ce parcours est figé. Toute modification doit préserver les 5 règles ci-dessous.

**Stockage** — `src/modules/saisie/Saisie.tsx` insère **UNE SEULE ligne** par facture dans `manual_entries`, même avec échéancier. Les colonnes critiques :
- `entry_date` : date de la facture (YYYY-MM-DD)
- `category` : `'Vente' | 'Achat' | 'Depense' | 'Immobilisation'`
- `account_num` : extrait via `extractAcc(sub, fallback)` depuis le libellé sous-catégorie
- `payment_mode` : `'echeancier' | 'comptant' | 'virement' | ...`
- `payment_date` : date du règlement (si non-échéancier)
- `echeancier_data` : `{ nb, freq, dates: [YYYY-MM-DD] }` (si échéancier)
- `tenant_id` : obligatoire (RLS)

**Les champs `parent_id` et `source: 'echeance'` existent dans le type mais ne sont JAMAIS créés.** Ils sont réservés pour un usage futur. Le filtre `me.source !== 'echeance'` dans `Saisie.tsx` et `calc.ts` est une pré-caution — ne JAMAIS le retirer.

**Pipeline P&L** — `buildRAW` (calc.ts) classifie chaque saisie en `pn` / `p1` / `p2` selon le mois de `entry_date` :
```typescript
// Priorité : N > N-1 > N-2, basée sur l'appartenance aux mois FEC déjà chargés
const inN  = allMsN.has(mMonth)
const inN1 = allMsN1.has(mMonth)
const inN2 = allMsN2.has(mMonth)
const plField = inN ? 'pn' : inN1 ? 'p1' : inN2 ? 'p2' : 'pn'
```
**Ne JAMAIS** simplifier en `isN1 ? 'p1' : 'pn'` — ça oublierait `p2`.

**Pipeline Trésorerie** — `Tresorerie.tsx` traite deux vues :

| Vue | Source | Comportement |
|-----|--------|--------------|
| **Réalisé** | Mois ∈ FEC (`RAW.mn`) | Lit les saisies via `pn` (déjà mergées). Si `payment_mode === 'echeancier'` : annule la contribution `pn` du mois facture, étale `ht/nb_échéances` sur les dates. Si `payment_date` ponctuel : déplace le flux de `entry_date` vers `payment_date`. |
| **Prévisionnel** | Mois ∉ FEC (futur) | Pour chaque saisie : si échéancier, ajoute `ht/nb` sur chaque date d'échéance ; si payment_date, ajoute le HT sur ce mois. Ventes → `enc`, autres → `dec`. |

**Invariant double comptage** (Tresorerie.tsx ~ligne 183, 200) :
```typescript
const realisedMonthsSet = new Set(months)  // months = RAW.mn filtré
if (!realisedMonthsSet.has(m)) {            // SKIP les mois déjà comptés en réalisé
  // ... ajouter les saisies manuelles
}
```
Sans cette garde, les échéances tombant sur un mois FEC sont comptées 2 fois (une fois via `pn`, une fois via le forecast).

**Invariant symétrie forecast / forecastDetail** (Tresorerie.tsx ~ligne 181 vs 228) :
- `forecast` (totaux mensuels) ET `forecastDetail` (lignes dépliables par compte) DOIVENT appliquer **la même logique** sur les manual entries : même filtre `realisedMonthsSet`, même calcul échéancier / payment_date, même mapping catégorie → enc/dec.
- Sinon : les totaux incluent les saisies mais le détail est vide → confusion utilisateur.
- Le label de détail des saisies est `"<label||counterpart||subcategory> — <entry_date>"`, clé `__me_${me.id}`.

**Mapping catégorie → flux** (identique dans forecast et forecastDetail) :
```typescript
const bucket = me.category === 'Vente' ? enc : dec
```
Toute autre catégorie (`Achat`, `Depense`, `Immobilisation`) va dans `dec`.

**Vérification anti-régression** — après toute modif touchant Saisie ou Trésorerie :
1. Saisir une facture **Achat** 1200€ TTC, mode `echeancier`, 3 mensualités → onglet Trésorerie / Prévisionnel : Décaissements montre +400 sur 3 mois ; déplier "Décaissements" affiche la sous-ligne avec le libellé
2. Saisir une facture **Vente** 900€ TTC, mode `virement`, `payment_date` futur → Encaissements montre +900 sur le mois du payment_date
3. Si `entry_date` est dans un mois FEC : la saisie doit apparaître **dans le Réalisé**, pas dans le Prévisionnel — pas de double comptage
