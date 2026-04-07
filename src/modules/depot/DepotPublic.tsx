import { useState, useEffect, useCallback } from 'react'
import { sb } from '@/lib/supabase'
import type { DepositLink } from '@/types'

interface Props { token: string }

type Stage = 'loading' | 'ready' | 'uploading' | 'done' | 'error'

export function DepotPublic({ token }: Props) {
  const [link, setLink] = useState<DepositLink | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    sb.from('deposit_links')
      .select('*')
      .eq('token', token)
      .eq('active', true)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('Ce lien de dépôt est invalide ou a expiré.')
          setStage('error')
        } else {
          setLink(data as DepositLink)
          setStage('ready')
        }
      })
  }, [token])

  const handleUpload = useCallback(async (file: File) => {
    if (!link) return
    if (!file.name.match(/\.(txt|csv)$/i)) {
      setError('Format non supporté. Veuillez déposer un fichier .txt ou .csv.')
      setStage('error')
      return
    }

    setStage('uploading')
    setFileName(file.name)

    const path = `${link.tenant_id}/${link.company_key}/${Date.now()}_${file.name}`

    const { error: uploadErr } = await sb.storage
      .from('fec-deposits')
      .upload(path, file)

    if (uploadErr) {
      setError(`Erreur d'upload : ${uploadErr.message}`)
      setStage('error')
      return
    }

    const { error: insertErr } = await sb.from('deposits').insert({
      tenant_id: link.tenant_id,
      link_id: link.id,
      company_key: link.company_key,
      period: link.period,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
    })

    if (insertErr) {
      setError(`Erreur d'enregistrement : ${insertErr.message}`)
      setStage('error')
      return
    }

    setStage('done')
  }, [link])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  return (
    <div style={{
      minHeight: '100vh', background: '#080d1a', color: '#f1f5f9',
      fontFamily: 'Outfit, Inter, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '0 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg,#3b82f6,#6366f1)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, marginBottom: 12,
          }}>📊</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            <span style={{ color: '#3b82f6' }}>adam</span>boards
          </div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
            Portail de dépôt de fichiers comptables
          </div>
        </div>

        {/* Loading */}
        {stage === 'loading' && (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 13 }}>
            Vérification du lien...
          </div>
        )}

        {/* Error */}
        {stage === 'error' && (
          <div style={{
            padding: '16px 20px', borderRadius: 12, textAlign: 'center',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>❌</div>
            <div style={{ fontSize: 13, color: '#fca5a5' }}>{error}</div>
            {link && (
              <button onClick={() => { setStage('ready'); setError('') }}
                style={{
                  marginTop: 12, padding: '8px 20px', borderRadius: 8,
                  background: 'rgba(59,130,246,0.15)', color: '#93c5fd',
                  border: '1px solid rgba(59,130,246,0.3)', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                }}>
                Réessayer
              </button>
            )}
          </div>
        )}

        {/* Ready — drop zone */}
        {stage === 'ready' && link && (
          <div>
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
            }}>
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Dossier</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
                {link.label || link.company_key}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                Période : {link.period}
              </div>
            </div>

            <label
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                display: 'block', padding: '48px 24px', borderRadius: 14,
                textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
                border: `2px dashed ${dragOver ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                background: dragOver ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📤</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
                Glissez votre fichier FEC ici
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                ou cliquez pour sélectionner (.txt, .csv)
              </div>
              <input type="file" accept=".txt,.csv" style={{ display: 'none' }} onChange={onFileSelect} />
            </label>
          </div>
        )}

        {/* Uploading */}
        {stage === 'uploading' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 40, height: 40, border: '3px solid rgba(59,130,246,0.2)',
              borderTopColor: '#3b82f6', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>
              Envoi en cours...
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{fileName}</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Done */}
        {stage === 'done' && (
          <div style={{
            padding: '24px 20px', borderRadius: 12, textAlign: 'center',
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#6ee7b7', marginBottom: 4 }}>
              Fichier déposé avec succès
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              {fileName} — Votre comptable sera notifié.
            </div>
            <button onClick={() => { setStage('ready'); setFileName('') }}
              style={{
                marginTop: 16, padding: '8px 20px', borderRadius: 8,
                background: 'rgba(59,130,246,0.15)', color: '#93c5fd',
                border: '1px solid rgba(59,130,246,0.3)', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
              }}>
              Déposer un autre fichier
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 40, fontSize: 10, color: '#334155' }}>
          Portail sécurisé — adamboards.fr
        </div>
      </div>
    </div>
  )
}
