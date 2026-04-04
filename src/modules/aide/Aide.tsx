import { useState } from 'react'
import { useAppStore } from '@/store'
import type { TabId } from '@/types'

const SECTIONS = [
  {
    icon: '📁', title: 'Import FEC', color: '#3b82f6',
    items: [
      { q: 'Quels formats sont acceptés ?',
        a: 'Fichiers FEC EBP Grand Livre (.txt ou .csv), séparés par tabulation ou point-virgule. Formats Sage et Axonaut supportés.' },
      { q: 'Comment importer ?',
        a: 'Onglet Import → glissez le fichier dans la zone N ou N-1. La société et la période sont détectées automatiquement depuis le nom du fichier et les dates.' },
      { q: 'Plusieurs sociétés possibles ?',
        a: 'Oui. Importez un fichier par société. Les boutons dans la sidebar permettent de sélectionner une ou plusieurs sociétés à la fois.' },
      { q: 'Les données semblent vides après import ?',
        a: 'Vérifiez dans l\'onglet Vérification le nombre d\'écritures. Si 0, assurez-vous que le fichier contient des comptes 6/7 et un en-tête reconnu (CompteNum, Debit, Credit, EcritureDate).' },
    ]
  },
  {
    icon: '📊', title: 'Tableaux P&L', color: '#10b981',
    items: [
      { q: 'Différence entre CR et SIG ?',
        a: 'Le CR (Compte de Résultat) présente charges et produits en deux blocs. Le SIG décompose la formation du résultat : Marge → Valeur Ajoutée → EBE → Résultat d\'exploitation → Résultat net.' },
      { q: 'Que signifie "Hors OD" ?',
        a: 'Les OD (Opérations Diverses) sont des régularisations comptables (comptes 713, 603, 6412). Les exclure permet d\'analyser l\'activité réelle sans ces ajustements.' },
      { q: 'Comment filtrer sur une période ?',
        a: 'Utilisez les sélecteurs de date en haut. Les mois ·N sont l\'exercice en cours, ·N-1 l\'exercice précédent.' },
      { q: 'Clic sur une ligne du tableau ?',
        a: 'Cliquer sur une ligne avec ▸ déplie le détail des comptes comptables sous-jacents avec leur volume et leurs écritures.' },
    ]
  },
  {
    icon: '💰', title: 'Budget & Objectifs', color: '#f59e0b',
    items: [
      { q: 'Comment créer un budget ?',
        a: 'Onglet Budget → sélectionnez la société → "⚡ Générer depuis FEC N-1". Le budget est pré-rempli avec les montants N-1. Modifiez les cellules mois par mois et sauvegardez.' },
      { q: 'Budget visible dans les tableaux ?',
        a: 'Oui, après sauvegarde les colonnes Budget, Écart € et Écart % apparaissent dans CR et SIG. Activez le toggle "Budget" si nécessaire.' },
      { q: 'Barres de progression dans Objectifs ?',
        a: 'Vert = objectif atteint (≥100%), orange = en cours (≥75%), rouge = en retard (<75%). Les KPIs CA, Marge, VA, EBE, RE et Résultat net sont affichés.' },
    ]
  },
  {
    icon: '📝', title: 'Saisie', color: '#8b5cf6',
    items: [
      { q: 'Saisie manuelle ?',
        a: 'Mode "Saisie manuelle" → saisissez le montant HT, le montant TTC (la TVA est calculée automatiquement en %), la catégorie et la contrepartie. Mise à jour immédiate de tous les onglets.' },
      { q: 'Scanner une facture ?',
        a: 'Mode "Scanner (OCR)" → importez une photo ou PDF. Claude AI extrait la date, les montants HT/TTC, la catégorie et le fournisseur. Le formulaire est pré-rempli automatiquement.' },
      { q: 'Import en masse CSV ?',
        a: 'Mode "Import CSV" → colonnes : date, category, subcategory, label, amount_ht, amount_ttc, counterpart, payment_mode. Séparateur virgule ou point-virgule.' },
    ]
  },
  {
    icon: '💧', title: 'Trésorerie', color: '#14b8a6',
    items: [
      { q: 'Comment lire le tableau ?',
        a: 'Encaissements (comptes 706-708) et décaissements (comptes 6xx) mois par mois. Cliquez sur une catégorie ▸ pour voir le détail par compte comptable. Le cumul montre la position accumulée.' },
      { q: 'Écart avec le relevé bancaire ?',
        a: 'Normal : la trésorerie est calculée en comptabilité d\'engagement (FEC), pas en trésorerie réelle. Utilisez la Saisie pour enregistrer les flux effectifs et les retrouver dans la ligne "Saisies manuelles".' },
    ]
  },
  {
    icon: '🔍', title: 'Vérification', color: '#6366f1',
    items: [
      { q: 'Que vérifie cet onglet ?',
        a: 'L\'équilibre débit/crédit pour chaque société et exercice. Un écart > 1 € signale une anomalie dans le FEC. Affiche aussi le nombre de comptes et d\'écritures chargés.' },
      { q: 'Données incomplètes ?',
        a: 'Si le nombre d\'écritures est 0, le fichier n\'a pas été reconnu. Vérifiez que l\'en-tête contient CompteNum, Debit, Credit, EcritureDate.' },
    ]
  },
]

const QUICK_START: { step: string; label: string; tab: TabId; icon: string }[] = [
  { step: '1', label: 'Importer les fichiers FEC',       tab: 'import',    icon: '📁' },
  { step: '2', label: 'Analyser le Compte de Résultat',  tab: 'cr',        icon: '📋' },
  { step: '3', label: 'Consulter les SIG',                tab: 'sig',       icon: '📊' },
  { step: '4', label: 'Générer le budget depuis N-1',     tab: 'budget',    icon: '💰' },
  { step: '5', label: 'Suivre les objectifs',             tab: 'objectifs', icon: '🎯' },
]

const TIPS = [
  { tip: 'Cliquer sur une ligne ▸ du tableau P&L',   action: 'affiche le détail des comptes' },
  { tip: 'Cliquer sur une catégorie de Trésorerie',  action: 'déplie le détail par compte' },
  { tip: 'Toggle "Mois" dans CR/SIG',                action: 'affiche/masque les colonnes mensuelles' },
  { tip: 'Toggle "N-1" dans CR/SIG',                 action: 'compare avec l\'exercice précédent' },
  { tip: 'Boutons société dans la sidebar',          action: 'sélectionne une ou plusieurs sociétés' },
  { tip: 'Sélecteurs de date en haut',               action: 'filtre sur une plage de mois' },
]

export function Aide() {
  const RAW    = useAppStore(s => s.RAW)
  const setTab = useAppStore(s => s.setTab)

  const [openSection, setOpenSection] = useState<string | null>(null)
  const [openQ,       setOpenQ]       = useState<string | null>(null)

  return (
    <div style={{ padding: '20px 24px', maxWidth: 860 }}>

      {/* En-tête */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>
          Aide & Documentation
        </div>
        <div style={{ fontSize: 12, color: '#475569' }}>
          Adam Boards — Tableau de bord financier pour TPE/PME
          {RAW && (
            <span style={{ marginLeft: 12, color: '#334155' }}>
              · {RAW.keys.length} société{RAW.keys.length > 1 ? 's' : ''} · {RAW.mn.length} mois N · {RAW.m1.length} mois N-1
            </span>
          )}
        </div>
      </div>

      {/* Démarrage rapide */}
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}>🚀 Démarrage rapide</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {QUICK_START.map(({ step, label, tab, icon }) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,130,246,0.25)', color: '#93c5fd', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {step}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{icon} {label}</span>
              <button
                onClick={() => setTab(tab)}
                style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                Ouvrir →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Astuces */}
      <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>💡 Astuces</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 6 }}>
          {TIPS.map(({ tip, action }) => (
            <div key={tip} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
              <span style={{ color: '#3b82f6', flexShrink: 0 }}>▸</span>
              <span style={{ color: '#64748b' }}><span style={{ color: '#94a3b8' }}>{tip}</span> → {action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
        Questions fréquentes
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SECTIONS.map(section => {
          const isOpen = openSection === section.title
          return (
            <div key={section.title} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>

              {/* Header */}
              <button
                onClick={() => setOpenSection(isOpen ? null : section.title)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px', background: isOpen ? `${section.color}10` : '#0f172a',
                  border: 'none', cursor: 'pointer',
                  borderBottom: isOpen ? `1px solid ${section.color}20` : 'none',
                }}
              >
                <span style={{ fontSize: 16 }}>{section.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: section.color, flex: 1, textAlign: 'left' }}>
                  {section.title}
                </span>
                <span style={{ fontSize: 10, color: '#334155', marginRight: 8 }}>{section.items.length} questions</span>
                <span style={{ fontSize: 11, color: '#475569' }}>{isOpen ? '▾' : '▸'}</span>
              </button>

              {/* Questions */}
              {isOpen && (
                <div style={{ background: '#080d1a' }}>
                  {section.items.map((item, i) => {
                    const key = `${section.title}__${i}`
                    const qOpen = openQ === key
                    return (
                      <div key={key} style={{ borderBottom: i < section.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <button
                          onClick={() => setOpenQ(qOpen ? null : key)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'flex-start', gap: 8,
                            padding: '10px 16px 10px 20px', background: 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#334155', marginTop: 2, flexShrink: 0 }}>
                            {qOpen ? '▾' : '▸'}
                          </span>
                          <span style={{ fontSize: 12, color: qOpen ? '#f1f5f9' : '#94a3b8', fontWeight: qOpen ? 600 : 400 }}>
                            {item.q}
                          </span>
                        </button>
                        {qOpen && (
                          <div style={{ padding: '2px 16px 12px 36px', fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                            {item.a}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, padding: 14, borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', fontSize: 12, color: '#475569' }}>
        <span style={{ color: '#10b981', fontWeight: 700 }}>Adam Boards</span> est développé par{' '}
        <span style={{ color: '#94a3b8' }}>Jean-Marc Dolmaire</span>.
        Pour toute question, contactez votre administrateur.
      </div>
    </div>
  )
}
