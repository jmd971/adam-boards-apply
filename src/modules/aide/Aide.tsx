import { useAppStore } from '@/store'
import type { TabId } from '@/types'

export function Aide() {
  const setTab = useAppStore(s => s.setTab)
  const RAW    = useAppStore(s => s.RAW)

  const go = (tab: TabId) => () => setTab(tab)

  const card = (color: string, bg: string) => ({
    background: bg, borderRadius: 10, padding: '12px 16px',
    border: `1px solid ${color}30`, marginBottom: 8,
  } as React.CSSProperties)

  const h2 = (color: string) => ({
    fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase' as const,
    letterSpacing: '0.7px', marginBottom: 10,
  })

  const li = { fontSize: 12, color: '#94a3b8', marginBottom: 6, lineHeight: 1.7 } as React.CSSProperties
  const accent = { color: '#f1f5f9', fontWeight: 600 } as React.CSSProperties

  return (
    <div style={{ padding: '20px 24px', maxWidth: 820, color: '#f1f5f9' }}>

      {/* Titre */}
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Aide & Documentation</div>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 24 }}>
        Adam Boards — Tableau de bord financier pour TPE/PME
        {RAW ? ` · ${RAW.keys.length} société(s) · ${RAW.mn.length} mois N` : ' · Aucune donnée chargée'}
      </div>

      {/* Démarrage rapide */}
      <div style={card('#3b82f6', 'rgba(59,130,246,0.06)')}>
        <div style={h2('#60a5fa')}>🚀 Démarrage rapide</div>
        {([
          ['1', 'Importer un fichier FEC (N et N-1)',  'import'],
          ['2', 'Consulter le Compte de Résultat',      'cr'],
          ['3', 'Analyser les Soldes Intermédiaires',   'sig'],
          ['4', 'Générer le budget depuis N-1',         'budget'],
          ['5', 'Suivre les objectifs vs budget',       'objectifs'],
        ] as [string, string, TabId][]).map(([n, label, tab]) => (
          <div key={n} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <span style={{ width:20, height:20, borderRadius:'50%', background:'rgba(59,130,246,0.25)', color:'#93c5fd', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{n}</span>
            <span style={{ fontSize:12, color:'#94a3b8', flex:1 }}>{label}</span>
            <button onClick={go(tab)} style={{ padding:'3px 10px', borderRadius:6, background:'rgba(59,130,246,0.2)', border:'1px solid rgba(59,130,246,0.3)', color:'#60a5fa', fontSize:11, cursor:'pointer', fontWeight:600 }}>
              Ouvrir →
            </button>
          </div>
        ))}
      </div>

      {/* Import FEC */}
      <div style={card('#3b82f6', '#0f172a')}>
        <div style={h2('#3b82f6')}>📁 Import FEC</div>
        <p style={li}>• Formats acceptés : <span style={accent}>EBP Grand Livre</span> (.txt/.csv) séparé par tabulation ou point-virgule.</p>
        <p style={li}>• Glissez le fichier dans la zone <span style={accent}>N</span> (exercice en cours) ou <span style={accent}>N-1</span> (exercice précédent). La société et la période sont détectées automatiquement.</p>
        <p style={li}>• Plusieurs sociétés possibles : importez un fichier par société, sélectionnez-les dans la sidebar.</p>
        <p style={li}>• Si les données semblent vides, vérifiez dans <button onClick={go('verification')} style={{ background:'none', border:'none', color:'#6366f1', cursor:'pointer', fontWeight:700, padding:0 }}>Vérification</button> le nombre d'écritures et l'équilibre débit/crédit.</p>
      </div>

      {/* Tableaux P&L */}
      <div style={card('#10b981', '#0f172a')}>
        <div style={h2('#10b981')}>📊 Tableaux financiers</div>
        <p style={li}>• <span style={accent}>CR</span> : charges et produits en deux blocs. <span style={accent}>SIG</span> : formation du résultat étape par étape (Marge → VA → EBE → RE → RN).</p>
        <p style={li}>• Cliquez sur une ligne <span style={accent}>▸</span> pour afficher le détail des comptes comptables sous-jacents.</p>
        <p style={li}>• Toggle <span style={accent}>Mois</span> : affiche/masque les colonnes mensuelles. Toggle <span style={accent}>N-1</span> : compare avec l'exercice précédent.</p>
        <p style={li}>• Toggle <span style={accent}>Hors OD</span> : exclut les opérations diverses (régularisations comptables, comptes 713, 603, 6412).</p>
        <p style={li}>• Filtrez sur une période via les sélecteurs de date en haut (mois ·N = exercice en cours, ·N-1 = exercice précédent).</p>
      </div>

      {/* Budget */}
      <div style={card('#f59e0b', '#0f172a')}>
        <div style={h2('#f59e0b')}>💰 Budget & Objectifs</div>
        <p style={li}>• <button onClick={go('budget')} style={{ background:'none', border:'none', color:'#f59e0b', cursor:'pointer', fontWeight:700, padding:0 }}>Budget</button> → sélectionnez la société → <span style={accent}>⚡ Générer depuis FEC N-1</span> pour pré-remplir. Modifiez cellule par cellule et sauvegardez.</p>
        <p style={li}>• Les colonnes Budget, Écart € et Écart % apparaissent dans CR et SIG une fois le budget sauvegardé.</p>
        <p style={li}>• <button onClick={go('objectifs')} style={{ background:'none', border:'none', color:'#f59e0b', cursor:'pointer', fontWeight:700, padding:0 }}>Objectifs</button> → barres de progression : vert ≥100%, orange ≥75%, rouge &lt;75%.</p>
      </div>

      {/* Saisie */}
      <div style={card('#8b5cf6', '#0f172a')}>
        <div style={h2('#8b5cf6')}>📝 Saisie</div>
        <p style={li}>• <span style={accent}>Saisie manuelle</span> : renseignez HT + TTC, la TVA est calculée automatiquement. Mise à jour immédiate de tous les onglets.</p>
        <p style={li}>• <span style={accent}>Scanner OCR</span> : importez photo ou PDF de facture. Claude AI extrait date, montants HT/TTC, catégorie et fournisseur automatiquement.</p>
        <p style={li}>• <span style={accent}>Import CSV</span> : colonnes requises : date, category, subcategory, label, amount_ht, amount_ttc, counterpart, payment_mode.</p>
      </div>

      {/* Trésorerie */}
      <div style={card('#14b8a6', '#0f172a')}>
        <div style={h2('#14b8a6')}>💧 Trésorerie</div>
        <p style={li}>• Cliquez sur une catégorie <span style={accent}>▸</span> pour afficher le détail par compte comptable (ex : "Salaires" → 641, 642, 645, 646).</p>
        <p style={li}>• Les saisies manuelles apparaissent en violet dans les lignes "Saisies manuelles".</p>
        <p style={li}>• La trésorerie est calculée en comptabilité d'engagement (FEC). Un écart avec votre relevé bancaire est normal (délais de paiement).</p>
      </div>

      {/* Vérification */}
      <div style={card('#6366f1', '#0f172a')}>
        <div style={h2('#6366f1')}>🔍 Vérification</div>
        <p style={li}>• Contrôle l'équilibre débit/crédit pour chaque société et exercice. Un écart &gt;1€ signale une anomalie dans le FEC.</p>
        <p style={li}>• Affiche le nombre de comptes et d'écritures chargés, ainsi que les mois disponibles N et N-1.</p>
        <p style={li}>• Si "0 écritures" : vérifiez que l'en-tête du fichier contient <span style={accent}>CompteNum, Debit, Credit, EcritureDate</span>.</p>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', fontSize: 12, color: '#475569' }}>
        <span style={{ color: '#10b981', fontWeight: 700 }}>Adam Boards</span> · Développé par <span style={{ color: '#94a3b8' }}>Jean-Marc Dolmaire</span> · Pour toute question contactez votre administrateur.
      </div>
    </div>
  )
}
