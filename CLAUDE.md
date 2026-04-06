# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # TypeScript check + Vite production build (tsc -b && vite build)
npm run test      # Run tests with Vitest
npm run lint      # ESLint on src/ (.ts, .tsx)
npm run preview   # Preview production build locally
```

## Environment

Requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_ENV` (prod|test). Copy `.env.example` to `.env`. Note: the Supabase client in `src/lib/supabase.ts` currently has hardcoded credentials (test environment).

## Architecture

**French-language financial dashboard** (Adam Boards) for accountants. Imports FEC (Fichier des Ecritures Comptables) files and displays P&L, SIG (Soldes Intermédiaires de Gestion), balance sheets, ratios, budgets, and cash flow forecasts.

### Stack
Vite 5 + React 18 + TypeScript 5, Tailwind CSS 3, Zustand (global state), TanStack Query (Supabase data fetching), Supabase (auth + database + edge functions). Deploys to Netlify or Vercel (SPA with catch-all redirect).

### Path alias
`@/*` maps to `./src/*` (configured in both tsconfig.json and vite.config.ts).

### Data Flow
1. **Supabase tables**: `company_data`, `budget`, `manual_entries` — fetched via `useCompanyData` hook (TanStack Query)
2. **`buildRAW()`** in `src/lib/calc.ts` merges company data + budgets + manual entries into a single `RAWData` object
3. **`RAWData`** is stored in Zustand (`useAppStore`) and consumed by all modules
4. **`computePlCalc()`** computes P&L rows from RAWData using account structures defined in `src/lib/structure.ts`

### Key Data Types
- `RAWData`: top-level data container with `companies` (keyed by company_key), `mn`/`m1` (month arrays for N and N-1), `keys` (company keys)
- `CompanyRaw`: per-company data with `pn`/`p1` (P&L N/N-1), `bn`/`b1` (balance sheet), `bud` (budget), `cdN`/`cdN1` (client data), `veN`/`veN1` (VE entries)
- `FecAccount`: accounting data per account — `mo` (monthly debit/credit pairs), `l` (label), `e` (detailed entries)
- `SigRow`: structure definition for P&L/SIG lines — references account numbers via `accs` array, `type` is 'produit' or 'charge'

### Module Organization
`src/modules/` contains feature screens, each rendered by tab switch in `App.tsx`. Navigation is tab-based via Zustand `tab` state. Modules include: dashboard, cr (Compte de Résultat), sig, bilan, equilibre, ratios, budget, import, saisie, tresorerie, verification, creances, complementaire, aide.

### Accounting Conventions
- Account numbers follow the French PCG (Plan Comptable Général): 6xx = charges, 7xx = produits
- Solde calculation: charges = debit - credit, produits = credit - debit
- Periods: 'N' = current fiscal year, 'N-1' = previous year
- Formatting uses French locale (`fr-FR`) with narrow non-breaking spaces

### User Roles
Auth via Supabase. Role system exists but `getUserRole()` currently returns 'admin' always (test mode). Production role lookup from `user_roles` table is commented out in `src/lib/supabase.ts`.
