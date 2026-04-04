import { useState } from 'react'
import { useAppStore } from '@/store'

interface Section {
  icon: string
  title: string
  color: string
  items: { q: string; a: string }[]
}

const SECTIONS: Section[] = [
  {
    icon: '📁', title: 'Import FEC', color: '#3b82f6',
    items: [
      { q: 'Quels formats de fichiers sont acceptés ?',
        a: 'Fichiers FEC au format EBP Grand Livre (.txt ou .csv), séparés par tabulation ou point-virgule. Les formats Sage et Axonaut sont également supportés.' },
      { q: 'Comment importer un fichier FEC ?',
        a: 'Onglet Import → glissez le fichier dans la zone N (exercice en cours) ou N-1 (exercice précédent). La société et la période sont détectées automatiquement.' },
      { q: 'Puis-je importer plusieurs sociétés ?',
        a: 'Oui. Importez un fichier par société. Chaque import crée ou met à jour la société correspondante. Utilisez les boutons de sélection dans la sidebar pour switcher entre elles.' },
      { q: 'Le fichier est importé mais les données sont vides ?',
        a: 'Vérifiez que le fichier contient bien des comptes de classe 6 et 7. Le module Vérification vous donne le nombre d\'écritures chargées et le contrôle débit/crédit.' },
    ]
  },
  {
    icon: '📊', title: 'Tableaux financiers', color: '#10b981',
    items: [
      { q: 'Quelle est la différence entre CR et SIG ?',
        a: 'Le Compte de Résultat (CR) présente les charges et produits en deux blocs. Le SIG (Soldes Intermédiaires de Gestion) décompose la formation du résultat étape par étape : Marge → Valeur Ajoutée → EBE → Résultat d\'exploitation → Résultat net.' },
      { q: 'Que signifie "Hors OD" ?',
        a: 'Les Opérations Diverses (OD) sont des écritures d\'ajustement comptable (comptes 713, 603, 6412…). Les activer dans les filtres permet d\'afficher le résultat avant ces régularisations.' },
      { q: 'Comment filtrer sur une période spécifique ?',
        a: 'Utilisez les sélecteurs de date dans la barre du haut. Les mois marqués ·N sont ceux de l\'exercice en cours, ·N-1 ceux de l\'exercice précédent.' },
      { q: 'Comment comparer avec N-1 ?',
        a: 'Activez le toggle "N-1" dans la barre du haut. La colonne N-1 affiche les données de la même période un an avant. La variation € et % est calculée automatiquement.' },
    ]
  },
  {
    icon: '💰', title: 'Budget & Objectifs', color: '#f59e0b',
    items: [
      { q: 'Comment créer un budget ?',
        a: 'Onglet Budget → sélectionnez la société → cliquez "⚡ Générer depuis FEC N-1". Le budget est pré-rempli avec les montants de l\'exercice précédent. Modifiez les cellules et sauvegardez.' },
      { q: 'Comment voir l\'avancement vs objectif ?',
        a: 'Onglet Objectifs → les barres de progression indiquent le % de réalisation de chaque KPI. Vert = objectif atteint, orange = en cours, rouge = en retard.' },
      { q: 'Le budget n\'apparaît pas dans les tableaux ?',
        a: 'Vérifiez que le budget est bien sauvegardé (bouton 💾). Activez ensuite le toggle "Budget" dans les onglets CR/SIG pour afficher les colonnes Budget, Écart € et Écart %.' },
    ]
  },
  {
    icon: '📝', title: 'Saisie manuelle', color: '#8b5cf6',
    items: [
      { q: 'Comment saisir une facture manuellement ?',
        a: 'Onglet Saisie → mode "Saisie manuelle" → renseignez le montant HT, le montant TTC (la TVA est calculée automatiquement), la catégorie et la contrepartie. Les données sont immédiatement visibles dans tous les onglets.' },
      { q: 'Comment utiliser l\'OCR sur une facture ?',
        a: 'Onglet Saisie → mode "Scanner (OCR)" → importez une photo ou un PDF de la facture. Claude AI extrait automatiquement la date, les montants HT/TTC, la catégorie et le nom du fournisseur. Le formulaire est pré-rempli.' },
      { q: 'Puis-je importer plusieurs saisies en CSV ?',
        a: 'Oui. Mode "Import CSV" → colonnes requises : date, category, subcategory, label, amount_ht, amount_ttc, counterpart, payment_mode. Séparateur virgule ou point-virgule.' },
      { q: 'Les saisies apparaissent-elles dans la trésorerie ?',
        a: 'Oui. Après validation, le store est rechargé et les données apparaissent immédiatement dans la Trésorerie (ligne "Saisies manuelles" en violet) et dans les ratios.' },
    ]
  },
  {
    icon: '💧', title: 'Trésorerie', color: '#14b8a6',
    items: [
      { q: 'Comment lire le tableau de trésorerie ?',
        a: 'Le tableau présente les encaissements (comptes 706-708) et décaissements (comptes 6xx) mois par mois. Cliquez sur une catégorie pour voir le détail par compte comptable. Le cumul montre la position de trésorerie accumulée.' },
      { q: 'Les montants ne correspondent pas à mon relevé bancaire ?',
        a: 'Normal : la trésorerie est calculée depuis le Grand Livre FEC (accrual basis), pas depuis les mouvements bancaires. Les délais de paiement créent des écarts. Pour une trésorerie temps réel, utilisez l\'onglet Saisie pour enregistrer les encaissements/décaissements effectifs.' },
    ]
  },
  {
    icon: '🔍', title: 'Vérification & données', color: '#6366f1',
    items: [
      { q: 'Que vérifie l\'onglet Vérification ?',
        a: 'Il contrôle l\'équilibre débit/crédit pour chaque société et chaque exercice. Un écart > 1 € signale une anomalie dans le fichier FEC (doublons, lignes corrompues). Il affiche aussi le nombre de comptes et d\'écritures chargés.' },
      { q: 'Mes données semblent incomplètes, que faire ?',
        a: 'Vérifiez dans l\'onglet Vérification le nombre d\'écritures chargées. Si c\'est 0, le fichier n\'a pas été reconnu. Assurez-vous que l\'en-tête du fichier contient bien "CompteNum", "Debit", "Credit", "EcritureDate".' },
    ]
  },
]

export function Aide() {
  const RAW  = useAppStore(s => s.RAW)
  const setTab = useAppStore(s => s.setTab)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [openQ, setOpenQ] = useState<string | null>(null)

  const toggleSection = (title: string) =>
    setOpenSection(p => p === title ? null : title)
  const toggleQ = (key: string) =>
    setOpenQ(p => p === key ? null : key)

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
              · {RAW.keys.length} société{RAW.keys.length > 1 ? 's' : ''} chargée{RAW.keys.length > 1 ? 's' : ''}
              · {RAW.mn.length} mois N · {RAW.m1.length} mois N-1
            </span>
          )}
        </div>
      </div>

      {/* Démarrage rapide */}
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', marginBottom: 10 }}>🚀 Démarrage rapide</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { step: '1', label: 'Importer les fichiers FEC', tab: 'import', icon: '📁' },
            { step: '2', label: 'Consulter le Compte de Résultat', tab: 'cr', icon: '📋' },
            { step: '3', label: 'Analyser les SIG', tab: 'sig', icon: '📊' },
            { step: '4', label: 'Générer le budget depuis N-1', tab: 'budget', icon: '💰' },
            { step: '5', label: 'Suivre les objectifs', tab: 'objectifs', icon: '🎯' },
          ].map(({ step, label, tab, icon }) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,130,246,0.3)', color: '#93c5fd', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{icon} {label}</span>
              <button
                onClick={() => setTab(tab as any)}
                style={{ marginLeft: 'auto', padding: '2px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                Ouvrir →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Raccourcis clavier */}
      <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Astuces</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 6, fontSize: 11 }}>
          {[
            { tip: 'Cliquez sur une ligne du tableau P&L', action: 'Déplier les comptes détail' },
            { tip: 'Cliquez sur une catégorie Trésorerie', action: 'Voir le détail par compte' },
            { tip: 'Toggle "Mois" dans CR/SIG', action: 'Afficher/masquer les colonnes mensuelles' },
            { tip: 'Toggle "N-1" dans CR/SIG', action: 'Comparer avec l\'exercice précédent' },
            { tip: 'Boutons société dans la sidebar', action: 'Sélectionner une ou plusieurs sociétés' },
            { tip: 'Sélecteurs de période en haut', action: 'Filtrer sur une plage de mois' },
          ].map(({ tip, action }) => (
            <div key={tip} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#3b82f6', flexShrink: 0 }}>▸</span>
              <div>
                <span style={{ color: '#94a3b8' }}>{tip}</span>
                <span style={{ color: '#334155' }}> → {action}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ par section */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
        Foire aux questions
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SECTIONS.map(section => (
          <div key={section.title} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>

            {/* Header section */}
            <button
              onClick={() => toggleSection(section.title)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                background: openSection === section.title ? `${section.color}12` : '#0f172a',
                border: 'none', cursor: 'pointer', borderBottom: openSection === section.title ? `1px solid ${section.color}20` : 'none' }}>
              <span style={{ fontSize: 16 }}>{section.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: section.color, flex: 1, textAlign: 'left' }}>{section.title}</span>
              <span style={{ fontSize: 10, color: '#334155' }}>{section.items.length} questions</span>
              <span style={{ fontSize: 12, color: '#475569' }}>{openSection === section.title ? '▾' : '▸'}</span>
            </button>

            {/* Questions */}
            {openSection === section.title && (
              <div style={{ background: '#080d1a' }}>
                {section.items.map((item, i) => {
                  const key = `${section.title}-${i}`
                  const isOpen = openQ === key
                  return (
                    <div key={key} style={{ borderBottom: i < section.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <button
                        onClick={() => toggleQ(key)}
                        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 20px',
                          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 11, color: '#334155', marginTop: 1, flexShrink: 0 }}>{isOpen ? '▾' : '▸'}</span>
                        <span style={{ fontSize: 12, color: isOpen ? '#f1f5f9' : '#94a3b8', fontWeight: isOpen ? 600 : 400 }}>{item.q}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 20px 12px 38px', fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                          {item.a}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Contact */}
      <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', fontSize: 12, color: '#475569' }}>
        <span style={{ color: '#10b981', fontWeight: 700 }}>Adam Boards</span> est développé par{' '}
        <span style={{ color: '#94a3b8' }}>Jean-Marc Dolmaire</span>.
        Pour toute question technique ou fonctionnelle, contactez votre administrateur.
      </div>
    </div>
  )
}
