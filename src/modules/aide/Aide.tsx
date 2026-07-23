import { useState } from 'react'
import { useAppStore } from '@/store'
import type { TabId } from '@/types'

// ─── Styles helpers ────────────────────────────────────────────────────────
const card: React.CSSProperties = { background:'var(--bg-1)', borderRadius:10, padding:16, border:'1px solid var(--border-1)', marginBottom:12 }
const tip:  React.CSSProperties = { fontSize:12, color:'#10b981', background:'rgba(16,185,129,0.08)', padding:'8px 12px', borderRadius:8, border:'1px solid rgba(16,185,129,0.2)', margin:'8px 0' }
const warn: React.CSSProperties = { fontSize:12, color:'#f59e0b', background:'rgba(245,158,11,0.08)', padding:'8px 12px', borderRadius:8, border:'1px solid rgba(245,158,11,0.2)', margin:'8px 0' }
const ex:   React.CSSProperties = { fontSize:12, color:'var(--text-3)', background:'rgba(20,30,60,0.03)', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border-1)', margin:'8px 0', fontFamily:'monospace', lineHeight:1.9 }
const body: React.CSSProperties = { fontSize:13, color:'var(--text-2)', lineHeight:1.75, marginBottom:8 }
// « 👉 En clair » : la reformulation en langage de tous les jours.
const clair: React.CSSProperties = { fontSize:12.5, color:'#a5b4fc', background:'rgba(99,102,241,0.08)', padding:'8px 12px', borderRadius:8, border:'1px solid rgba(99,102,241,0.2)', margin:'8px 0', lineHeight:1.7 }

const H = ({ color = '#1e88c7', children }: { color?: string; children: React.ReactNode }) =>
  <div style={{ fontSize:15, fontWeight:700, color, marginBottom:8 }}>{children}</div>
const G = ({ color, children }: { color?: string; children: React.ReactNode }) =>
  <span style={{ color: color || '#1e88c7', fontWeight:600 }}>{children}</span>

// ─── Sections Aide ─────────────────────────────────────────────────────────
const AIDE_TABS = [
  '⚖️ Équilibre', '📋 Compte Résultat', '📊 SIG', '🏦 Bilan', '📐 Ratios', '💰 Budget', '📖 Glossaire', '❓ Utilisation', '🧭 Les menus'
]

// Catalogue fonctionnel : chaque menu de l'application et ses fonctions clés.
const MENUS: { group: string; items: { icon: string; name: string; tab: TabId; desc: string; feats: string[] }[] }[] = [
  { group: 'Opérationnel', items: [
    { icon:'🏠', name:'Dashboard', tab:'dashboard', desc:'Vue d\'ensemble : indicateurs clés, graphiques et alertes de pilotage.', feats:[
      'KPIs CA, Marge brute, EBE, Résultat — avec tendance vs N-1',
      'Graphiques : CA N vs N-1, répartition des charges, évolution mensuelle',
      'Seuils d\'alerte personnalisables (marge, EBE, rentabilité, BFR, levier)',
      'Trésorerie prévisionnelle 12 mois et jauges d\'objectifs',
      'Export PDF',
    ] },
    { icon:'📝', name:'Saisie', tab:'saisie', desc:'Saisir ou importer des factures (ventes, achats, dépenses) hors FEC.', feats:[
      'Saisie manuelle : date, type (facture / acompte / règlement N-1), catégorie, HT/TTC, tiers',
      'Import CSV : mapping des colonnes + affectation des catégories (globale ou ligne par ligne)',
      'Choix du compte aligné sur la saisie manuelle : FEC N-1 → historique → ajout manuel',
      'Règlement : comptant, virement, chèque, ou échéancier (dates + montants par échéance)',
      'Acomptes imputables sur la facture finale ; paiements partiels à des dates différentes',
      'Édition / suppression d\'une saisie (les tableaux se recalculent)',
    ] },
    { icon:'💧', name:'Trésorerie', tab:'tresorerie', desc:'Suivi du cash réalisé et prévisionnel sur 12 mois.', feats:[
      'Vue réalisé : encaissements / décaissements par mois et par compte (dépliable)',
      'Clic sur un compte → détail des écritures',
      'Prévisionnel à partir du solde bancaire, sources « échéances à venir » et/ou « budget » (cases à cocher)',
      'Le budget pris en compte suit la version active sélectionnée',
      'Paramètres sauvegardés par société : délai client / fournisseur, remboursements, solde initial',
      'Vue journalière optionnelle',
    ] },
    { icon:'⚖️', name:'Équilibre', tab:'equilibre', desc:'Ventes − Achats = Marge, puis − Dépenses = Résultat, par catégorie. (Concept détaillé dans l\'onglet ⚖️ Équilibre.)', feats:[
      'Colonnes activables : Mois, N-1, Budget, Hors OD',
      'Clic sur une ligne → écritures réalisées + détail du budget (sous-comptes)',
    ] },
    { icon:'💰', name:'Budget', tab:'budget', desc:'Construction et pilotage du budget. (Voir aussi l\'onglet 💰 Budget.)', feats:[
      'Versions multiples + comparaison de 2 versions (écart par catégorie)',
      'Génération depuis le FEC N-1 ; édition par compte × 12 mois',
      'Sous-comptes nommés, regroupement par racine dépliable',
      '« Recopier » un montant sur plusieurs mois ; hypothèses / commentaires par compte',
      'Scénarios What-if ; clic sur un compte → écritures réalisées + budget',
    ] },
    { icon:'🎯', name:'Objectifs', tab:'objectifs', desc:'Fixer la cible de marge et calculer les objectifs de ventes et le coût horaire.', feats:[
      'Taux de marge prévisionnel éditable par société',
      'Objectif CA = Total Dépenses Budget / Taux de marge (annuel et mensuel)',
      'Coût horaire global = Total Dépenses Budget / (Nb salariés × Heures/mois × 12)',
      'Objectif de ventes exprimé en nombre d\'heures',
      'Jauges d\'avancement et tableau récapitulatif',
    ] },
    { icon:'🏦', name:'Rapprochement', tab:'rapprochement', desc:'Rapprocher le relevé bancaire avec les écritures FEC du compte banque.', feats:[
      'Import CSV du relevé (détection du séparateur et des colonnes)',
      'Choix du compte 512x ; tolérances date / montant',
      'Statuts : rapprochée, présente en banque seulement, présente au FEC seulement',
      'Filtres, recherche et taux de rapprochement',
    ] },
  ] },
  { group: 'Analyse', items: [
    { icon:'📋', name:'Compte de résultat', tab:'cr', desc:'Le « film » de l\'activité. (Concept dans l\'onglet 📋 Compte Résultat.)', feats:[
      'Résultat d\'exploitation / financier / exceptionnel, jusqu\'au résultat net',
      'Colonnes Mois / N-1 / Budget / Hors OD ; clic sur une ligne → écritures + budget',
    ] },
    { icon:'📊', name:'SIG', tab:'sig', desc:'Soldes Intermédiaires de Gestion. (Concept dans l\'onglet 📊 SIG.)', feats:[
      'Marge commerciale, VA, EBE, Résultat d\'exploitation',
      'Colonnes Mois / N-1 / Budget ; clic sur une ligne → écritures + budget',
    ] },
    { icon:'🏦', name:'Bilan', tab:'bilan', desc:'La « photo » de l\'entreprise : actif et passif. (Concept dans l\'onglet 🏦 Bilan.)', feats:[
      'Actif (immobilisations, stocks, créances, trésorerie) et passif',
      'Clic sur une ligne → détail des comptes',
    ] },
    { icon:'📐', name:'Ratios', tab:'ratios', desc:'Indicateurs de performance et seuils de référence. (Concept dans l\'onglet 📐 Ratios.)', feats:[
      'Taux de marge, VA, EBE, rentabilité nette, levier financier',
      'Repères « bon / fragile » par ratio',
    ] },
    { icon:'🧾', name:'TVA', tab:'tva', desc:'Estimation de la TVA collectée, déductible et nette à reverser.', feats:[
      'Affiché si la société est assujettie (réglé dans Paramètres)',
      'Collectée = produits × taux ; Déductible = charges × taux ; Nette = différence',
      'Détail par compte (dépliable) et cumul mensuel',
      '⚠️ Estimation : le FEC ne contient pas les comptes de TVA (445x)',
    ] },
    { icon:'🛒', name:'Ventes & Clients', tab:'ventes', desc:'Analyse commerciale et segmentation de la clientèle.', feats:[
      'Source FEC ou import d\'un fichier de ventes',
      'Segmentation clients (RFM), analyse par article, campagnes',
      'Scénarios prévisionnels',
    ] },
    { icon:'📈', name:'Complémentaire', tab:'complementaire', desc:'Synthèse commerciale, historique des ventes et clients inactifs.', feats:[
      'Synthèse : CA, charges, résultat, saisonnalité, top clients, répartition des charges',
      'Historique détaillé des transactions (recherche / filtre)',
      'Détection des clients inactifs depuis X jours',
    ] },
    { icon:'📋', name:'Créances clients', tab:'creances', desc:'Balance âgée des clients : factures à encaisser par ancienneté.', feats:[
      'Source : FEC 411x + saisies de vente non encaissées',
      'Tranches d\'ancienneté (> 90j critique → non échu), DSO (délai moyen d\'encaissement)',
      'Vues « par délai » et « par client », détail des factures au clic',
      'Relances, recherche / filtre / tri',
    ] },
    { icon:'📑', name:'Dettes fournisseurs', tab:'dettes', desc:'Balance âgée des fournisseurs : factures à payer par ancienneté.', feats:[
      'Source : FEC 40x (hors 409) + saisies d\'achat / dépense non payées',
      'Tranches d\'ancienneté, DPO (délai moyen de paiement)',
      'Vues « par délai » et « par fournisseur », détail des factures au clic',
    ] },
  ] },
  { group: 'Admin', items: [
    { icon:'📥', name:'Dépôts clients', tab:'depot', desc:'Permettre à un client de déposer son FEC via un lien public, sans compte.', feats:[
      'Création d\'un lien partageable par société et période',
      'Activation / désactivation des liens',
      'File des dépôts en attente, prévisualisation, puis intégration ou rejet',
    ] },
    { icon:'📁', name:'Import', tab:'import', desc:'Importer les fichiers FEC (N, N-1, N-2). Voir aussi la section ❓ Utilisation.', feats:[
      'Glisser-déposer ; société et période détectées automatiquement',
      'Formats : Grand Livre EBP (.txt/.csv), séparateur tabulation ou point-virgule',
    ] },
    { icon:'🔍', name:'Vérification', tab:'verification', desc:'Contrôler l\'intégrité des données importées.', feats:[
      'Nombre d\'écritures, équilibre débit / crédit',
      'Repérer une société ou une période vide',
    ] },
    { icon:'⚙️', name:'Paramètres', tab:'parametres', desc:'Configuration par société.', feats:[
      'Mois de début d\'exercice fiscal (reclassement automatique N / N-1)',
      'Assujettissement à la TVA + taux par catégorie (utilisés en prévisionnel et dans le menu TVA)',
      'Édition réservée aux administrateurs',
    ] },
  ] },
]

const QUICK: { step: string; label: string; tab: TabId; icon: string }[] = [
  { step:'1', label:'Importer les fichiers FEC',     tab:'import',    icon:'📁' },
  { step:'2', label:'Analyser le Compte de Résultat',tab:'cr',        icon:'📋' },
  { step:'3', label:'Consulter les SIG',             tab:'sig',       icon:'📊' },
  { step:'4', label:'Générer le budget depuis N-1',  tab:'budget',    icon:'💰' },
  { step:'5', label:'Suivre les objectifs',          tab:'objectifs', icon:'🎯' },
]

export function Aide() {
  const setTab = useAppStore(s => s.setTab)
  const RAW    = useAppStore(s => s.RAW)
  const [sec,  setSec]  = useState(0)

  const btnSt = (i: number): React.CSSProperties => ({
    padding:'10px 14px', fontSize:12, fontWeight: sec===i ? 700 : 500, cursor:'pointer',
    border:'none', borderBottom: sec===i ? '2px solid #1e88c7' : '2px solid transparent',
    background:'transparent', color: sec===i ? 'var(--text-0)' : 'var(--text-2)', whiteSpace:'nowrap' as const,
  })

  return (
    <div className="ab-light" style={{ padding:'20px 24px', maxWidth:900, background:'var(--bg-0)', minHeight:'100%' }}>
      <div style={{ fontSize:20, fontWeight:800, color:'var(--text-0)', marginBottom:4 }}>Vos chiffres, expliqués simplement</div>
      <div style={{ fontSize:13, color:'var(--text-2)', marginBottom:16 }}>
        Pas besoin d'être comptable. Ici, tout est expliqué avec des mots de tous les jours et des exemples concrets, pour piloter votre entreprise l'esprit tranquille.
        {RAW && <span style={{ marginLeft:12, color:'var(--text-1)' }}>· {RAW.keys.length} société(s) · {RAW.mn.length} mois N</span>}
      </div>

      {/* Navigation */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border-1)', marginBottom:20, overflowX:'auto', position:'sticky', top:0, zIndex:8, background:'var(--bg-0)' }}>
        {AIDE_TABS.map((t, i) => <button key={i} style={btnSt(i)} onClick={() => setSec(i)}>{t}</button>)}
      </div>

      {/* ── 0. ÉQUILIBRE ── */}
      {sec === 0 && <div>
        <div style={card}>
          <H color="#8b5cf6">Le principe, en une phrase</H>
          <p style={body}>Votre entreprise va bien quand ce qu'elle vend rapporte plus que ce qu'elle dépense. C'est exactement comme un budget de famille : il faut que les rentrées dépassent les sorties. Tout le reste n'est qu'une façon plus précise de regarder ça.</p>
          <div style={ex}>
            <G color="#10b981">Ventes</G> (ce que vos clients vous paient)<br/>
            − <G color="#f97316">Achats</G> (matières, marchandises, sous-traitance)<br/>
            = <G color="#8b5cf6">Marge</G> (ce qu'il reste pour payer vos charges)<br/>
            − <G color="#ef4444">Dépenses</G> (salaires, loyers, assurances, impôts…)<br/>
            = <G color="#1e88c7">Résultat</G> (ce que l'entreprise gagne ou perd)
          </div>
          <div style={clair}>👉 En clair : s'il vous reste de l'argent une fois que TOUT est payé, vous êtes gagnant. Sinon, deux leviers : vendre plus, ou dépenser moins.</div>
        </div>
        <div style={card}>
          <H color="#10b981">Les ventes — l'argent qui rentre</H>
          <p style={body}>Ce sont toutes les rentrées liées à vos clients. Petit piège à connaître : dès que vous envoyez une facture, c'est compté comme une vente… même si le client ne vous a pas encore payé. Il peut vous devoir cet argent pendant 30, 60, voire 90 jours.</p>
          <div style={tip}>💡 Gardez un œil sur le délai entre « j'ai facturé » et « j'ai été payé ». Si vos clients règlent en 60 jours mais que vous payez vos fournisseurs en 30, c'est vous qui avancez l'argent entre les deux.</div>
        </div>
        <div style={card}>
          <H color="#f97316">Les achats — ce que coûte ce que vous vendez</H>
          <p style={body}>Ce sont les dépenses directement liées à ce que vous vendez : matières premières, marchandises, sous-traitance. C'est tout à fait normal qu'elles montent quand vous vendez plus.</p>
          <div style={ex}>Exemple : vous vendez un produit 1 000 €.<br/>Il vous a coûté 400 € à fabriquer ou acheter.<br/>Il vous reste 600 € de marge (soit 60 %).</div>
        </div>
        <div style={card}>
          <H color="#8b5cf6">La marge — ce qu'il reste pour vivre</H>
          <p style={body}>La marge, c'est ce qui reste une fois les achats payés. C'est avec elle que vous réglez tout le reste : salaires, loyer, assurances… D'où son nom : plus elle est grande, plus vous avez de marge de manœuvre.</p>
          <div style={warn}>⚠️ Si vos ventes montent mais que votre marge baisse, c'est un signal : vous vendez plus, mais moins bien. Regardez vos prix de vente et vos coûts d'achat.</div>
        </div>
        <div style={card}>
          <H color="#ef4444">Les dépenses — le train de vie</H>
          <p style={body}>Ce sont les charges qui tombent chaque mois, que vous ayez vendu ou non : loyer, salaires, assurances, téléphone, comptable… C'est le coût pour « garder les lumières allumées ».</p>
          <div style={tip}>💡 Un repère utile : si vos dépenses sont de 15 000 € par mois et que vous gardez 40 € de marge sur 100 € vendus, il vous faut vendre au moins 37 500 € par mois rien que pour couvrir vos charges.</div>
        </div>
      </div>}

      {/* ── 1. COMPTE DE RÉSULTAT ── */}
      {sec === 1 && <div>
        <div style={card}>
          <H>Le compte de résultat : le film de votre année</H>
          <p style={body}>Imaginez deux documents. Le bilan, c'est une photo prise à un instant précis. Le compte de résultat, lui, c'est le film de toute votre activité sur l'année. Il répond à une seule question : est-ce que j'ai gagné ou perdu de l'argent ?</p>
          <div style={clair}>👉 En clair : on part de vos ventes, on enlève les coûts au fur et à mesure, et on regarde ce qu'il reste tout en bas. Ce « reste » s'appelle le résultat net.</div>
        </div>
        <div style={card}>
          <H color="#f97316">1. Le résultat d'exploitation — votre métier</H>
          <p style={body}>C'est ce que rapporte votre activité elle-même, sans compter les emprunts ni les coups de chance. S'il est positif, votre métier gagne de l'argent. C'est LE chiffre à regarder en premier.</p>
          <div style={ex}>Ce que l'activité rapporte : 1 900 000 €<br/>Ce que l'activité coûte : 1 850 000 €<br/><G color="#10b981">Résultat d'exploitation : +50 000 €</G> ← votre métier est rentable</div>
        </div>
        <div style={card}>
          <H color="#6366f1">2. Le résultat financier — la banque</H>
          <p style={body}>C'est surtout les intérêts que vous payez sur vos emprunts (moins le peu que rapportent vos éventuels placements). Pour une petite entreprise, il est presque toujours négatif — et c'est tout à fait normal.</p>
          <div style={ex}>Intérêts reçus (placements) : 300 €<br/>Intérêts payés (emprunts) : 2 000 €<br/><G color="#ef4444">Résultat financier : −1 700 €</G></div>
        </div>
        <div style={card}>
          <H color="#f59e0b">3. Le résultat exceptionnel — l'imprévu</H>
          <p style={body}>Tout ce qui sort de l'ordinaire et ne reviendra pas tous les ans : la vente d'un vieux véhicule, une indemnité reçue, une amende payée.</p>
          <div style={warn}>⚠️ Méfiance : un bénéfice qui vient surtout de la vente d'un matériel ne veut pas dire que votre activité tourne bien. Revenez toujours d'abord au résultat d'exploitation.</div>
        </div>
        <div style={card}>
          <H color="#1e88c7">4. L'impôt, puis le résultat net</H>
          <p style={body}>Si vous avez gagné de l'argent, l'État en prend une part : c'est l'impôt sur les sociétés (15 % jusqu'à 42 500 € de bénéfice, 25 % au-delà). Ce qu'il reste une fois l'impôt payé, c'est votre <G color="#1e88c7">résultat net</G> : le vrai « reste à la fin ».</p>
        </div>
      </div>}

      {/* ── 2. SIG ── */}
      {sec === 2 && <div>
        <div style={card}>
          <H>Les étapes de votre résultat</H>
          <p style={body}>Entre le moment où vous encaissez une vente et celui où vous comptez votre bénéfice, l'argent passe par plusieurs étapes. Les SIG (« soldes intermédiaires de gestion »), ce sont simplement ces étapes — comme les marches d'un escalier que l'on descend : à chaque marche, on voit où part une partie de l'argent.</p>
          <div style={clair}>👉 En clair : pas besoin de retenir les sigles. Ce qui compte, c'est de voir À QUEL moment votre argent s'en va — et donc où agir.</div>
        </div>
        <div style={card}>
          <H color="#10b981">1. La marge commerciale (si vous achetez pour revendre)</H>
          <p style={body}>C'est la différence entre le prix auquel vous vendez et le prix auquel vous avez acheté la marchandise. Le b.a.-ba du commerçant.</p>
          <div style={ex}>Vous vendez un article : 120 €<br/>Vous l'aviez acheté : 50 €<br/><G color="#10b981">Marge commerciale : 70 € (soit 58 %)</G></div>
        </div>
        <div style={card}>
          <H color="#14b8a6">2. La valeur ajoutée — la richesse que VOUS créez</H>
          <p style={body}>C'est la richesse que votre travail ajoute. Prenez un boulanger : il achète de la farine à 1 € et vend son pain à 3 €. Les 2 € de différence, c'est la valeur qu'il a ajoutée par son savoir-faire. Pour l'entreprise, on calcule pareil : la marge, moins ce qu'on paie à l'extérieur (loyer, sous-traitance, téléphone…).</p>
          <div style={tip}>💡 Une valeur ajoutée élevée veut dire que vous faites beaucoup de choses par vous-même. Faible, c'est souvent que vous sous-traitez beaucoup.</div>
        </div>
        <div style={card}>
          <H color="#f59e0b">3. L'EBE — ce qui reste après les salaires</H>
          <p style={body}>Une fois les salaires et charges payés, c'est l'argent que votre activité dégage réellement — avant de penser aux emprunts et à l'usure du matériel. C'est le chiffre préféré des banquiers, parce qu'il montre si votre métier génère vraiment du cash.</p>
          <div style={ex}>Part de l'EBE dans le chiffre d'affaires :<br/>Confortable : {'>'} 10 %  |  Correct : 5 à 10 %  |  Fragile : {'<'} 5 %</div>
        </div>
        <div style={card}>
          <H color="#1e88c7">4. Le résultat d'exploitation — après l'usure du matériel</H>
          <p style={body}>On retire de l'EBE « l'usure » de vos équipements (l'amortissement : un matériel perd de la valeur en vieillissant). S'il reste positif, c'est que votre activité gagne assez pour remplacer un jour vos outils de travail. Très bon signe.</p>
        </div>
      </div>}

      {/* ── 3. BILAN ── */}
      {sec === 3 && <div>
        <div style={card}>
          <H>Le bilan : la photo de votre entreprise</H>
          <p style={body}>Le bilan, c'est une photo prise à un instant donné. D'un côté, tout ce que votre entreprise possède. De l'autre, d'où vient l'argent qui a payé tout ça. Il répond à : que vaut mon entreprise, et comment est-elle financée ?</p>
        </div>
        <div style={card}>
          <H color="#1e88c7">Ce que vous possédez (l'actif)</H>
          <p style={body}><G>Le matériel durable</G> : machines, véhicules, logiciels (on dit « immobilisations »). <G>Les stocks</G> : marchandises ou matières en attente d'être vendues. <G>L'argent que vos clients vous doivent</G> (les créances). <G>L'argent en banque</G> (la trésorerie).</p>
        </div>
        <div style={card}>
          <H color="#8b5cf6">D'où vient l'argent (le passif)</H>
          <p style={body}><G color="#10b981">Votre argent et celui des associés</G>, plus les bénéfices que vous avez gardés dans l'entreprise (les « capitaux propres »). <G color="#f97316">Les emprunts bancaires</G>. <G color="#ef4444">Les fournisseurs</G> que vous n'avez pas encore payés.</p>
          <div style={clair}>👉 En clair : pensez à une maison. La maison, c'est ce que vous possédez (l'actif). Le crédit qui a servi à l'acheter, c'est ce que vous devez (le passif). Les deux côtés sont toujours égaux — d'où le mot « bilan ».</div>
        </div>
        <div style={card}>
          <H color="#14b8a6">Le BFR — l'argent qu'il faut avancer</H>
          <p style={body}>C'est l'argent que vous devez avancer en permanence pour faire tourner la boutique, le temps que vos stocks se vendent et que vos clients vous paient. On le calcule ainsi : Stocks + Argent dû par les clients − Argent dû aux fournisseurs.</p>
          <div style={ex}>Plus de 0 : vous avancez de l'argent → il vous faut de la trésorerie.<br/>Moins de 0 : vos clients paient avant vos fournisseurs → situation confortable.</div>
          <div style={warn}>⚠️ Le piège classique : une entreprise rentable qui grossit vite peut quand même manquer de trésorerie, parce qu'elle doit avancer de plus en plus d'argent. Surveillez ce point.</div>
        </div>
      </div>}

      {/* ── 4. RATIOS ── */}
      {sec === 4 && <div>
        <div style={card}>
          <H>Quelques repères pour vous situer</H>
          <p style={body}>Voyez ces indicateurs comme le tableau de bord d'une voiture : chacun surveille une chose et vous dit si tout va bien. Ils servent à vous comparer dans le temps (mieux ou moins bien que l'an dernier ?) et à votre métier.</p>
          <div style={clair}>👉 En clair : sur 100 € vendus, ces taux vous disent combien il vous reste à chaque étape.</div>
        </div>
        {[
          { label:'Taux de marge brute', formula:'Marge / CA × 100', good:'> 30%', warn2:'< 20%', desc:'Sur 100 € vendus, combien il vous reste après avoir payé les achats. Plus c\'est haut, plus vous gagnez bien votre vie sur chaque vente.', color:'#10b981' },
          { label:'Taux de valeur ajoutée', formula:'VA / CA × 100', good:'> 30%', warn2:'< 15%', desc:'La part de richesse que votre travail crée vraiment. Élevé = vous faites beaucoup par vous-même ; faible = vous sous-traitez beaucoup.', color:'#1e88c7' },
          { label:'Taux d\'EBE', formula:'EBE / CA × 100', good:'> 10%', warn2:'< 5%', desc:'Combien votre activité dégage réellement de cash, une fois les salaires payés. Le chiffre que votre banquier regarde en premier.', color:'#f59e0b' },
          { label:'Rentabilité nette', formula:'Résultat net / CA × 100', good:'> 5%', warn2:'< 2%', desc:'Sur 100 € vendus, ce qu\'il reste vraiment dans la poche tout à la fin, une fois absolument tout payé.', color:'#8b5cf6' },
          { label:'Niveau d\'endettement', formula:'Dettes bancaires / Capitaux propres', good:'< 1×', warn2:'> 2×', desc:'Compare ce que vous devez aux banques à votre propre argent. Trop élevé = vous dépendez beaucoup des banques, donc plus fragile si l\'activité ralentit.', color:'#14b8a6' },
        ].map(r => (
          <div key={r.label} style={card}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:6 }}>
              <H color={r.color}>{r.label}</H>
              <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-1)' }}>{r.formula}</span>
            </div>
            <p style={body}>{r.desc}</p>
            <div style={{ display:'flex', gap:12, fontSize:11 }}>
              <span style={{ color:'#10b981' }}>✅ Bon : {r.good}</span>
              <span style={{ color:'#ef4444' }}>⚠️ Fragile : {r.warn2}</span>
            </div>
          </div>
        ))}
      </div>}

      {/* ── 5. BUDGET ── */}
      {sec === 5 && <div>
        <div style={card}>
          <H>Le budget — votre plan pour l'année</H>
          <p style={body}>Le budget, c'est tout simplement votre plan : combien vous pensez vendre et dépenser, mois par mois. C'est votre boussole — sans lui, vous avancez à l'aveugle et vous découvrez les problèmes trop tard.</p>
          <div style={clair}>👉 En clair : vous écrivez vos prévisions une fois, puis vous comparez avec la réalité tout au long de l'année pour réagir vite.</div>
        </div>
        <div style={card}>
          <H color="#f59e0b">Comment construire un bon budget</H>
          <p style={body}><G color="#f59e0b">1. Partez de l'historique</G> : utilisez "⚡ Générer depuis FEC N-1" pour partir de vos chiffres réels de l'année passée.</p>
          <p style={body}><G color="#f59e0b">2. Ajustez compte par compte</G> : revoyez chaque poste selon vos anticipations (nouveaux contrats, hausses de loyer, recrutements…).</p>
          <p style={body}><G color="#f59e0b">3. Vérifiez le résultat prévisionnel</G> : en bas du tableau, le résultat budgété doit être positif et cohérent avec vos ambitions.</p>
          <div style={tip}>💡 Un budget mensuel est plus puissant qu'un budget annuel : il permet de détecter les problèmes dès le mois de janvier plutôt qu'en décembre.</div>
        </div>
        <div style={card}>
          <H color="#1e88c7">Comparer réel vs budget</H>
          <p style={body}>Dans les onglets CR et SIG, activez les colonnes Budget. Un écart négatif sur les produits ou positif sur les charges demande une action immédiate.</p>
          <div style={warn}>⚠️ Un budget n'est pas une contrainte rigide, c'est un repère. Révisez-le en cours d'année si votre activité évolue significativement.</div>
        </div>
        <div style={card}>
          <H color="#8b5cf6">Fonctions avancées</H>
          <p style={body}><G color="#8b5cf6">Versions multiples</G> : créez plusieurs scénarios de budget par société et comparez-en deux (écart par catégorie).</p>
          <p style={body}><G color="#8b5cf6">Sous-comptes</G> : détaillez un compte en sous-lignes nommées (ex : Logiciels → OpenAI, Claude). Les comptes sont regroupés par racine et dépliables.</p>
          <p style={body}><G color="#8b5cf6">Recopier</G> : reportez un montant sur plusieurs mois (fréquence mensuelle, trimestrielle…).</p>
          <p style={body}><G color="#8b5cf6">Hypothèses</G> : ajoutez un commentaire (💬) par compte pour justifier vos prévisions.</p>
          <p style={body}><G color="#8b5cf6">What-if</G> : simulez l'impact d'une variation (% CA, achats, charges…) sur l'EBE et le résultat.</p>
          <p style={body}><G color="#8b5cf6">Détail au clic</G> : cliquez sur un compte pour voir ses écritures réalisées et son budget dans la même fenêtre.</p>
        </div>
      </div>}

      {/* ── 6. GLOSSAIRE ── */}
      {sec === 6 && <div>
        <div style={card}>
          <H>📖 Le petit lexique</H>
          <p style={body}>Tous les mots qui font « technique », traduits en langage normal. Pas besoin de les apprendre par cœur : revenez ici dès qu'un terme vous échappe, c'est fait pour ça.</p>
        </div>
        {[
          { term:'CA', def:'Chiffre d\'affaires — le total de vos ventes sur la période.' },
          { term:'Marge brute', def:'CA moins coût des achats. Premier niveau de rentabilité.' },
          { term:'VA', def:'Valeur ajoutée — la richesse que votre travail crée vraiment (la marge, moins ce que vous payez à l\'extérieur : loyer, sous-traitance…).' },
          { term:'EBE', def:'Excédent brut d\'exploitation — ce que votre activité dégage une fois les salaires payés, avant emprunts et usure du matériel.' },
          { term:'EBITDA', def:'Équivalent anglais de l\'EBE (Earnings Before Interest, Taxes, Depreciation and Amortization).' },
          { term:'RE', def:'Résultat d\'Exploitation — EBE moins amortissements. Performance économique pure.' },
          { term:'EBIT', def:'Équivalent anglais du RE (Earnings Before Interest and Taxes).' },
          { term:'Résultat courant', def:'RE plus résultat financier. Avant éléments exceptionnels.' },
          { term:'Résultat net', def:'Ce qui reste après tout : impôts, éléments exceptionnels inclus.' },
          { term:'Amortissement', def:'Dépréciation d\'un actif dans le temps. Un véhicule de 30 000 € amorti sur 5 ans = 6 000 €/an de charge.' },
          { term:'BFR', def:'Besoin en fonds de roulement — l\'argent à avancer en permanence pour faire tourner la boutique (Stocks + Clients qui vous doivent − Fournisseurs à payer).' },
          { term:'OD', def:'Opérations diverses — écritures comptables de régularisation, sans mouvement d\'argent réel.' },
          { term:'FEC', def:'Fichier des Écritures Comptables — export standard de votre logiciel comptable.' },
          { term:'IS', def:'Impôt sur les Sociétés — 15% jusqu\'à 42 500 € de bénéfice (PME), 25% au-delà.' },
          { term:'Capitaux propres', def:'Apports des associés + bénéfices cumulés non distribués.' },
          { term:'Levier financier', def:'Ratio Dettes/Capitaux propres. Mesure la dépendance au financement externe.' },
          { term:'Taux de marge', def:'Marge / CA × 100. Part du prix de vente qui n\'est pas du coût d\'achat.' },
        ].map(({ term, def }) => (
          <div key={term} style={{ display:'flex', gap:16, padding:'10px 12px', borderBottom:'1px solid var(--border-1)', background:'var(--bg-1)', borderRadius:0 }}>
            <span style={{ fontFamily:'monospace', fontWeight:700, color:'#1e88c7', minWidth:150, flexShrink:0 }}>{term}</span>
            <span style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>{def}</span>
          </div>
        ))}
      </div>}

      {/* ── 7. UTILISATION ── */}
      {sec === 7 && <div>
        <div style={card}>
          <H>🚀 Démarrage rapide</H>
          <p style={body}>Cinq étapes pour être opérationnel. Suivez-les dans l'ordre la première fois, cliquez sur « Ouvrir » pour vous laisser guider.</p>
          {QUICK.map(({ step, label, tab, icon }) => (
            <div key={step} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <span style={{ width:20, height:20, borderRadius:'50%', background:'rgba(59,130,246,0.25)', color:'#1e88c7', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{step}</span>
              <span style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>{icon} {label}</span>
              <button onClick={() => setTab(tab)} style={{ padding:'3px 10px', borderRadius:6, background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.25)', color:'#60a5fa', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                Ouvrir →
              </button>
            </div>
          ))}
        </div>
        <div style={card}>
          <H>💡 Astuces</H>
          {[
            ['Cliquer ▸ sur une ligne P&L',    'affiche le détail des comptes comptables'],
            ['Cliquer ▸ sur une catégorie Trésorerie', 'déplie le détail par compte'],
            ['Toggle "Mois"',                   'affiche/masque les colonnes mensuelles'],
            ['Toggle "N-1"',                    'compare avec l\'exercice précédent'],
            ['Toggle "Hors OD"',                'exclut les opérations diverses'],
            ['Boutons société dans la sidebar', 'sélectionne une ou plusieurs sociétés'],
            ['Sélecteurs de date en haut',      'filtre sur une plage de mois'],
          ].map(([tip2, action]) => (
            <div key={tip2} style={{ display:'flex', gap:8, marginBottom:6, fontSize:12 }}>
              <span style={{ color:'#1e88c7', flexShrink:0 }}>▸</span>
              <span style={{ color:'var(--text-3)' }}><span style={{ color:'var(--text-2)' }}>{tip2}</span> → {action}</span>
            </div>
          ))}
        </div>
        <div style={card}>
          <H color="#10b981">Import FEC</H>
          <p style={body}>• Formats : EBP Grand Livre (.txt/.csv), séparateur tabulation ou point-virgule.</p>
          <p style={body}>• Glissez le fichier dans la zone N ou N-1 — société et période détectées automatiquement.</p>
          <p style={body}>• Si les données semblent vides : vérifiez l'onglet Vérification (nombre d'écritures, équilibre D/C).</p>
        </div>
        <div style={{ marginTop:20, padding:14, borderRadius:10, background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.15)', fontSize:12, color:'var(--text-2)' }}>
          <span style={{ color:'#10b981', fontWeight:700 }}>Adam Boards</span> · Développé par <span style={{ color:'var(--text-2)' }}>Jean-Marc Dolmaire</span>
        </div>
      </div>}

      {/* ── 8. LES MENUS ── */}
      {sec === 8 && <div>
        <div style={card}>
          <H>🧭 À quoi sert chaque menu</H>
          <p style={body}>Une visite guidée de l'application : le rôle de chaque menu, en deux mots, et ce qu'il vous permet de faire. Cliquez sur « Ouvrir » pour y aller directement.</p>
        </div>
        {MENUS.map(grp => (
          <div key={grp.group}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', margin:'18px 0 8px' }}>{grp.group}</div>
            {grp.items.map(m => (
              <div key={m.name} style={card}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:4 }}>
                  <H>{m.icon} {m.name}</H>
                  <button onClick={() => setTab(m.tab)} style={{ padding:'3px 10px', borderRadius:6, background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.25)', color:'#60a5fa', fontSize:11, cursor:'pointer', fontWeight:600, flexShrink:0 }}>
                    Ouvrir →
                  </button>
                </div>
                <p style={body}>{m.desc}</p>
                <ul style={{ margin:0, paddingLeft:18 }}>
                  {m.feats.map((f, i) => <li key={i} style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.7, marginBottom:2 }}>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>}
    </div>
  )
}
