import React, { useState } from 'react'

type Source = 'factures' | 'pos'

interface Props {
  onSelect: (source: Source) => void
}

export function ChoixSource({ onSelect }: Props) {
  const [hov, setHov] = useState<Source | null>(null)

  const cardSt = (s: Source): React.CSSProperties => ({
    flex: 1,
    background: hov === s ? 'rgba(59,130,246,0.1)' : 'var(--bg-1)',
    border: `1px solid ${hov === s ? 'rgba(59,130,246,0.4)' : 'var(--border-1)'}`,
    borderRadius: 'var(--radius-lg)',
    padding: '32px 28px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', minHeight:400, padding:'40px 24px', gap:32 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:32 }}>🛒</div>
        <div style={{ fontSize:16, fontWeight:700, color:'var(--text-0)', marginTop:8 }}>
          Analyse des ventes &amp; clients
        </div>
        <div style={{ fontSize:12, color:'var(--text-2)', marginTop:6 }}>
          Comment souhaitez-vous analyser vos ventes ?
        </div>
      </div>

      <div style={{ display:'flex', gap:20, width:'100%', maxWidth:640 }}>
        <div
          style={cardSt('factures')}
          onMouseEnter={() => setHov('factures')}
          onMouseLeave={() => setHov(null)}
          onClick={() => onSelect('factures')}
        >
          <div style={{ fontSize:36, marginBottom:16 }}>📄</div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-0)', marginBottom:8 }}>
            Mes factures
          </div>
          <div style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.6, marginBottom:16 }}>
            Depuis votre FEC importé et/ou les factures saisies dans le module Saisie
          </div>
          <div style={{ fontSize:10, color:'var(--text-3)', background:'rgba(255,255,255,0.05)', padding:'6px 12px', borderRadius:20 }}>
            Artisans · B2B · Professions libérales
          </div>
        </div>

        <div
          style={cardSt('pos')}
          onMouseEnter={() => setHov('pos')}
          onMouseLeave={() => setHov(null)}
          onClick={() => onSelect('pos')}
        >
          <div style={{ fontSize:36, marginBottom:16 }}>🛒</div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-0)', marginBottom:8 }}>
            Fichier caisse / POS
          </div>
          <div style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.6, marginBottom:16 }}>
            Importez un export de votre logiciel de caisse (SumUp, Square, Lightspeed…)
          </div>
          <div style={{ fontSize:10, color:'var(--text-3)', background:'rgba(255,255,255,0.05)', padding:'6px 12px', borderRadius:20 }}>
            Salon · Boutique · Restaurant · Commerce
          </div>
        </div>
      </div>
    </div>
  )
}
