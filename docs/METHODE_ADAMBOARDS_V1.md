# La Méthode AdamBoards — Spécification V1
### Rapport mensuel d'analyse du compte de résultat

*Version 1.0 — 17 juillet 2026 — d'après l'entretien méthode de Ghassan du 14/07/2026*

---

## 1. Principe fondateur

> **On n'explique pas une variation par un commentaire, on l'explique par les écritures.**
> Chaque écart du compte de résultat doit être rattaché à des écritures identifiées, comparées à ce qui était attendu.

La méthode est **descendante** : du résultat net vers les écritures, jamais l'inverse. Et elle repose sur un moteur de détection **100 % déterministe** (code, reproductible, testable). L'IA n'intervient qu'en toute fin, pour la rédaction en langage dirigeant — jamais pour calculer ou détecter.

**Lecteur cible** : le chef d'entreprise. Le corps du rapport est en langage dirigeant (zéro jargon comptable, montants arrondis, messages clés). Les éléments techniques vont en annexes.

---

## 2. Le pipeline en 5 étapes

### Étape 1 — Cadrage : le résultat net

Période sélectionnée N vs même période N-1 (vs attendus, cf. étape 3), systématiquement en **trois grandeurs** :

| Grandeur | Exemple (cas SFP du transcript) |
|---|---|
| Montant (€) | −69 k€ vs −40 k€, soit −29 k€ |
| Variation (%) | dégradation de 71 % |
| **Points de % du CA** | 6,1 % du CA vs 3,0 %, soit **−3,1 points** |

Les points de % du CA sont la métrique de référence de la méthode : elle neutralise l'effet volume et dit si la structure de rentabilité s'améliore ou se dégrade.

### Étape 2 — Apprentissage des patterns (le cœur du moteur)

Sur l'historique disponible (N-1, et N-2 si fourni), pour chaque couple **(compte, tiers)** — voir §4 pour l'identification du tiers :

- **Fréquence** : délai médian entre écritures → mensuel / bimestriel / trimestriel / semestriel / annuel / irrégulier
- **Régularité de date** : jour d'apparition typique (ex : "vers le 10 du mois", tolérance ±5 jours)
- **Stabilité du montant** : montant médian + dispersion

Classification en 3 types :

| Type | Définition | Exemple |
|---|---|---|
| **Récurrent strict** | date régulière + montant stable | Honoraires expert-comptable 500 €/mois, abonnement client Dupont |
| **Récurrent variable** | date régulière, montant fluctuant | Carburant, électricité → candidat saisonnalité |
| **Ponctuel** | pas de pattern | Achat exceptionnel, prestation one-shot |

### Étape 3 — Génération des attendus (= budget implicite)

Chaque pattern récurrent produit des **attendus datés** pour la période N : *"~500 € de vente au client Dupont vers le 10 de chaque mois"*.

**Décision structurante** : il n'y a pas de budget saisi dans AdamBoards aujourd'hui. Les attendus **tiennent lieu de budget implicite** en V1. Le jour où le module budget existera, il se pré-remplira à partir de ces mêmes attendus (c'est exactement la construction budgétaire décrite par Ghassan : fréquence + tiers + libellé + montant + délai → lignes budgétaires). Un seul moteur sert les deux usages.

### Étape 4 — Confrontation et décomposition des variations

Chaque écriture de N est rapprochée des attendus. Quatre verdicts :

- **Conforme** — l'attendu est là, au bon montant
- **Manquant** — l'attendu n'apparaît pas (ex : 2 000 € au lieu de 5 × 500 € → il manque un mois). Génère une question : *abonnement terminé ? prélèvement sauté ? oubli de facturation ?*
- **Montant anormal** — présent mais hors tolérance (cf. §5)
- **Nouveau** — écriture sans équivalent dans l'historique

La variation de chaque compte se décompose alors mécaniquement :

> **Variation du compte = attendus manquants + nouveaux éléments + écarts de montant sur récurrents + résiduel**

C'est cette équation qui rend le rapport factuel : *"Ventes de marchandises : −33 k€ (−30 %), dont −12 k€ = client X disparu, −8 k€ = baisse de volume chez Y, −13 k€ = ponctuel non renouvelé."*

**Saisonnalité** : activée uniquement si ≥ 24 mois d'historique. Sert à ajuster l'attendu des récurrents variables (ex : carburant plus élevé en été pour un livreur d'eau) au lieu de les comparer à une moyenne plate.

### Étape 5 — Restitution hiérarchisée

Rapport = **page web interactive dans l'app** (sections dépliables), pas un PDF figé. Tout est montré, organisé du synthétique au détaillé :

| Niveau | Contenu | Qui produit |
|---|---|---|
| **0** | Résultat net (3 grandeurs) + 3-5 messages clés | IA (rédaction seule) |
| **1** | Ventes → Marge → Charges → Résultat, dans l'ordre descendant | Moteur |
| **2** | Chaque compte : variation décomposée (équation §Étape 4) | Moteur |
| **3** | Écritures et attendus, dépliables | Moteur |
| **Annexe A** | **Questions à votre comptable** — générées depuis les manquants/anomalies | Moteur + IA (formulation) |
| **Annexe B** | **Recommandations de saisie** — comptes où un libellé enrichi débloquerait de l'analytique (immatriculations véhicules, sites pour les loyers…) | Moteur + IA |

La hiérarchisation à l'intérieur de chaque niveau se fait par **impact en € décroissant** (et en points de CA), pas par ordre de plan comptable.

---

## 3. État des données (audit base DÉMO du 17/07/2026)

Audit réalisé sur `ADAM_BOARDS_APPLI_DEMO` (Supabase `fuxelqeizkmksapnetqz`), table `company_data`.

**Modèle de données — point clé** : le fichier FEC n'est **pas** stocké en base (bucket `fec-deposits` vide). Il est parsé à l'import (côté navigateur, `fec.ts`) puis jeté ; la base ne contient que le **résultat du traitement**, par société et par exercice : `pl_data` (comptes 6/7), `bilan_data` (comptes de bilan, dont sous-comptes 401x/411x), `client_data`, `ve_entries`, `cash_moves`. **Le moteur de la méthode travaille donc exclusivement sur ces structures en base.**

**Structure de stockage** : chaque compte = objet JSON avec `l` (libellé du compte), `mo` (totaux mensuels débit/crédit) et `e` (écritures au format `[date, libellé, débit, crédit, n°pièce, flag OD]`).

**Constat n°1 — le tiers n'est pas stocké dans les écritures P&L.** Le parseur ([fec.ts](https://github.com/jmd971/adam-boards-apply/blob/main/src/lib/fec.ts)) détecte bien la colonne `CompAuxNum` (ligne ~153) et l'utilise pour `client_data` et `ve_entries`, mais **ne l'inclut pas** dans les entrées `e` de `pl_data` (ligne ~317).

**Constat n°2 — les FEC réels peuvent ne pas avoir de `CompAuxNum`.** Sur SFP (seul FEC réel de la base, 4 110 écritures N-1) : `client_data` et `ve_entries` sont vides. Le cabinet utilise à la place des **sous-comptes auxiliaires** (`401ADOBE`, `401AGRO`, `401BAGGHI`… avec le nom du tiers en libellé de compte), tous présents dans `bilan_data` avec leurs écritures. Le tiers apparaît aussi **en préfixe du libellé** des lignes P&L : `AGRODYL/MONTAGE DOSSIER…`, `GINCODEV/CREAT° SITE INTERNET`.

**Constat n°3 — la contrepartie est en base et le rapprochement fonctionne.** Vérifié sur SFP : la ligne `6226` "AGRODYL/MONTAGE DOSSIER…" (4 500 € HT, pièce `63-24`, 26/12/2024) se rapproche de la ligne `401AGRO` (4 882,50 € TTC, **même pièce, même date**). La jointure `(pièce, date)` entre `pl_data` et `bilan_data` permet donc de résoudre le tiers **entièrement depuis la base, sans re-import ni fichier FEC brut**. Bonus : les sous-comptes 401x/411x contiennent aussi les règlements (virements) → visibilité payé/impayé possible à terme.

**Constat n°4 — les sociétés de démo synthétiques** (STE_COMMERCIALE, etc.) ont des libellés normalisés `FACT MC00001 - CLIENT JUPITER` → tiers extractible par pattern sur le libellé.

---

## 4. Identification du tiers : chaîne de repli

Le moteur d'attendus a besoin d'un tiers par écriture. La résolution se fait **depuis les données déjà en base** (pas besoin du FEC brut), dans cet ordre de priorité :

1. **Contrepartie** : jointure `(pièce, date)` entre l'écriture 6/7 de `pl_data` et les sous-comptes 401x/411x de `bilan_data` → tiers = libellé du sous-compte (l'approche "contrepartie" citée par Ghassan ; vérifiée sur SFP, cf. §3)
2. **Extraction du libellé** : préfixe avant `/` ou pattern `- CLIENT X` (règles simples, testables)
3. **Clustering de libellés** : rapprochement par similarité (préfixe commun, normalisation) — dernier recours
4. **Sans tiers** : le pattern se détecte sur (compte, montant, fréquence) seuls, avec un indice de confiance dégradé

Le rapport indique le **niveau de confiance** de l'identification (le niveau 1 est sûr, le niveau 3 est une hypothèse). Quand la qualité des données limite l'analyse, l'Annexe B le dit explicitement et recommande les améliorations de saisie côté cabinet.

**Amélioration d'import (non bloquante)** : pour les futurs imports, enrichir `fec.ts` pour stocker `CompAuxNum`/`CompAuxLib` dans le tuple `e` quand le FEC les fournit (le parseur les lit déjà mais les jette) — cela renforce le niveau 1 sans re-solliciter les clients pour l'existant. ⚠️ Toute évolution du format `e` : appliquer DÉMO puis PROD, et vérifier les 4 consommateurs des composants partagés (invariants CLAUDE.md).

---

## 5. Seuils et tolérances : adaptatifs, jamais purement relatifs

Principe validé : *"10 % sur 1 000 € et 10 % sur 100 000 €, ce n'est pas la même chose."* Tous les seuils combinent donc **relatif ET absolu** :

**Tolérance de rapprochement** (une écriture correspond-elle à un attendu ?) :
```
match si |montant − attendu| ≤ max(SEUIL_ABS_MATCH, TOL_REL × attendu)
défauts : SEUIL_ABS_MATCH = 20 € ; TOL_REL = 10 %
```

**Signification d'un écart** (mérite-t-il d'être signalé ?) :
```
significatif si |écart| ≥ SEUIL_ABS_SIGNIF  ET  |écart| ≥ SEUIL_REL × base
défauts : SEUIL_ABS_SIGNIF = 500 € ; SEUIL_REL = 5 %
```
Un écart de 10 % sur 1 000 € (= 100 €) n'est pas signalé ; un écart de 10 % sur 100 000 € (= 10 000 €) l'est. Un écart de 2 % sur 500 000 € (= 10 000 €) l'est aussi, malgré son faible pourcentage.

**Hiérarchisation** : par impact en € décroissant, avec traduction en points de % du CA.

Tous les seuils sont **paramétrables par société** (`company_settings`), avec ces défauts. Rien n'est masqué pour autant (choix "tout montrer, hiérarchisé") : le non-significatif est agrégé et reste accessible en dépliant.

---

## 6. Dégradation gracieuse selon l'historique

On demandera aux clients les 2 derniers FEC, mais la méthode ne doit **jamais bloquer** si on a moins :

| Historique | Capacités actives | Mention dans le rapport |
|---|---|---|
| ≥ 24 mois | Attendus + saisonnalité + tendances | Analyse complète |
| 12–23 mois | Attendus N-1 (comparaison à période équivalente) | Complète, sans saisonnalité |
| < 12 mois | Patterns intra-exercice seulement (récurrences détectées sur N lui-même : un abonnement facturé 4 mois de suite crée un attendu pour le 5ᵉ) | Bandeau : "analyse enrichie dès réception de l'exercice précédent" |

Le rapport affiche toujours ce qu'il a pu faire et ce qui manque pour faire mieux — jamais d'erreur bloquante, jamais de silence sur les limites.

---

## 7. Architecture : on garde l'infra existante

| Existant | Devenir |
|---|---|
| Edge function `generate-rapport` | Conservée — le contenu du calcul est remplacé par le pipeline §2, qui inclut la résolution du tiers (§4) sur les données en base |
| Hook `useRapportData` | Conservé — enrichi des nouvelles structures (patterns, attendus, verdicts) |
| Table `rapports` | Conservée — le JSON stocké suit la nouvelle structure hiérarchique |
| Import FEC (`fec.ts`) | Amélioration non bloquante : conserver `CompAux` dans le tuple `e` pour les futurs imports (§4) |

Répartition code / IA :

- **Code (edge function, déterministe)** : étapes 1 à 4 — cadrage, patterns, attendus, verdicts, décomposition, seuils
- **IA (appel Claude)** : étape 5 uniquement — messages clés du niveau 0, formulation des questions de l'Annexe A, recommandations de l'Annexe B. L'IA reçoit les faits calculés, elle ne recalcule rien.

---

## 8. Ordre de mise en œuvre proposé

1. **Résolution du tiers** (chaîne §4) comme module du moteur, testée sur les données déjà en base : SFP (cas réel, jointure contrepartie + préfixe libellé) et STE_COMMERCIALE (cas propre)
2. **Moteur de patterns + attendus** (étapes 2-3) sur données DÉMO
3. **Confrontation + décomposition** (étape 4) et calcul des seuils
4. **Restitution** (étape 5) : structure hiérarchique + rédaction IA + annexes
5. Validation avec Ghassan sur le cas SFP (le cas qu'il commente dans l'entretien : il pourra vérifier que le rapport dit ce qu'il aurait dit)
6. Déploiement DÉMO → PROD
7. (Non bloquant, en parallèle) enrichissement de `fec.ts` pour conserver `CompAux` sur les futurs imports

---

*Ce document est la référence de la méthode. Toute évolution (nouveaux critères, seuils, verticales) doit le mettre à jour. À terme, ses invariants ont vocation à rejoindre le CLAUDE.md du repo pour prévenir les régressions.*
