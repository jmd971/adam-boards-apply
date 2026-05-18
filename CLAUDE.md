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

- Fusionne `company_data` FEC + `manual_entries` dans `pn`/`p1`/`p2` selon l'**année calendaire réelle** de chaque mois
- **Ignore les entries avec `company_key` vide** (`if (!mco) continue`)
- `RAW.mn` = mois de l'année cy, `RAW.m1` = cy-1, `RAW.m2` = cy-2 (basé sur l'année du mois, pas le champ `period` stocké)
- Les mois des manual_entries sont classés par appartenance exacte aux sets allMsN/allMsN1/allMsN2

**FEC multi-années — bug corrigé 2026-05-18** : Un FEC N couvrant plusieurs années (ex: Jan 2025 → Mai 2026) doit être reclassé par année calendaire dans `buildRAW`. **JAMAIS** mettre tous les mois d'un FEC `period='N'` dans `pn` sans vérifier leur année :
```typescript
// calc.ts — boucle pl_data pour les lignes period='N'
const cy = new Date().getFullYear()
for (const [m, v] of Object.entries(src.mo ?? {})) {
  const yr = parseInt(m.slice(0, 4))
  const f: 'pn'|'p1'|'p2' = yr >= cy ? 'pn' : yr === cy - 1 ? 'p1' : 'p2'
  const ms = yr >= cy ? allMsN : yr === cy - 1 ? allMsN1 : allMsN2
  ms.add(m)
  if (!companies[co][f][acc]) companies[co][f][acc] = { mo: {}, l: src.l || acc, e: [] }
  ;(companies[co][f][acc] as any).mo[m] = v
}
// Les lignes period='N-1' et 'N-2' restent dans leur field stocké (non reclassées)
```
Sans cette règle : `RAW.mn` = 17 mois au lieu de 5 → EBE/RE faux, comparaison N-1 vide, page Vérification affiche N=17 mois.

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

### `company_objectives`
```
id, tenant_id, company_key,
target_margin_rate (numeric % 0-100),
target_margin_amount (numeric €),
notes, created_at, updated_at
unique(tenant_id, company_key)
```
Migration : `supabase/migrations/010_company_objectives.sql` — à exécuter manuellement dans Supabase Studio si pas déjà fait. Hook : [useCompanyObjectives.ts](src/hooks/useCompanyObjectives.ts).

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
- `echeancier_data` : `{ nb, freq, dates: [YYYY-MM-DD], amounts?: [number] }` (si échéancier). `amounts` (en **TTC**, cash flow réel) optionnel : permet de définir un montant par échéance (ex: premier versement plus gros). Si absent, étalement équitable `amount_ttc / nb`. La somme des `amounts` n'est pas forcée d'égaler `amount_ttc` (avertissement UI uniquement).
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
| **Réalisé** | Mois ∈ FEC (`RAW.mn`) | Lit les saisies via `pn` (déjà mergées, HT). Si `payment_mode === 'echeancier'` : annule la contribution `pn` du mois facture en **HT** (car pn stocke HT), étale **TTC** (`amount_ttc / nb` ou `amounts[i]`) sur les dates d'échéance (cash flow = TTC). Si `payment_date` ponctuel : déplace le flux de `entry_date` vers `payment_date` (HT dans les buckets standard, TTC dans eM/dM). |
| **Prévisionnel** | Mois ∉ FEC (futur) | Pour chaque saisie : si échéancier, ajoute `amounts[i]` (ou `amount_ttc/nb` si `amounts` absent) sur chaque date d'échéance ; si payment_date, ajoute le **TTC** sur ce mois. Ventes → `enc`, autres → `dec`. |

**Invariant HT vs TTC** : `pn` (P&L) stocke **HT** depuis `buildRAW`. La trésorerie utilise **TTC** pour les flux cash réels (échéancier, eM/dM, paiement ponctuel). Si `amount_ttc` est vide ou 0 → fallback sur HT (rétro-compat pour anciennes saisies sans TTC). Ne PAS mélanger : annulation reste HT (cohérent avec pn), distribution est TTC (cohérent avec cash réel).

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

**Invariant Trésorerie réalisé — eA et eB synchronisés** (Tresorerie.tsx ~ligne 122-160) :
Lors de l'annulation `pn` au mois facture (échéancier) ou du déplacement `entry_date → payment_date`, **toujours** mettre à jour `eA[cat][acc].vals[mi]` (sous-compte) EN MÊME TEMPS que `eB[cat][mi]` (total catégorie). Sinon : la catégorie affiche 0 mais le sous-compte affiche encore le montant → impression de doublement visuel.
```typescript
if (ec) {
  eB[ec][mi_inv] = Math.max(0, eB[ec][mi_inv] - ht)
  if (eA[ec][acc]) eA[ec][acc].vals[mi_inv] = Math.max(0, eA[ec][acc].vals[mi_inv] - ht)
}
```
Idem pour `dB` / `dA` côté décaissements. S'applique aux DEUX endroits : annulation échéancier ET déplacement payment_date.

**Invariant distribution échéances → sous-cat du compte** (Tresorerie.tsx ~ligne 131-153) :
Pour une saisie échéancier dont le `account_num` tombe dans une catégorie standard (ENC_CATS / DEC_CATS), distribuer chaque part dans `eA[cat][acc]` ET `eB[cat]` au mois d'échéance — PAS dans `eM/dM`. Sinon le sous-compte est invisible et le montant atterrit dans la ligne anonyme "Saisies manuelles".
```typescript
const ecEch = catOf(acc, ENC_CATS)
if (me.category === 'Vente' && ecEch) {
  if (!eA[ecEch][acc]) eA[ecEch][acc] = { vals: ..., label: lbl }
  eA[ecEch][acc].vals[mi_pay] += part
  eB[ecEch][mi_pay] += part
} else { /* fallback eM/dM si compte hors cat standard */ }
```
**Garantie zéro régression sur totaux** : `tE = sum(eB) + eM` et `tD = sum(dB) + dM`. Le montant qui passe de `eM` à `eB[cat]` ne change pas la somme — seul l'affichage par compte gagne en précision.

**Édition et suppression de saisies** (Saisie.tsx) :
- `editingId: string | null` : id de la saisie en cours d'édition (null = nouvelle saisie)
- `confirmDelete: string | null` : id de la saisie pour laquelle confirmation de suppression demandée
- `handleEditFacture(e)` : charge la saisie dans `form`, scroll en haut, met `editingId` à l'id
- `handleCancelEdit()` : sort du mode édition, reset le formulaire (PAS toucher echeancier)
- `handleDeleteFacture(id)` : DELETE sur `manual_entries` avec filtre `parent_id` (enfants) puis `id` ; rebuild RAW pour propagation à tous les modules ; invalide le cache TanStack
- `handleSubmit` doit faire UPDATE si `editingId` est défini, INSERT sinon. En mode édition, remplacer l'entrée dans le store (`.map`), pas la prepend (`[new, ...]`) — sinon doublon dans l'historique
- Bouton submit change : "+ Ajouter" (bleu) → "💾 Enregistrer modifications" (orange/rouge) en mode édition, bouton "Annuler" à côté
- En mode lecture seule (`isReadOnly` = role viewer), les boutons ✏️ et 🗑 sont visibles mais désactivés

**Bilan N-2** (`src/lib/bilan.ts`) :
`computeSide()` accepte `'bn' | 'b1' | 'b2'` et `computeBilan()` retourne `{ n, n1, n2 }`. L'UI Bilan utilise actuellement `n` et `n1` ; `n2` est calculé pour usage futur (colonne N-2 dans le tableau). Ne JAMAIS retirer le calcul `n2` même si l'UI ne l'affiche pas.

**Mapping catégorie → flux** (identique dans forecast et forecastDetail) :
```typescript
const bucket = me.category === 'Vente' ? enc : dec
```
Toute autre catégorie (`Achat`, `Depense`, `Immobilisation`) va dans `dec`.

**Vérification anti-régression** — après toute modif touchant Saisie ou Trésorerie :
1. Saisir une facture **Achat** 1200€ TTC, mode `echeancier`, 3 mensualités → onglet Trésorerie / Prévisionnel : Décaissements montre +400 sur 3 mois ; déplier "Décaissements" affiche la sous-ligne avec le libellé
2. Saisir une facture **Vente** 900€ TTC, mode `virement`, `payment_date` futur → Encaissements montre +900 sur le mois du payment_date
3. Si `entry_date` est dans un mois FEC : la saisie doit apparaître **dans le Réalisé**, pas dans le Prévisionnel — pas de double comptage
4. Saisir une facture **Achat** 1200€ TTC (1000€ HT + 200 TVA) avec 3 échéances **personnalisées** 600€ / 300€ / 300€ TTC → onglet Trésorerie : voir 600 sur mois 1, 300 sur mois 2-3 (PAS 400 partout, PAS 333). Si on retire `amounts` du jsonb, étalement équitable `1200/3=400` doit revenir automatiquement (sur la base TTC, pas HT)
5. Saisir une facture **Vente** sur compte 713 (Locations) avec échéancier en mars : déplier "Autres produits" dans Réalisé → voir 713 avec le montant à chaque mois d'échéance (PAS dans la ligne "Saisies manuelles"). La catégorie "Autres produits" doit aussi totaliser ces mêmes montants
6. Cliquer ✏️ sur une saisie existante → formulaire rempli, bouton devient "💾 Enregistrer modifications", "Annuler" disponible. Cliquer 🗑 → confirmation 2 clics, suppression met à jour Trésorerie / CR / SIG immédiatement

### 12. Import FEC (manuel ou via portail dépôt) — parcours complet

> **INVARIANT** : ce parcours est figé. Toute modification doit préserver les 7 règles ci-dessous.

**Deux points d'entrée, un seul pipeline** :
1. **Import manuel** : `src/modules/import/Import.tsx` — drag & drop dans la zone N, N-1 ou N-2
2. **Portail dépôt client** : `src/modules/depot/DepotPublic.tsx` (upload anonyme via token) → `Depot.tsx` (intégration par le comptable)

Les deux finissent dans la même UPSERT vers `company_data`.

**Parsing** — `parseFEC(text)` dans `src/lib/fec.ts` retourne `{ plData, bilanData, months, entryCount, clientData, veEntries, warnings, skippedLines }`. Voir règles #5 et #10 pour les variantes de colonnes et formats supportés.

**Détection de période** — `detectPeriod(months)` retourne `{ period: 'N'|'N-1'|'N-2', fy }` :
```typescript
const maxY = parseInt(sorted[sorted.length - 1].slice(0, 4))
const cy   = new Date().getFullYear()
if (maxY <= cy - 2) return { period: 'N-2', fy: String(maxY) }
if (maxY < cy)      return { period: 'N-1', fy: String(maxY) }
return { period: 'N', fy: String(maxY) }
```
**Ne JAMAIS** changer les bornes sans mettre à jour la contrainte SQL (`company_data_period_check`) — voir règle #9.

**Garde anti-FEC trop ancien** (`Import.tsx`) :
```typescript
if (fyNum < cy - 2) { /* rejeter avec message d'erreur explicite */ }
```
La borne `cy - 2` DOIT rester alignée avec `detectPeriod` ci-dessus. Si tu change l'un, change l'autre — sinon un fichier N-3 (ex: FEC 2023 en 2026) sera accepté par l'import mais mal classé.

**Override période par la dropzone** — l'utilisateur peut forcer la période en déposant dans la zone N, N-1 ou N-2 :
```typescript
const { period, fy } = fp
  ? { period: fp.period as 'N' | 'N-1' | 'N-2', fy: detectPeriod(parsed.months).fy }
  : detectPeriod(parsed.months)
```
`fy` vient toujours de `detectPeriod` (jamais override) car il dépend des dates réelles du fichier.

**Détection du nom de société** — DEUX fonctions distinctes :
- `detectCompany(filename)` → `company_key` (technique, ex: `"FEC_SCI_TOURIZK_2025"`) — sert d'identifiant tenant-scoped
- `detectCompanyName(filename)` → `company_name` (affichage, ex: `"SCI TOURIZK"`) — préfixe `FEC` et année retirés

`buildRAW` (calc.ts) lit prioritairement `company_name` puis fallback sur `company_key` pour l'affichage.

**UPSERT Supabase** — colonnes exactes (Import.tsx et Depot.tsx, intégration) :
```typescript
sb.from('company_data').upsert({
  tenant_id,            // RLS obligatoire
  company_key,          // FEC_SCI_TOURIZK_2025
  company_name,         // SCI TOURIZK (nullable, mais à remplir)
  period,               // 'N' | 'N-1' | 'N-2'
  fiscal_year,          // '2024' | '2025' | '2026'
  pl_data,              // jsonb
  bilan_data,           // jsonb
  months_covered,       // ⚠ ARRAY text — PAS 'months'
  entry_count,
  source,               // 'manual' | 'depot'
  client_data,          // jsonb
  ve_entries,           // jsonb
}, { onConflict: 'tenant_id,company_key,period' })
```

**Pièges récurrents** :
- ⚠ La colonne s'appelle `months_covered` (ARRAY), PAS `months`. Une upsert avec `months:` retourne `Could not find the 'months' column of 'company_data' in the schema cache`.
- ⚠ `onConflict` doit inclure `tenant_id` sinon une autre société d'un autre tenant avec même `company_key` sera écrasée.
- ⚠ Si le schéma Supabase est modifié, exécuter `notify pgrst, 'reload schema'` pour rafraîchir le cache PostgREST.

**Pipeline buildRAW → modules** — `buildRAW` (calc.ts) parcourt `companyData` et route :
```typescript
const plField = row.period === 'N' ? 'pn' : row.period === 'N-1' ? 'p1' : 'p2'
const bField  = row.period === 'N' ? 'bn' : row.period === 'N-1' ? 'b1' : 'b2'
```
- `pl_data` → `companies[co][plField]` (compte de résultat)
- `bilan_data` → `companies[co][bField]` (bilan)
- `client_data` / `ve_entries` → `cdN`/`cdN1`, `veN`/`veN1` uniquement (pas de variante N-2 pour l'instant)

**Modules consommateurs et support N-2** :
| Module | Source | N-2 supporté ? |
|--------|--------|---------------|
| CR (Compte de résultat) | `pn` / `p1` via `msSrc` | ✅ via `msSrc='p2'` |
| SIG | idem | ✅ |
| Équilibre | idem | ✅ |
| Ratios | idem | ✅ |
| Bilan | `bn` / `b1` / `b2` via `computeBilan` | ✅ (calcul ; UI utilise n et n1) |
| Trésorerie | `pn` (réalisé), forecast (prévisionnel) | Partiel (réalisé sur mois FEC) |
| Dashboard KPI principaux | `pn` / `p1` hardcodé (`computeKpis`) | ❌ pas de fallback si pas de N |
| Dashboard "3 ans" | `pn` / `p1` / `p2` (`computeKpisPeriod`) | ✅ |

**Cache invalidation** — après UPSERT, **toujours** invalider la query TanStack :
```typescript
queryClient.invalidateQueries({ queryKey: ['companyData'] })
```
Sans cette invalidation, `useCompanyData` continuera à servir l'ancien snapshot pendant 5 min (staleTime).

**Initialisation des filtres** — `useCompanyData` cascade N → N-1 → N-2 si N vide :
```typescript
if (raw.mn.length > 0)      setFilters({ startM: raw.mn[0], endM: raw.mn.at(-1) })
else if (raw.m1.length > 0) setFilters({ startM: raw.m1[0], endM: raw.m1.at(-1) })
else if (raw.m2.length > 0) setFilters({ startM: raw.m2[0], endM: raw.m2.at(-1) })
```

**Vérification anti-régression** — après toute modif touchant le pipeline d'import :
1. Importer un FEC de l'année courante (`N=cy`) → doit apparaître dans CR, SIG, Bilan, Trésorerie / Réalisé pour les mois du fichier
2. Importer un FEC `cy-1` → période détectée N-1, visible dans la colonne N-1 des modules d'analyse
3. Importer un FEC `cy-2` → période détectée N-2, visible dans `msSrc='p2'` sur CR/SIG/Equilibre
4. Importer un FEC `cy-3` → **doit être rejeté** avec message d'erreur explicite
5. Importer le même fichier 2 fois → upsert (pas de doublon), même `company_data.id` (ou updated_at modifié)
6. Importer un fichier nommé `FEC SCI TOURIZK 2025.txt` → `company_key = FEC_SCI_TOURIZK_2025`, `company_name = SCI TOURIZK`
7. **FEC multi-années** (ex: FEC 2025+2026 importé en zone N) → page Vérification : Mois N = mois cy uniquement, Mois N-1 = mois cy-1. **NE PAS** voir 17 mois en N.

---

### 13. TopBar — tags ·N / ·N-1 / ·N-2 dans le sélecteur de période

**Bug corrigé 2026-05-18** : les tags dans le dropdown de période (startM / endM) doivent être basés sur l'**année calendaire du mois**, pas sur l'appartenance aux sets `RAW.mn` / `RAW.m1` / `RAW.m2`.

**JAMAIS** :
```typescript
const inN = RAW?.mn?.includes(m), inN1 = RAW?.m1?.includes(m)
{monthLabel(m)}{inN?' ·N':inN1?' ·N-1':''}  // ❌ faux si FEC multi-années (tout dans mn)
```

**TOUJOURS** :
```typescript
const yr = parseInt(m.slice(0, 4)), cy = new Date().getFullYear()
const tag = yr === cy ? ' ·N' : yr === cy - 1 ? ' ·N-1' : yr <= cy - 2 ? ' ·N-2' : ''
{monthLabel(m)}{tag}  // ✅ basé sur l'année réelle
```

Conséquence : `RAW` n'est plus lu dans `TopBar` — supprimer `const RAW = useAppStore(s => s.RAW)` pour éviter l'erreur TS6133.

---

### 14. Dashboard — étiquettes d'année fyN / fyN1 / fyN2

**Bug corrigé 2026-05-18** : dans `Dashboard.tsx`, `computeKpisPeriod` retourne `{ fyN, fyN1, fyN2 }` utilisées comme en-têtes du tableau "Tendance N vs N-1". Ces labels doivent utiliser le **dernier** mois de chaque set (le plus récent), jamais le premier.

**JAMAIS** :
```typescript
const fyN  = RAW.mn?.[0]?.slice(0, 4) ?? 'N'    // ❌ retourne la plus ancienne année si FEC multi-années
const fyN1 = RAW.m1?.[0]?.slice(0, 4) ?? 'N-1'
```

**TOUJOURS** :
```typescript
const fyN  = RAW.mn?.[RAW.mn.length - 1]?.slice(0, 4) ?? 'N'    // ✅ dernière année = la plus récente
const fyN1 = RAW.m1?.[RAW.m1.length - 1]?.slice(0, 4) ?? 'N-1'
const fyN2 = RAW.m2?.[RAW.m2.length - 1]?.slice(0, 4) ?? 'N-2'
```

Symptôme du bug : tableau "Tendance N vs N-1" affiche `2025 | 2025` au lieu de `2026 | 2025`.

---

### 15. Équilibre — toggle Budget câblé au filtre global

**Bug corrigé 2026-05-18** : dans `Equilibre.tsx`, la prop `showBudget` passée à `PlTable` doit être branchée sur `filters.showBudget` (le toggle Budget de la TopBar), exactement comme dans `CompteResultat.tsx` et `SIG.tsx`.

**JAMAIS** :
```tsx
<PlTable ... showBudget={false} ... />  // ❌ toggle TopBar ignoré
```

**TOUJOURS** :
```tsx
<PlTable ... showBudget={filters.showBudget} ... />  // ✅ cohérent avec CR / SIG
```

Vérification anti-régression : activer le toggle Budget dans la TopBar et confirmer que la colonne Budget apparaît dans **toutes** les pages d'analyse P&L (CR, SIG, Équilibre).

---

### 16. Trésorerie — libellé des sous-catégories (réalisé ET prévisionnel)

**Bug corrigé 2026-05-18** : les sous-catégories de Trésorerie (lignes dépliables sous chaque catégorie d'encaissement / décaissement) doivent afficher le **numéro de compte** (`me.account_num`) avec, en libellé, la **sous-catégorie de saisie** (`me.subcategory`). **JAMAIS** le libellé de la facture (`me.label`) qui change à chaque saisie.

#### A. Réalisé — fallback du `lbl` pour les écheanciers
Dans `Tresorerie.tsx`, useMemo `treso`, branche écheancier (~ligne 151) :

**JAMAIS** :
```typescript
const lbl = me.subcategory || me.label || acc  // ❌ tombe sur libellé facture si subcategory vide
```

**TOUJOURS** :
```typescript
const lbl = me.subcategory || acc  // ✅ fallback = numéro de compte
```

Cas déclencheur : facture émise en N-1 (rangée dans `p1` par `buildRAW`) avec écheancier dont les paiements tombent en N → le compte n'existe pas encore dans `pn` ni dans `eA[ec]`, donc créé par la branche écheancier avec ce `lbl`.

#### B. Prévisionnel — clé et label dans `forecastDetail`
Dans `Tresorerie.tsx`, useMemo `forecastDetail`, boucle `manualEntries` (~ligne 321) :

**JAMAIS** :
```typescript
const key = `__me_${me.id}`                                          // ❌ une ligne par facture
const label = `${me.label || me.counterpart || ...} — ${me.entry_date}`  // ❌ libellé facture
```

**TOUJOURS** :
```typescript
const key = me.account_num || '658'   // ✅ regroupe par numéro de compte (comme le réalisé)
const label = me.subcategory || key   // ✅ sous-catégorie ou compte, jamais libellé facture
```

Conséquences attendues :
- Les saisies de même compte s'agrègent sur une seule ligne (cohérent avec la vue budget)
- La fonction de rendu `!acc.startsWith('__') && <span>{acc}</span>` affiche désormais le numéro de compte en monospace (avant : caché par le préfixe `__me_`)
- `mergeEntries(RAW, selCo, 'pn', acc)` peut retrouver les écritures pour afficher le badge "X éc."

Vérification anti-régression :
1. Saisir une facture (Achat ou Vente) via la page Saisie avec un compte standard (ex : 623)
2. Trésorerie → Réalisé → déplier la catégorie → la sous-ligne doit afficher `623 Publicité et marketing (623)`, **pas** le libellé de la facture
3. Trésorerie → Prévisionnel → déplier Encaissements/Décaissements → idem
4. Tester avec un écheancier multi-mois ET avec une facture dont `entry_date` est en N-1 mais `payment_date` en N

---

### 17. Budget — calcul dans `sumByPrefixes` (EQ)

**Bug corrigé 2026-05-18** : dans `calc.ts`, le bloc EQ exploitation (`sumByPrefixes`) renvoyait `budTotal: 0` et `budMonths` vide. Conséquence : dans Équilibre, la colonne Budget s'affichait mais les montants étaient toujours `—`.

**JAMAIS** :
```typescript
return { ..., budMonths, budTotal: 0, accs: [] } as PlCalcRow  // ❌ budget jamais calculé pour EQ
```

**TOUJOURS** : agréger le budget par préfixes en miroir du cumul réel, avec la même convention de signe que le chemin principal (`budSign = type === 'charge' ? 1 : -1`) :
```typescript
const budSign = type === 'charge' ? 1 : -1
for (const co of selCo) {
  const bd = budData[co] ?? {}
  for (const [acc, bv] of Object.entries(bd)) {
    if (!prefixes.some(p => acc.startsWith(p))) continue
    const b = (bv as any)?.b ?? []
    for (let i = 0; i < 12; i++) budMonths[i] += (b[i] || 0) * budSign
  }
}
const budTotal = Math.round(budMonths.reduce((s, v) => s + v, 0))
```

Les agrégats `marge_eq` et `resultat_eq` sont calculés via `add()` qui propage automatiquement `budTotal` / `budMonths` une fois les rangées source remplies.

---

### 18. Sélecteur de version budget — source unique dans la TopBar

**Refonte 2026-05-18** : le sélecteur de version de budget est désormais dans la **TopBar globale** (visible quand le toggle Budget est actif). Il écrit dans `filters.budVersionKey` (format `"company_key|||version_name"`).

**Toutes les pages d'analyse qui consomment `budData`** doivent appeler le hook `useEffectiveBudData()` au lieu de lire `budData` directement dans le store. Ce hook applique automatiquement la version sélectionnée (override de `budData[co]` pour la société/version choisie, fallback sur la version active sinon).

**JAMAIS** :
```typescript
const budData = useAppStore(s => s.budData)  // ❌ ignore le sélecteur TopBar
```

**TOUJOURS** :
```typescript
import { useEffectiveBudData } from '@/hooks/useEffectiveBudData'
const budData = useEffectiveBudData()  // ✅ respecte filters.budVersionKey
```

Pages concernées (à maintenir cohérentes) : `Equilibre.tsx`, `CompteResultat.tsx`, `Sig.tsx`, `Dashboard.tsx` (pour `budDataKpis`). Le Dashboard garde son propre sélecteur local pour rétro-compat — il partage le même `filters.budVersionKey` que la TopBar, donc les deux restent synchronisés.

Vérification anti-régression :
1. Créer 2 versions de budget pour la même société (page Budget)
2. Activer le toggle Budget dans la TopBar → le dropdown doit apparaître à côté
3. Basculer entre `— Version active —` et les autres versions → la colonne Budget de **CR, SIG, Équilibre** doit changer en conséquence
4. Idem pour les KPIs budget du Dashboard

---

### 19. PlTable — propager `budData` pour le rendu des sous-comptes

**Bug corrigé 2026-05-18** : `PlTable` rend deux niveaux de budget :
- **Lignes de section** (`tot_ventes`, `ca_v`, `serv_ext`…) → consomme `plCalc[row.id].budTotal` (calculé en amont dans `computePlCalc`)
- **Lignes de détail par sous-compte** (lorsqu'une section est dépliée) → appelle `getBudget(selCo, budData, acc, ...)` directement → **nécessite la prop `budData`**

Sans la prop, le fallback `accBudget = 0` rend `—` sur toutes les sous-lignes alors que le total de section affiche correctement.

**JAMAIS** :
```tsx
<PlTable ... showBudget={filters.showBudget} /* budData manquant */ />  // ❌ sous-comptes vides
```

**TOUJOURS** :
```tsx
const budData = useEffectiveBudData()
<PlTable ... showBudget={filters.showBudget} budData={budData as any} />  // ✅ sous-comptes peuplés
```

Pages concernées : `Equilibre.tsx`, `CompteResultat.tsx`, `Sig.tsx` (et toute future page utilisant `PlTable` avec `showBudget`).

Vérification anti-régression :
1. Activer le toggle Budget dans la TopBar
2. Sur CR / SIG / Équilibre : déplier une section avec sous-comptes (ex : "Prestations de services" → `706`, `7060000000`)
3. La colonne Budget des sous-comptes doit afficher un montant (`—` uniquement si le compte n'est pas dans le budget actif)
