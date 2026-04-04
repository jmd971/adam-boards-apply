# Adam Boards — Application Vite/React/TypeScript

## Stack
- **Vite 5** + **React 18** + **TypeScript 5**
- **TanStack Query** (cache Supabase)
- **Zustand** (état global)
- **Tailwind CSS 3** (styles)
- **Supabase** (BDD + Auth + Edge Functions)

## Démarrage

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos clés Supabase

# 3. Lancer en développement
npm run dev

# 4. Build production
npm run build
```

## Variables d'environnement

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | URL Supabase (ex: https://xxx.supabase.co) |
| `VITE_SUPABASE_ANON_KEY` | Clé anonyme Supabase |
| `VITE_ENV` | `prod` ou `test` |

## Structure

```
src/
├── types/index.ts       ← Tous les types TypeScript
├── lib/
│   ├── supabase.ts      ← Client Supabase
│   ├── fec.ts           ← Parsing FEC
│   ├── calc.ts          ← Calculs financiers
│   └── structure.ts     ← Structures SIG, CR, EQ
├── store/index.ts       ← Zustand store
├── hooks/
│   └── useCompanyData.ts ← TanStack Query
├── components/
│   ├── layout/          ← Sidebar, TopBar
│   └── ui/              ← KpiCard, PlTable, Spinner
└── modules/
    ├── auth/            ← LoginPage
    ├── cr/              ← Compte de résultat ✅
    ├── sig/             ← SIG ✅
    ├── import/          ← Import FEC ✅
    ├── equilibre/       ← À développer
    ├── tresorerie/      ← À développer
    ├── saisie/          ← À développer
    ├── budget/          ← À développer
    └── ...
```

## Déploiement Netlify

Le fichier `netlify.toml` configure automatiquement le build.
Il suffit de connecter le repo GitHub à Netlify.

## Migration depuis l'ancienne version

Les données Supabase sont **compatibles à 100%** — même schéma, même tables.
Seul le frontend change. La migration est transparente pour les clients.

## Modules à compléter (Phase 2-3)

Les modules marqués "En développement" dans l'UI sont des placeholders.
Voir `src/modules/_placeholder.tsx`.

Priorité suggérée pour le stagiaire :
1. `tresorerie/` — Trésorerie prévisionnelle
2. `saisie/` — Saisie manuelle avec écheancier
3. `budget/` — Éditeur de budget
4. `bilan/` — Affichage bilan
5. `equilibre/` — Tableau équilibre
