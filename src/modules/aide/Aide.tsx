import { useState } from 'react'
import { useAppStore } from '@/store'
import type { TabId } from '@/types'

// ─── Styles helpers ────────────────────────────────────────────────────────
const card: React.CSSProperties = { background:'#0f172a', borderRadius:10, padding:16, border:'1px solid rgba(255,255,255,0.07)', marginBottom:12 }
const tip:  React.CSSProperties = { fontSize:12, color:'#10b981', background:'rgba(16,185,129,0.08)', padding:'8px 12px', borderRadius:8, border:'1px solid rgba(16,185,129,0.2)', margin:'8px 0' }
const warn: React.CSSProperties = { fontSize:12, color:'#f59e0b', background:'rgba(245,158,11,0.08)', padding:'8px 12px', borderRadius:8, border:'1px solid rgba(245,158,11,0.2)', margin:'8px 0' }
const ex:   React.CSSProperties = { fontSize:12, color:'#64748b', background:'rgba(255,255,255,0.03)', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.06)', margin:'8px 0', fontFamily:'monospace', lineHeight:1.9 }
const body: React.CSSProperties = { fontSize:13, color:'#94a3b8', lineHeight:1.75, marginBottom:8 }

const H = ({ color = '#3b82f6', children }: { color?: string; children: React.ReactNode }) =>
  <div style={{ fontSize:15, fontWeight:700, color, marginBottom:8 }}>{children}</div>
const G = ({ color, children }: { color?: string; children: React.ReactNode }) =>
  <span style={{ color: color || '#3b82f6', fontWeight:600 }}>{children}</span>

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
    border:'none', borderBottom: sec===i ? '2px solid #3b82f6' : '2px solid transparent',
    background:'transparent', color: sec===i ? '#f1f5f9' : '#94a3b8', whiteSpace:'nowrap' as const,
  })

  return (
    <div style={{ padding:'20px 24px', maxWidth:900 }}>
      <div style={{ fontSize:20, fontWeight:800, color:'#f1f5f9', marginBottom:4 }}>Comprendre vos chiffres</div>
      <div style={{ fontSize:13, color:'#94a3b8', marginBottom:16 }}>
        Chaque notion expliquée simplement, avec des exemples concrets.
        {RAW && <span style={{ marginLeft:12, color:'#334155' }}>· {RAW.keys.length} société(s) · {RAW.mn.length} mois N</span>}
      </div>

      {/* Navigation */}
      <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,0.06)', marginBottom:20, overflowX:'auto', position:'sticky', top:0, zIndex:8, background:'#080d1a' }}>
        {AIDE_TABS.map((t, i) => <button key={i} style={btnSt(i)} onClick={() => setSec(i)}>{t}</button>)}
      </div>

      {/* ── 0. ÉQUILIBRE ── */}
      {sec === 0 && <div>
        <div style={card}>
          <H color="#8b5cf6">L'équilibre financier en une phrase</H>
          <p style={body}>Votre entreprise est en bonne santé quand ce qu'elle vend couvre largement ce qu'elle dépense. C'est aussi simple que ça.</p>
          <div style={ex}>
            <G color="#10b981">Ventes</G> (ce que vos clients vous paient)<br/>
            − <G color="#f97316">Achats</G> (matières, marchandises, sous-traitance)<br/>
            = <G color="#8b5cf6">Marge</G> (ce qu'il reste pour payer vos charges)<br/>
            − <G color="#ef4444">Dépenses</G> (salaires, loyers, assurances, impôts…)<br/>
            = <G color="#3b82f6">Résultat</G> (ce que l'entreprise gagne ou perd)
          </div>
        </div>
        <div style={card}>
          <H color="#10b981">Les ventes — entrées de trésorerie</H>
          <p style={body}>C'est tout l'argent que vos clients vous doivent quand vous émettez une facture. Attention : une vente facturée n'est pas forcément encaissée ! Un client peut vous devoir de l'argent pendant 30, 60 ou 90 jours.</p>
          <div style={tip}>💡 Surveillez le délai entre facturation et encaissement. Si vos clients paient en 60 jours mais que vous payez vos fournisseurs en 30 jours, votre trésorerie sera sous pression.</div>
        </div>
        <div style={card}>
          <H color="#f97316">Les achats — sorties directes</H>
          <p style={body}>Dépenses directement liées à votre production : matières premières, marchandises, sous-traitance. Plus vous vendez, plus vous achetez. C'est normal.</p>
          <div style={ex}>Exemple : vous vendez un produit 1 000 €.<br/>Son coût de revient est de 400 €.<br/>Votre marge = 600 € (60% de marge).</div>
        </div>
        <div style={card}>
          <H color="#8b5cf6">La marge — ce qu'il reste après les achats</H>
          <p style={body}>La marge, c'est la différence entre vos ventes et vos achats. C'est la richesse que votre activité crée AVANT de payer les charges fixes.</p>
          <div style={warn}>⚠️ Si votre marge baisse mais que vos ventes augmentent, vous vendez plus mais moins bien. Vérifiez vos prix et vos coûts d'achat.</div>
        </div>
        <div style={card}>
          <H color="#ef4444">Les dépenses — charges de fonctionnement</H>
          <p style={body}>Que vous vendiez ou non, ces charges tombent chaque mois : loyer, salaires, assurances, téléphone, comptable… C'est le « train de vie » de votre entreprise.</p>
          <div style={tip}>💡 Si vos dépenses sont de 15 000 €/mois et votre taux de marge est 40%, il vous faut au minimum 37 500 € de ventes par mois pour couvrir vos charges.</div>
        </div>
      </div>}

      {/* ── 1. COMPTE DE RÉSULTAT ── */}
      {sec === 1 && <div>
        <div style={card}>
          <H>Le compte de résultat : le film de votre année</H>
          <p style={body}>Si le bilan est une photo à un instant T, le compte de résultat est le film de votre activité sur une période. Il répond à : est-ce que mon entreprise a gagné ou perdu de l'argent cette année ?</p>
        </div>
        <div style={card}>
          <H color="#f97316">1. Le résultat d'exploitation</H>
          <p style={body}>C'est le cœur de votre activité. Produits d'exploitation moins charges d'exploitation. Si positif, votre activité est rentable indépendamment de votre financement.</p>
          <div style={ex}>Produits d'exploitation : 1 900 000 €<br/>Charges d'exploitation : 1 850 000 €<br/><G color="#10b981">Résultat d'exploitation : +50 000 €</G> ← votre activité gagne de l'argent</div>
        </div>
        <div style={card}>
          <H color="#6366f1">2. Le résultat financier</H>
          <p style={body}>Intérêts payés sur vos emprunts, moins revenus de vos placements. Pour une TPE/PME, c'est presque toujours négatif.</p>
          <div style={ex}>Produits financiers : 300 € (intérêts placement)<br/>Charges financières : 2 000 € (intérêts emprunt)<br/><G color="#ef4444">Résultat financier : −1 700 €</G></div>
        </div>
        <div style={card}>
          <H color="#f59e0b">3. Le résultat exceptionnel</H>
          <p style={body}>Ce qui sort de l'ordinaire : vente d'un véhicule, indemnité, amendes. Ces éléments ne doivent pas masquer la performance réelle de votre activité.</p>
          <div style={warn}>⚠️ Un résultat net positif grâce à une vente de matériel ne signifie pas que votre activité est rentable. Regardez toujours le résultat d'exploitation en premier.</div>
        </div>
        <div style={card}>
          <H color="#3b82f6">4. L'impôt sur les sociétés (IS)</H>
          <p style={body}>Si votre résultat courant est positif, vous payez l'IS (15% jusqu'à 42 500 € de bénéfice pour les PME, 25% au-delà). Le résultat net, c'est ce qui reste après l'IS.</p>
        </div>
      </div>}

      {/* ── 2. SIG ── */}
      {sec === 2 && <div>
        <div style={card}>
          <H>Les Soldes Intermédiaires de Gestion (SIG)</H>
          <p style={body}>Les SIG décomposent la formation de votre résultat étape par étape. Chaque solde est un indicateur de performance à suivre.</p>
        </div>
        <div style={card}>
          <H color="#10b981">Marge commerciale (activité négoce)</H>
          <p style={body}>Pour les activités d'achat-revente. C'est la différence entre le prix de vente et le coût d'achat des marchandises vendues.</p>
          <div style={ex}>Ventes marchandises : 120 €<br/>Coût d'achat : 50 €<br/><G color="#10b981">Marge commerciale : 70 € (58% de marge)</G></div>
        </div>
        <div style={card}>
          <H color="#14b8a6">Valeur Ajoutée (VA)</H>
          <p style={body}>La VA mesure la richesse créée par votre entreprise. C'est la marge globale moins les services extérieurs (loyers, sous-traitance, téléphone…). Le ratio VA/CA indique votre degré d'intégration.</p>
          <div style={tip}>💡 Un taux de VA élevé (30-40%+) signifie que vous créez beaucoup de valeur en interne. Un taux faible peut indiquer une forte sous-traitance.</div>
        </div>
        <div style={card}>
          <H color="#f59e0b">EBE — Excédent Brut d'Exploitation</H>
          <p style={body}>VA moins salaires et charges sociales. C'est la capacité de votre activité à générer de la trésorerie AVANT de payer les emprunts et les amortissements. C'est l'indicateur préféré des banquiers.</p>
          <div style={ex}>Taux d'EBE = EBE / CA<br/>Bon : {'>'} 10% | Moyen : 5-10% | Fragile : {'<'} 5%</div>
        </div>
        <div style={card}>
          <H color="#3b82f6">Résultat d'exploitation (RE)</H>
          <p style={body}>EBE moins les amortissements. Un RE positif signifie que votre activité couvre le renouvellement de vos outils de travail. C'est le vrai reflet de la performance économique.</p>
        </div>
      </div>}

      {/* ── 3. BILAN ── */}
      {sec === 3 && <div>
        <div style={card}>
          <H>Le bilan : la photo de votre entreprise</H>
          <p style={body}>Le bilan, c'est la photographie de ce que votre entreprise possède (actif) et de ce qu'elle doit (passif) à un instant T. Il répond à : combien vaut mon entreprise et comment est-elle financée ?</p>
        </div>
        <div style={card}>
          <H color="#3b82f6">L'actif — ce que vous possédez</H>
          <p style={body}><G>Immobilisations</G> : vos outils de travail durables (machines, véhicules, logiciels). <G>Stocks</G> : marchandises ou matières premières en attente. <G>Créances clients</G> : factures envoyées mais pas encore payées. <G>Trésorerie</G> : argent disponible en banque.</p>
        </div>
        <div style={card}>
          <H color="#8b5cf6">Le passif — comment vous vous financez</H>
          <p style={body}><G color="#10b981">Capitaux propres</G> : apports des associés + bénéfices accumulés. <G color="#f97316">Dettes financières</G> : emprunts bancaires. <G color="#ef4444">Dettes fournisseurs</G> : factures reçues mais pas encore payées.</p>
          <div style={tip}>💡 Actif = Passif, toujours. Si l'actif augmente, c'est parce que le passif a aussi augmenté (nouveau financement ou nouveau bénéfice).</div>
        </div>
        <div style={card}>
          <H color="#14b8a6">Le BFR — Besoin en Fonds de Roulement</H>
          <p style={body}>C'est l'argent dont votre entreprise a besoin pour fonctionner au quotidien. BFR = Stocks + Créances clients − Dettes fournisseurs.</p>
          <div style={ex}>Si BFR {'>'} 0 : vous avancez de l'argent → besoin de financement<br/>Si BFR {'<'} 0 : vos clients paient avant vos fournisseurs → position favorable</div>
          <div style={warn}>⚠️ Un BFR élevé avec une forte croissance peut créer une crise de trésorerie même avec une activité rentable.</div>
        </div>
      </div>}

      {/* ── 4. RATIOS ── */}
      {sec === 4 && <div>
        <div style={card}>
          <H>Les ratios financiers clés</H>
          <p style={body}>Les ratios permettent de comparer votre performance dans le temps et par rapport à votre secteur.</p>
        </div>
        {[
          { label:'Taux de marge brute', formula:'Marge / CA × 100', good:'> 30%', warn2:'< 20%', desc:'Mesure l\'efficacité de votre processus de production ou d\'achat-revente.', color:'#10b981' },
          { label:'Taux de valeur ajoutée', formula:'VA / CA × 100', good:'> 30%', warn2:'< 15%', desc:'Part de richesse créée par votre activité. Élevé = forte intégration interne.', color:'#3b82f6' },
          { label:'Taux d\'EBE', formula:'EBE / CA × 100', good:'> 10%', warn2:'< 5%', desc:'Capacité à générer de la trésorerie. Indicateur clé pour les banques.', color:'#f59e0b' },
          { label:'Rentabilité nette', formula:'Résultat net / CA × 100', good:'> 5%', warn2:'< 2%', desc:'Part du chiffre d\'affaires qui se transforme en bénéfice.', color:'#8b5cf6' },
          { label:'Levier financier', formula:'Dettes financières / Capitaux propres', good:'< 1×', warn2:'> 2×', desc:'Un levier élevé = dépendance aux banques. Risque accru en cas de baisse d\'activité.', color:'#14b8a6' },
        ].map(r => (
          <div key={r.label} style={card}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:6 }}>
              <H color={r.color}>{r.label}</H>
              <span style={{ fontFamily:'monospace', fontSize:11, color:'#334155' }}>{r.formula}</span>
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
          <H>Le budget — votre cap pour l'année</H>
          <p style={body}>Le budget, c'est votre prévision de ce que vous pensez vendre et dépenser. C'est l'outil de pilotage numéro 1 : sans budget, vous naviguez sans boussole.</p>
        </div>
        <div style={card}>
          <H color="#f59e0b">Comment construire un bon budget</H>
          <p style={body}><G color="#f59e0b">1. Partez de l'historique</G> : utilisez "⚡ Générer depuis FEC N-1" pour partir de vos chiffres réels de l'année passée.</p>
          <p style={body}><G color="#f59e0b">2. Ajustez compte par compte</G> : revoyez chaque poste selon vos anticipations (nouveaux contrats, hausses de loyer, recrutements…).</p>
          <p style={body}><G color="#f59e0b">3. Vérifiez le résultat prévisionnel</G> : en bas du tableau, le résultat budgété doit être positif et cohérent avec vos ambitions.</p>
          <div style={tip}>💡 Un budget mensuel est plus puissant qu'un budget annuel : il permet de détecter les problèmes dès le mois de janvier plutôt qu'en décembre.</div>
        </div>
        <div style={card}>
          <H color="#3b82f6">Comparer réel vs budget</H>
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
        {[
          { term:'CA', def:'Chiffre d\'Affaires — total des ventes de la période.' },
          { term:'Marge brute', def:'CA moins coût des achats. Premier niveau de rentabilité.' },
          { term:'VA', def:'Valeur Ajoutée — marge moins services extérieurs. Richesse créée par l\'entreprise.' },
          { term:'EBE', def:'Excédent Brut d\'Exploitation — VA moins personnel. Capacité à générer de la trésorerie.' },
          { term:'EBITDA', def:'Équivalent anglais de l\'EBE (Earnings Before Interest, Taxes, Depreciation and Amortization).' },
          { term:'RE', def:'Résultat d\'Exploitation — EBE moins amortissements. Performance économique pure.' },
          { term:'EBIT', def:'Équivalent anglais du RE (Earnings Before Interest and Taxes).' },
          { term:'Résultat courant', def:'RE plus résultat financier. Avant éléments exceptionnels.' },
          { term:'Résultat net', def:'Ce qui reste après tout : impôts, éléments exceptionnels inclus.' },
          { term:'Amortissement', def:'Dépréciation d\'un actif dans le temps. Un véhicule de 30 000 € amorti sur 5 ans = 6 000 €/an de charge.' },
          { term:'BFR', def:'Besoin en Fonds de Roulement = Stocks + Créances − Dettes fournisseurs.' },
          { term:'OD', def:'Opérations Diverses — écritures comptables de régularisation (pas de flux réel).' },
          { term:'FEC', def:'Fichier des Écritures Comptables — export standard de votre logiciel comptable.' },
          { term:'IS', def:'Impôt sur les Sociétés — 15% jusqu\'à 42 500 € de bénéfice (PME), 25% au-delà.' },
          { term:'Capitaux propres', def:'Apports des associés + bénéfices cumulés non distribués.' },
          { term:'Levier financier', def:'Ratio Dettes/Capitaux propres. Mesure la dépendance au financement externe.' },
          { term:'Taux de marge', def:'Marge / CA × 100. Part du prix de vente qui n\'est pas du coût d\'achat.' },
        ].map(({ term, def }) => (
          <div key={term} style={{ display:'flex', gap:16, padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', background:'#0f172a', borderRadius:0 }}>
            <span style={{ fontFamily:'monospace', fontWeight:700, color:'#3b82f6', minWidth:150, flexShrink:0 }}>{term}</span>
            <span style={{ fontSize:13, color:'#94a3b8', lineHeight:1.6 }}>{def}</span>
          </div>
        ))}
      </div>}

      {/* ── 7. UTILISATION ── */}
      {sec === 7 && <div>
        <div style={card}>
          <H>🚀 Démarrage rapide</H>
          {QUICK.map(({ step, label, tab, icon }) => (
            <div key={step} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <span style={{ width:20, height:20, borderRadius:'50%', background:'rgba(59,130,246,0.25)', color:'#93c5fd', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{step}</span>
              <span style={{ fontSize:12, color:'#94a3b8', flex:1 }}>{icon} {label}</span>
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
              <span style={{ color:'#3b82f6', flexShrink:0 }}>▸</span>
              <span style={{ color:'#64748b' }}><span style={{ color:'#94a3b8' }}>{tip2}</span> → {action}</span>
            </div>
          ))}
        </div>
        <div style={card}>
          <H color="#10b981">Import FEC</H>
          <p style={body}>• Formats : EBP Grand Livre (.txt/.csv), séparateur tabulation ou point-virgule.</p>
          <p style={body}>• Glissez le fichier dans la zone N ou N-1 — société et période détectées automatiquement.</p>
          <p style={body}>• Si les données semblent vides : vérifiez l'onglet Vérification (nombre d'écritures, équilibre D/C).</p>
        </div>
        <div style={{ marginTop:20, padding:14, borderRadius:10, background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.15)', fontSize:12, color:'#94a3b8' }}>
          <span style={{ color:'#10b981', fontWeight:700 }}>Adam Boards</span> · Développé par <span style={{ color:'#94a3b8' }}>Jean-Marc Dolmaire</span>
        </div>
      </div>}

      {/* ── 8. LES MENUS ── */}
      {sec === 8 && <div>
        <div style={card}>
          <H>🧭 Tous les menus de l'application</H>
          <p style={body}>Le rôle de chaque menu et ses principales fonctions. Cliquez sur « Ouvrir » pour y accéder directement.</p>
        </div>
        {MENUS.map(grp => (
          <div key={grp.group}>
            <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.6px', margin:'18px 0 8px' }}>{grp.group}</div>
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
                  {m.feats.map((f, i) => <li key={i} style={{ fontSize:12.5, color:'#94a3b8', lineHeight:1.7, marginBottom:2 }}>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>}
    </div>
  )
}
