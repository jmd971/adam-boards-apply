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
- **DEUX bases Supabase distinctes** (vérifié dans les bundles le 12/06/2026) :
  - Démo (`demo.adamboards.fr`) → ref `fuxelqeizkmksapnetqz`
  - Prod (`app.adamboards.fr`)  → ref `bsjzhtpzvjtyrambyvrl` (projet « ADAM_BOARD_APPLI_PROD »)
  - ⚠️ Toute migration SQL doit être appliquée sur **les deux** projets. Un compte
    utilisateur créé sur la démo n'existe PAS en prod (et inversement).

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

### 5. Parser FEC — encodage, BOM et variantes de colonnes

`src/lib/fec.ts` doit :
- **Détecter l'encodage** via `readFileText(blob)` — voir [règle 22](#22-encodage-des-fichiers-comptables-ebp--sage--windows-1252). NE PAS utiliser `file.text()` (force UTF-8 → casse les exports EBP en Windows-1252).
- Striper le BOM UTF-8 en premier : `text.replace(/^﻿/, '')`
- Normaliser les fins de ligne : `.replace(/\r\n/g, '\n').replace(/\r/g, '\n')`
- Détecter les colonnes via `normHeader()` qui neutralise accents + artefacts d'encodage (`°`, `∞`, `ë`…) avant de matcher
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
| `src/lib/calc.ts` | `buildRAW`, `computePlCalc`, `mergeEntries`, `fmt`, `fiscalIndex`, `isODAccount`, `readFileText` |
| `src/lib/fec.ts` | Parser FEC : `parseFEC`, `detectCompany`, `detectPeriod`, `detectFiscalStart`, `readFileText`, `lastFecError` |
| `src/lib/roles.ts` | `canWrite(role)` — read-only si viewer/client |
| `src/lib/structure.ts` | Définition des lignes du plan comptable (SigRow) |
| `src/hooks/useCompanyData.ts` | TanStack Query → company_data + budget + manual_entries + company_settings ; pose la période (préservée si valide) |
| `src/hooks/usePeriodFilter.ts` | Filtre les mois selon `filters.startM`/`filters.endM` |
| `src/components/ui/PlTable.tsx` | Tableau P&L détaillé (catégories + sous-comptes), props `excludeOD` / `budData` |
| `src/modules/saisie/Saisie.tsx` | Saisie manuelle + OCR + CSV ; historique via store |
| `src/modules/import/Import.tsx` | Import FEC ; rattachement société existante ; auto-détection exercice |
| `src/modules/parametres/Parametres.tsx` | Réglage exercice fiscal par société (admin/superadmin) |
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

### `company_settings`
```
tenant_id, company_key, fiscal_year_start_month (1..12, défaut 1),
vat_enabled (bool, défaut false), vat_rates (jsonb { "<catégorie>": taux% })
unique(tenant_id, company_key)
```
Migrations : `011_company_settings.sql` (exercice fiscal) + `012_company_vat.sql` (TVA). Réglé dans la page Paramètres — voir règles 21 et 26.

### `company_data` — colonne ajoutée
`cash_moves jsonb` (migration `013`) : mouvements de trésorerie réels reconstruits du FEC (classe 5). **Re-import requis** pour peupler — voir règle 26.

### `manual_entries` — colonne ajoutée
`invoice_number text` (migration `014`) : numéro de facture (saisie/OCR/CSV) — voir règle 27.

### `bank_accounts`
```
tenant_id, company_key, label, balance, balance_date, notes
```
Soldes bancaires (prévisionnel de trésorerie). **Lecture avec filtre `tenant_id` explicite obligatoire** (règle 26).

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

**⚠️ Règle révisée le 2026-05-19 (exercice fiscal)** — voir l'historique ci-dessous.

**Règle ACTUELLE** : les tags du dropdown de période sont basés sur l'**appartenance aux sets `RAW.mn` / `RAW.m1` / `RAW.m2`**.

```typescript
const tag = RAW?.mn?.includes(m) ? ' ·N' : RAW?.m1?.includes(m) ? ' ·N-1' : RAW?.m2?.includes(m) ? ' ·N-2' : ''
{monthLabel(m)}{tag}  // ✅ buildRAW classe par exercice fiscal → sets fiables
```

C'est correct car depuis le support des **exercices fiscaux non calendaires** (cf règle 21), `buildRAW` classe chaque mois dans `pn/p1/p2` par exercice **réel** de la société (oct→sep aussi bien que jan→déc). Les sets `mn/m1/m2` sont donc fiables, y compris pour les FEC multi-années.

**Historique** :
- *2026-05-18* : on était passé à l'**année calendaire** (`yr === cy ? ·N`) parce que `buildRAW` dumpait les FEC multi-années dans `mn` → sets non fiables. Cette approche calendaire est désormais **FAUSSE pour les exercices décalés** (oct 2025 = N fiscal mais année civile 2025 = ·N-1).
- *2026-05-19* : `buildRAW` corrigé pour classer par exercice fiscal → retour aux sets, qui sont la source de vérité.

**JAMAIS** revenir à l'année calendaire (`new Date().getFullYear()`) pour ces tags — ça casserait les sociétés à exercice décalé.

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

**TOUJOURS** : agréger le budget par préfixes en miroir du cumul réel.

**Signe du budget — corrigé 2026-05-21** : le budget est stocké en **valeur absolue positive**, et le réel (`solde`) est affiché en **magnitude positive** pour produits comme charges. Le budget doit donc être ajouté **tel quel (positif)**, **JAMAIS** avec un signe `-1` pour les produits :
```typescript
// ❌ ANCIEN BUG : produits affichés en négatif + marge/résultat budgétés faux
const budSign = type === 'charge' ? 1 : -1
budMonths[i] += (b[i] || 0) * budSign
// ✅ budget toujours positif ; les signes de marge/résultat sont appliqués par add()
budMonths[i] += (b[i] || 0)
```

**Période du budget — corrigé 2026-05-21** : `budTotal` ne doit sommer que les mois budgétaires de la **période sélectionnée** (sinon le budget restait sur l'année entière alors que le réel suit le filtre de mois). Le budget `b[12]` est indexé par mois calendaire (`fiscalIndex` : jan=0…déc=11) :
```typescript
const selBudIdx = new Set(selectedMs.map(m => fiscalIndex(m)))
const sumBudInPeriod = (budMonths: number[]) =>
  budMonths.reduce((s, v, i) => selBudIdx.has(i) ? s + v : s, 0)
const budTotal = Math.round(sumBudInPeriod(budMonths))
```

Ces deux règles s'appliquent **partout où le budget est calculé** : `computePlCalc` (boucle catégories + `sumByPrefixes`), `getBudgetByPrefixes`, et les **sous-lignes de `PlTable`** (qui calculent leur budget indépendamment — voir [règle 22](#22-encodage-des-fichiers-comptables-ebp--sage--windows-1252) et la [règle Hors OD](#23-hors-od--comptes-dinventaire-de-clôture)).

Les agrégats `marge_eq` et `resultat_eq` sont calculés via `add()` qui propage automatiquement `budTotal` / `budMonths` une fois les rangées source remplies (les `budTotal` enfants sont déjà restreints à la période).

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

---

### 20. Budget — comptes manuels hors FEC (préfixe vs lookup exact)

**Bug corrigé 2026-05-19** : la page Budget propose **"+ Ajouter un compte"** pour créer un compte hors FEC (ex : `6280001 Cotisation CCI`). Pour que ce compte apparaisse dans les totaux de section de CR / SIG / Équilibre :

#### A. `getBudget` est en lookup exact, **insuffisant pour les sections**
Le sumByPrefixes du bloc EQ et le main loop de `computePlCalc` doivent utiliser **`getBudgetByPrefixes`** (calc.ts) qui agrège tous les comptes du budget dont la clé commence par un préfixe de `row.accs`. Sans ça, un compte budget `6280001` ne remonte jamais dans la ligne "Cotisations professionnelles" (accs=['628']).

**JAMAIS** dans `computePlCalc` main loop :
```typescript
for (const acc of accs) {
  getBudget(selCo, budData, acc, ...).forEach(...)  // ❌ rate les sous-codes/comptes manuels
}
```

**TOUJOURS** :
```typescript
getBudgetByPrefixes(selCo, budData, accs, ...).forEach((v, i) => { budMonths[i] += v * budSignRow })
for (const acc of accs) { /* cumulN/cumulN1S inchangés */ }
```

`getBudget` (lookup exact) reste utilisé **uniquement** pour le rendu d'une sous-ligne précise dans `PlTable` (ligne `acc='7060000000'` ne doit pas être agrégée à elle-même via préfixe — sinon double-comptage si un compte plus court existe aussi).

#### B. `PlTable` doit aussi itérer les comptes budget-only pour les sous-lignes
Le code qui construit `plAccs` (les sous-lignes d'une section) ne lisait que `RAW.companies[co].pn` et `.p1` (comptes FEC). Un compte ajouté manuellement dans le Budget mais absent du FEC n'apparaissait donc pas comme sous-ligne.

**TOUJOURS** ajouter une seconde boucle sur les clés de `budData[co]` avec le même filtre par préfixe. Et garder la sous-ligne même si `val == 0 && allEnts.length === 0`, à condition que `hasBudget === true`.

Vérification anti-régression :
1. Budget → "Ajouter un compte" → `6280001` "Cotisation CCI" type Charge → saisir des montants → Sauvegarder
2. CR / SIG / Équilibre + toggle Budget actif → ligne "Cotisations professionnelles" (628) doit inclure le montant de `6280001` dans la colonne Budget
3. Déplier cette section → la sous-ligne `6280001 Cotisation CCI` doit apparaître avec son budget (et `—` en Cumul N car pas dans le FEC)

---

### 21. Exercice fiscal non calendaire (oct→sep, etc.)

**Feature 2026-05-19** : une société peut avoir un exercice fiscal qui ne commence pas le 1er janvier (ex : 1er oct → 30 sep). Le réglage est **par société**, stocké dans `company_settings.fiscal_year_start_month` (1..12, défaut 1 = année civile).

#### Architecture
- **Table** : `company_settings` (migration 011), `unique(tenant_id, company_key)`
- **Hook** : `useCompanySettings` (lecture + `setFiscalYearStartMonth`)
- **Store** : `fiscalSettings: Record<company_key, startMonth>` alimenté par `useCompanyData`
- **Page Paramètres** (`src/modules/parametres/Parametres.tsx`, tab `parametres`, admin/superadmin) : règle le mois de début d'exercice par société sans SQL. Upsert `company_settings` → reconstruit `RAW` + réajuste la période.
- **Auto-détection à l'import** : `detectFiscalStart(months)` (fec.ts) infère le mois de début depuis un FEC ≥ 10 mois (premier mois chronologique). L'écran Import propose de mettre à jour `company_settings` si la valeur détectée diffère.
- **Helpers purs** (`calc.ts`) :
  - `fiscalMonthIndex(m, startMonth)` → position 0..11 dans l'exercice
  - `fiscalYearOf(m, startMonth)` → exercice de **clôture** (oct 2025→sep 2026 = "2026")
  - `currentFiscalYear(startMonth, today?)` → exercice courant

#### Invariant central — `buildRAW`
`buildRAW(companyData, budgets, manualEntries, fiscalSettings)` classe N/N-1/N-2 **par exercice fiscal, société par société** :
```typescript
const startMonth = fiscalSettings[co] ?? 1
const cfy = currentFiscalYear(startMonth)
const fy  = fiscalYearOf(m, startMonth)
const field = fy >= cfy ? 'pn' : fy === cfy - 1 ? 'p1' : 'p2'
```
- `startMonth = 1` ⇒ comportement calendaire **strictement identique** à l'historique (rétro-compat).
- La classification se fait par mois, **indépendamment du tag `row.period`** (qui était calendaire et faux pour un exercice à cheval).
- **Tout appel à `buildRAW` doit passer `fiscalSettings`** (depuis le store). Sinon (défaut `{}`) la société retombe en année civile → classification fausse après une saisie. Appels concernés : `useCompanyData`, `Saisie` (refreshStore + édition + delete + import CSV).

#### Ce qui n'a PAS eu besoin de changer
- `usePeriodFilter` : `defaultMs = RAW.mn` est déjà le bon exercice (buildRAW a classé correctement). Le décalage N-1 (`année-1`, même mois calendaire) reste valable.
- Dashboard `fyN` : `RAW.mn[last].slice(0,4)` = année de clôture = libellé correct.

#### Limitation connue — GROUPE multi-exercices
Si on agrège plusieurs sociétés aux exercices **différents**, un même mois calendaire peut tomber en `mn` pour l'une et `m1` pour l'autre → `getAdjMixed` (qui résout un seul champ par mois via `msSrc`) peut rater des données. Les **cumuls mono-société et groupes homogènes sont corrects**. Le mois-par-mois d'un groupe hétérogène est best-effort. À traiter si un client réel le nécessite.

Vérification anti-régression :
1. Société calendaire (pas de ligne `company_settings` ou `start_month=1`) → CR/SIG/Équilibre inchangés
2. `INSERT INTO company_settings(tenant_id, company_key, fiscal_year_start_month) VALUES (<tid>, '<co>', 10)` → recharger → la période N de cette société couvre oct→sep, le cumul N inclut oct-nov-déc
3. Saisir une facture en novembre → elle tombe bien dans N (pas N-1)

---

### 22. Encodage des fichiers comptables (EBP / Sage / Windows-1252)

**Bug corrigé 2026-05-21** : les exports EBP/Sage/Ciel sont souvent en **Windows-1252 (Latin-1)**, pas UTF-8. `file.text()` du navigateur décode en UTF-8 → les octets accentués deviennent invalides (`Débit` → `D�bit`, `N° de compte` → `N� de compte`) → colonnes introuvables → import vide **sans erreur claire**.

**TOUJOURS** lire les fichiers via `readFileText(blob)` (exporté de `fec.ts`) — jamais `file.text()`/`blob.text()` directement :
```typescript
export async function readFileText(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer) }
  catch { return new TextDecoder('windows-1252').decode(buffer) }  // EBP/Sage Latin-1
}
```
Utilisé dans : `Import.tsx` (FEC), `Depot.tsx` (FEC déposés), `Saisie.tsx` (CSV).

`normHeader()` dans `parseFEC` neutralise aussi les artefacts d'encodage résiduels (`°`/`∞` → `o`, `ë` → `e`, etc.) avant de matcher les colonnes — ne pas le retirer.

---

### 23. Hors OD — comptes d'inventaire de clôture

**Feature 2026-05-21** : le toggle « Hors OD » neutralise les **comptes générés uniquement en fin d'exercice** (variation de stocks, dotations, reprises, provisions congés payés, transferts de charges). But : comparer N (en cours) vs N-1 (clos) sans biais.

- **Liste centralisée** (`calc.ts`) : `OD_ACCOUNT_PREFIXES = ['603','713','681','686','687','781','787','6412','64582','791']` + helper `isODAccount(acc)`.
- **Avant**, `excludeOD` était passé à `getAdjMixed` mais **ignoré** (`_excludeOD`) → le toggle ne faisait rien. Désormais respecté **partout** où on calcule un montant :
  - `getAdjMixed`, `sumByPrefixes`, `getBudgetByPrefixes` (calc.ts)
  - sous-lignes de `PlTable.tsx` (liste des comptes + budget)
- **Cohérence** : la même fonction `isODAccount()` filtre partout → les totaux restent égaux à la somme des catégories en mode Hors OD.
- **Affichage du toggle** : `OD_TABS = ['cr','sig','equilibre','ratios']` dans `TopBar.tsx` (Ratios inclus car il calcule aussi via `computePlCalc`). Les toggles **Mois / N-1** restent réservés à `PL_TABS` (options d'affichage du tableau PlTable).
- **`excludeOD=false` (défaut)** : chemin strictement identique à l'historique (les ajouts sont court-circuités).

---

### 24. Import — rattachement à une société existante

**Feature 2026-05-21** : à l'import, un sélecteur permet de rattacher le FEC à une **société déjà en base** au lieu d'en créer une nouvelle dérivée du nom de fichier (évite les doublons type `MC EXPORT EBP` vs `SFP`).

- **`company_key` vs `company_name`** sont désormais distincts dans `PendingImport` :
  - `company` = clé identifiante stable (sans espaces), ex `SFP_CONSEIL`
  - `companyName` = nom d'affichage lisible, ex `SFP Conseil`
- **Pré-sélection** : si le nom détecté correspond (normalisation casse/espaces) à une société existante → rattachée automatiquement.
- **`confirmImport`** : pour une société existante, **conserver son `company_name`** (`RAW.companies[co].name`) — ne JAMAIS l'écraser par le nom du fichier. Pour une nouvelle société : utiliser le nom saisi (`companyName`), fallback `detectCompanyName(file.name)`.
- Le bouton Importer se bloque si une société cible est vide (mode « + Autre nom… » non rempli).

---

### 25. Période — réinitialisation DÉTERMINISTE (cohérence multi-utilisateurs)

**Itération finale 2026-05-21** : `useCompanyData` **réinitialise toujours** `startM`/`endM` à l'exercice par défaut à chaque chargement — la période ne dépend **QUE des données du tenant**, jamais du cache navigateur (localStorage).
```typescript
const defaultSet = raw.mn.length ? raw.mn : raw.m1.length ? raw.m1 : raw.m2.length ? raw.m2 : []
if (defaultSet.length > 0) {
  setFilters({ startM: defaultSet[0], endM: defaultSet[defaultSet.length - 1] })
}
```
**Pourquoi déterministe et NON préservé** : deux utilisateurs (ex : deux superadmins) sur le **même tenant** doivent voir la **même plage de mois** → donc les mêmes chiffres. Une préservation par navigateur faisait diverger leurs vues (chacun avait une période en cache différente → trésorerie/analyse différentes). L'ancienne plainte « la période revenait sur janvier » venait d'un **exercice fiscal mal réglé** (règle 21) : avec l'exercice correct, `RAW.mn` couvre tout l'exercice, donc la réinitialisation tombe sur la période complète, pas un seul mois.

---

### 26. Trésorerie v2 — réalisé cash réel + prévisionnel TTC

**Refonte 2026-05-21** (5 phases). Le module Trésorerie distingue **cash réel** (réalisé) et **prévisionnel TTC**.

#### Catégories & helpers — `src/lib/tresoCats.ts`
Les catégories `ENC_CATS`/`DEC_CATS` + `catOf` y sont **centralisées** (partagées Trésorerie + Paramètres). Helpers : `isTreasuryAccount(acc)` (classe 5), `cashCategoryOf(counterpart, pnlAccount)`, `vatRateForAccount(acc, vat)`.

#### Réalisé = mouvements de trésorerie réels (cash)
- Source : `RAW.companies[co].cashN/cash1/cash2` — mouvements de **classe 5** reconstruits du FEC (`buildCashMoves` dans `fec.ts`), pas les comptes 6/7.
- **Lire TOUS les buckets** (`cashN+cash1+cash2`) puis filtrer par `selectedMs` — JAMAIS seulement `cashN` (sinon, selon l'exercice fiscal, les mois affichés tombés dans `cash1` seraient perdus).
- **« FEC prioritaire »** : si la société a des `cashN`, le réalisé = mouvements FEC (les saisies n'alimentent que le prévisionnel, évite le double-compte). Sans FEC → réalisé = paiements des saisies.
- Catégorisation : contrepartie P&L directe (6/7) → `catOf` ; tiers 411/401 → via **lettrage** vers la facture (sinon générique « Encaissements clients »/« Décaissements fournisseurs »).

#### `buildCashMoves` (`fec.ts`) — invariants
- Regroupe par **(journal, pièce)** (pas d'`EcritureNum` dans les exports EBP) ; **exclut le journal À-Nouveaux** et les **virements internes** (écriture 100 % trésorerie).
- **Collecte RELÂCHÉE du compte** : une passe dédiée accepte le 1er chiffre 1-9 + **suffixe alpha** (`411DIVERS`, `401EDF`). `isValidAccount` (strict, que des chiffres) rejette ces comptes auxiliaires → sans cette passe, les contreparties clients/fournisseurs seraient perdues et tout tomberait en « Autres opérations ».
- `cash_moves` est **figé à l'import** (stocké dans `company_data.cash_moves`, migration 013) → **un ré-import est requis** après toute évolution du parser. Données importées avant Phase 2 = `cash_moves` vides.

#### Prévisionnel
- Démarre à **MIN(balance_date)** des comptes bancaires (fallback mois courant).
- Budget **HT → TTC** via la TVA par catégorie (`vatSettings`, migration 012 : `company_settings.vat_enabled` + `vat_rates`). Réglé dans Paramètres.
- Détail au clic = **échéances prévues issues des saisies** (`forecastDetail[acc].factures`), avec n° de facture + contrepartie + lien 📎 vers le scan (URL signée, bucket privé `invoice`).

#### Anti-régression
- `bank_accounts` doit être lu avec **filtre `tenant_id` explicite** (le RLS laisse le superadmin lire tous les tenants → sinon soldes mélangés).
- `EcrituresModal` : dates stockées en **AAAA-MM-JJ** (triable), affichées en JJ/MM/AAAA via `fmtD`.

Tests : `src/lib/__tests__/tresoCash.test.ts` (helpers + reconstruction `cashMoves`).

---

### 27. Numéro de facture sur les saisies

`manual_entries.invoice_number` (migration 014). Saisi dans le formulaire Saisie, extrait par l'**OCR** (champ `invoice_number` du prompt) et l'import CSV. Sert de **référence** dans le détail prévisionnel de trésorerie (ajouté au libellé, la contrepartie restant en colonne réf).

---

### 28. Catégories de saisie — source unique `src/lib/categories.ts`

`CATEGORIES` (4 catégories × sous-catégories avec n° de compte), `SUB_ALIASES` (mots-clés
français → sous-catégorie pour la recherche), `normSub()` (normalisation accents/casse) et
`extractAcc()` (libellé « Publicité (623) » → « 623 ») sont **centralisés** dans
`src/lib/categories.ts`. `Saisie.tsx` et `CsvImportView.tsx` les importent.
**Ne jamais redéfinir ces constantes dans un module** — toute divergence casserait le
matching OCR/CSV/combobox. 78 sous-catégories, 4 comptes par défaut (706/607/626/2181).

### 29. Import CSV ventes/achats — `CsvImportView.tsx`, flux en 3 étapes

`Chargement → Mapping de colonnes → Prévisualisation` :
- **Décodage** : `decodeCsvBuffer` — UTF-8 strict, fallback ISO-8859-1, puis inversion
  de **double-mojibake** (jusqu'à 2 passes : « NumÃ©ro » → « Numéro »). Les exports de
  logiciels de facturation FR sont souvent double-encodés — ne pas simplifier ce code.
- **Mapping** : `parseCSVStructure` (en-têtes + lignes, **lignes « Total… » ignorées**),
  `detectMapping` (auto-détection par candidats, une colonne ≠ deux champs),
  `applyMapping` (→ `CsvRow[]`). L'utilisateur corrige le mapping via dropdowns ;
  Date + Montant HT obligatoires.
- **Champs** : `Nature` contenant « facture » → catégorie **Vente** ; `Encaissée le` →
  `payment_date` ; `Mode de règlement` → `payment_mode` (mapPayMode) ; n° facture + TVA lus
  ou calculés (TTC−HT). Insert en `manual_entries` avec `source: 'csv'`.
- Affectation **globale** (barre ⚡, catégorie+sous-catégorie sur toutes les lignes) ou
  **individuelle** (combobox par ligne). Lignes décochables.

### 30. Superadmin — suppression de tenant

`api/delete-tenant.ts` (DELETE, JWT superadmin vérifié comme `list-tenants`, mêmes env vars
`SUPABASE_SERVICE_ROLE_KEY` + `VITE_SUPABASE_URL`). Supprime en cascade :
`company_data`, `budget`, `manual_entries`, `bank_accounts`, `user_roles`, puis `tenants`.
Le tenant système `00000000-0000-0000-0000-000000000001` est **protégé** (403).
UI : bouton 🗑 + modal de confirmation dans `SuperadminDashboard.tsx`.

### 31. Dashboard — tooltips pédagogiques (langage NON financier)

- `SIMPLE_TIPS` (par bloc) et `ALERT_TIPS` (par id de seuil d'alerte) dans `Dashboard.tsx` :
  explications **grand public, sans jargon comptable** affichées au survol.
- Composants : `SectionTitle` (titre de section + ⓘ + infobulle) et `AlertCard`
  (carte d'alerte survolable). Les 4 `KpiCard` passent `tooltip={SIMPLE_TIPS.x}`.
- Le **détail technique** (formules, comptes, seuils) reste dans `DASH_EXPLANATIONS`
  (bouton ℹ → `ExplainModal`). **Ne pas remplacer le vocabulaire simple des tooltips
  par du jargon** — c'est une demande explicite (utilisateurs non financiers).

### 32. Contraste — règles de couleurs texte (plaintes clients corrigées)

Audit WCAG sur fond carte `#0d1424` — palette corrigée le 12/06/2026 :
- `--text-2: #94a3b8` (titres de sections, 7.17:1 ✅ AA) — **ne pas re-assombrir**
- `--text-3: #64748b` (texte atténué/décoratif uniquement, 3.86:1)
- `#475569` est **banni comme couleur de texte** (2.43:1 illisible) — il a été remplacé
  partout par `#94a3b8` (159 occurrences). Ne pas le réintroduire.
- Labels de formulaires : **11px minimum** (10px → 11px appliqué).
- Le bloc print de `styles.css` (fond blanc, `.dashboard-print`) a ses propres
  variables — ne pas le toucher en modifiant le thème sombre.

### 33. Filtres persistés — purge quand le tenant n'a aucune donnée

`useCompanyData` : si `raw.keys.length === 0` (compte neuf sans FEC ni saisie),
**purger** `selCo: []`, `budCo: ''`, `startM/endM: ''`. Sinon le localStorage
(`adamboards-store`) ressort le nom d'une société et la période d'un AUTRE compte
en tête du Dashboard (bug constaté à chaque création de compte).

### 34. Budget — détail des écritures réalisées au clic

Chaque ligne de compte du tableau Budget avec des écritures réalisées affiche un badge
« X éc. » et ouvre `EcrituresModal` au clic (`mergeEntries(RAW, [budCo], 'pn', acc)` —
FEC + saisies confondues, comme Équilibre/CR). Le `cumN` envoyé au modal est le solde
sens-métier : `debit−credit` si charge, `credit−debit` si produit. Les comptes sans
écritures restent non cliquables (pas de badge).

### 35. Inscription — provisioning automatique du tenant

`LoginPage.tsx` mode signup : champ « Nom de la société » obligatoire, puis
`signUp()` + RPC `provision_new_user(p_user_id, p_tenant_name, p_role:'admin')`
(migration 004, SECURITY DEFINER, vérifie `p_user_id == auth.uid()`).
Crée atomiquement le tenant + le rôle admin. **Sans cet appel**, l'utilisateur arrive
sans tenant ni rôle (vues vides, rôle Consultation).
NB : Supabase exige la **confirmation d'email** avant la première connexion
(`email_confirmed_at`) — cause n°1 des « je ne peux pas me connecter ».

### 36. Plan comptable — référentiel officiel `src/lib/pcg.ts`

PCG 2025 officiel (règlement ANC n°2022-06) : **856 comptes** générés depuis
`PCG_2025_Plan_Comptable_General.xlsx` (fourni par Jean-Marc — ne pas éditer le TS à la
main, régénérer depuis le xlsx). Helpers : `pcgLabel(code)` et `suggestFromPCG(texte, classe)`.

**Suggestion de sous-catégorie en Saisie — ordre de priorité imposé :**
1. **Tiers connu du FEC** (p1 = N-1 prioritaire, puis pn) → compte le plus utilisé pour ce tiers
2. **Libellé** → alias métier (`SUB_ALIASES`), puis intitulés officiels du PCG
   (la suggestion porte alors le code exact, ex « Locations immobilières (6132) »)
3. **Historique des saisies manuelles** (scoring tiers/libellé)
Ne pas réordonner sans demande explicite — l'ordre 2↔3 a été inversé à la demande du 13/06/2026.

### 37. Saisie — acomptes et règlements de factures N-1 (`operation_type`)

`manual_entries.operation_type` (migration 016, appliquée sur les DEUX bases) :
- `facture` (défaut) : comportement historique — charge/produit de l'exercice.
- `acompte` : avance sur facture non encore reçue/émise. Compte auto : **4091**
  (fournisseur, catégories Achat/Depense/Immobilisation) ou **4191** (client, Vente).
- `reglement_n1` : encaissement/décaissement d'une facture comptabilisée en N-1.
  Compte auto : **401** (fournisseur) ou **411** (client).

**Invariant critique** : `buildRAW` EXCLUT `acompte` et `reglement_n1` du P&L
(comme `source==='echeance'`) — ces opérations sont des mouvements de trésorerie purs,
jamais des charges/produits de N. `manualEntriesToTransactions` (RFM/Ventes) les exclut
aussi. Elles alimentent la trésorerie via `payment_date`/`entry_date` (compte 4xx hors
catégories standard → branche eM/dM). Le formulaire masque la sous-catégorie et affiche
le compte automatique + une explication. Badge « Acompte » / « Règlt N-1 » dans l'historique.
**Phase 2 — imputation (migration 017, appliquée sur les DEUX bases)** :
`manual_entries.acompte_invoice_id` (FK → manual_entries.id, ON DELETE SET NULL).
À la saisie d'une facture, panneau « Acomptes disponibles » (même société, même sens
client/fournisseur, non imputés) → cases à cocher + « Net à régler ». En Trésorerie
(réalisé sans FEC, prévisionnel totaux + détail), le règlement d'une facture est réduit
de la somme de ses acomptes imputés (`buildImputedMap` + `netFactor` dans Tresorerie.tsx) —
l'acompte ayant déjà été compté à sa propre date de paiement. Supprimer la facture libère
ses acomptes (SET NULL en base + patch du store local). Badge « Acompte ✓ imputé ».

### 38. Détail d'un compte — section « Budget » dans la fenêtre écritures (CR / Équilibre / SIG + Budget)

`EcrituresModal` (`src/components/ui/EcrituresModal.tsx`) affiche, SOUS les écritures
réalisées, une section « 📋 Détail budget ».
- Données via le prop `budChildren: { name; b[12] }[]` — helper EXPORTÉ
  `budChildrenForAccount(budData, selCo, acc)` du même fichier.
- **Invariant** : le helper renvoie les SOUS-COMPTES nommés s'il y en a, SINON il retombe
  sur la ligne budget du compte (« Budget du compte »). Il ne renvoie `[]` QUE si le compte
  n'a aucun budget. ⇒ ne JAMAIS le restreindre aux seuls sous-comptes (régression : budget
  absent du détail pour les comptes sans sous-compte, vu dans Équilibre).
- Prop `budSelMonths={selectedMs}` : la section ne somme/affiche QUE les mois sélectionnés
  (mêmes index calendaires que `sumBudInPeriod`) → le total concorde avec la colonne Budget
  du tableau. Sans ce prop (menu Budget) → vue annuelle 12 mois.
- **Câblage à conserver dans LES 3 modules** `cr/CompteResultat.tsx`, `equilibre/Equilibre.tsx`,
  `sig/Sig.tsx` : `onOpenModal={(t,e,_,n,n1,acc)=>setModal({...,budChildren: budChildrenForAccount(budData,<selCo>,acc)})}`
  + `<EcrituresModal {...modal} budSelMonths={selectedMs} .../>`. `PlTable.onOpenModal` DOIT
  transmettre `acc` en 6e argument (2 sites d'appel : bilan + P&L).

### 39. Budget — regroupement par racine DÉPLIÉ par défaut + comptes visibles après génération

`Budget.tsx` regroupe les comptes par racine 3 chiffres (couche d'affichage uniquement).
- **Invariant** : un groupe est OUVERT par défaut —
  `const open = isSearching || grpOpen[g.root] !== false` (undefined ⇒ ouvert ; repli explicite
  ⇒ `false`). NE PAS revenir à `!!grpOpen[g.root]` (régression : les comptes générés depuis le
  FEC N-1, codes longs type 6037/6242, restaient cachés sous des groupes repliés).
- `handleGenerate` ET `handleCreateAndGenerate` font `setGrpOpen({})` (tout déplier) pour
  révéler les comptes fraîchement générés.
- `handleCreateAndGenerate` DOIT générer les lignes (`buildBudFromRaw(budCo)`), pas créer une
  version vide. `buildBudFromRaw(co, base)` = source unique de génération (réutilisée par les deux).

### 40. Budget — clic sur un compte = écritures réalisées + budget (voir aussi #34)

Dans `Budget.tsx`, le clic sur le code+libellé d'un compte ouvre `EcrituresModal` (`ecrModal`) :
- `entries = mergeEntries(RAW, [budCo], 'pn', acc)` (écritures réalisées N) ;
- `budChildren` = sous-comptes du compte, SINON `[{ name:'Budget du compte', b: bv.b }]`.
Le clic est porté par un `<span>` autour du code+libellé (curseur + badge « N éc. »), PAS par
toute la cellule → les boutons Recopier / sous-compte / hypothèse ne déclenchent pas la modale.
Ce détail a déjà régressé (perdu lors du refactor sous-comptes/regroupement) — à préserver.

> ⚠️ Règle générale : `EcrituresModal` et `PlTable` sont des composants PARTAGÉS. Toute
> modification doit être vérifiée sur TOUS leurs consommateurs (CR, Équilibre, SIG, Budget),
> pas seulement celui en cours.
