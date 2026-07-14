// Logo officiel ADAM BOARDS — vectorisé en SVG inline (net à toute taille, thème sombre).
// Concept de marque : des « pommes-camemberts » (croquer dans la pomme de la rentabilité)
// déclinées dans les 4 couleurs ADAM BOARDS : jaune, bleu, vert, rouge. Wordmark bleu.
// Aucun fichier binaire requis → compatible workflow GitHub-only.

const C = {
  blue:   '#28A9E1',
  yellow: '#F4D02C',
  green:  '#5CB948',
  red:    '#EA4335',
  dark:   '#141414',
}

const FONT = 'Outfit, Inter, sans-serif'

// ── Marque compacte : camembert 4 couleurs en croix (X) ─────────────────────
// Lisible à très petite taille → utilisée en sidebar, en-tête Dashboard, favicon.
export function AdamBoardsMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-32 -32 64 64" role="img" aria-label="ADAM BOARDS">
      {/* haut = vert · droite = jaune · bas = rouge · gauche = bleu */}
      <path d="M0 0 L-21.21 -21.21 A30 30 0 0 1 21.21 -21.21 Z" fill={C.green} />
      <path d="M0 0 L21.21 -21.21 A30 30 0 0 1 21.21 21.21 Z"   fill={C.yellow} />
      <path d="M0 0 L21.21 21.21 A30 30 0 0 1 -21.21 21.21 Z"   fill={C.red} />
      <path d="M0 0 L-21.21 21.21 A30 30 0 0 1 -21.21 -21.21 Z" fill={C.blue} />
    </svg>
  )
}

// ── Lockup complet : wordmark + rangée de 4 pommes-camemberts + baseline ─────
// Reproduit la planche de marque (panneau noir). Utilisé sur l'écran de connexion.
export function AdamBoardsLogo({ width = 300, className }: { width?: number; className?: string }) {
  const height = Math.round((width * 210) / 360)
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 360 210"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ADAM BOARDS — Croquer dans la pomme de la rentabilité"
    >
      <text x="180" y="54" textAnchor="middle" fill={C.blue}
        style={{ fontFamily: FONT, fontWeight: 800, fontSize: '44px', letterSpacing: '3px' }}>
        ADAM BOARDS
      </text>

      <g transform="translate(36,120)">
        {/* 1 — pomme jaune croquée (bite en haut à droite + trognon + pépins) */}
        <g transform="translate(30,0)">
          <mask id="ab-bite">
            <rect x="-34" y="-34" width="68" height="68" fill="#fff" />
            <circle cx="23" cy="-20" r="13" fill="#000" />
          </mask>
          <circle r="30" fill={C.yellow} mask="url(#ab-bite)" />
          <path d="M-2 -29 q3 -7 10 -8" stroke={C.dark} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <g fill={C.dark}>
            <ellipse cx="-9" cy="9"  rx="2.4" ry="3.6" transform="rotate(22 -9 9)" />
            <ellipse cx="-2" cy="13" rx="2.4" ry="3.6" />
            <ellipse cx="5"  cy="9"  rx="2.4" ry="3.6" transform="rotate(-22 5 9)" />
          </g>
        </g>

        {/* 2 — bleu (haut) / vert (bas) */}
        <g transform="translate(106,0)">
          <path d="M-30 0 A30 30 0 0 0 30 0 Z" fill={C.blue} />
          <path d="M-30 0 A30 30 0 0 1 30 0 Z" fill={C.green} />
        </g>

        {/* 3 — camembert 3 parts : vert (HG) · rouge (HD) · jaune (bas) */}
        <g transform="translate(182,0)">
          <path d="M0 0 L0 -30 A30 30 0 0 1 25.98 15 Z"     fill={C.red} />
          <path d="M0 0 L25.98 15 A30 30 0 0 1 -25.98 15 Z" fill={C.yellow} />
          <path d="M0 0 L-25.98 15 A30 30 0 0 1 0 -30 Z"    fill={C.green} />
        </g>

        {/* 4 — camembert 4 couleurs en croix */}
        <g transform="translate(258,0)">
          <path d="M0 0 L-21.21 -21.21 A30 30 0 0 1 21.21 -21.21 Z" fill={C.green} />
          <path d="M0 0 L21.21 -21.21 A30 30 0 0 1 21.21 21.21 Z"   fill={C.yellow} />
          <path d="M0 0 L21.21 21.21 A30 30 0 0 1 -21.21 21.21 Z"   fill={C.red} />
          <path d="M0 0 L-21.21 21.21 A30 30 0 0 1 -21.21 -21.21 Z" fill={C.blue} />
        </g>
      </g>

      <text x="180" y="198" textAnchor="middle" fill={C.blue}
        style={{ fontFamily: FONT, fontWeight: 500, fontSize: '15px' }}>
        Croquer dans la pomme de la rentabilité
      </text>
    </svg>
  )
}

// ── Lockup horizontal compact : marque + wordmark ───────────────────────────
// Utilisé en sidebar et en-tête du Dashboard.
export function AdamBoardsInline({ markSize = 32, fontSize = 18 }: { markSize?: number; fontSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <AdamBoardsMark size={markSize} />
      <span style={{ fontFamily: FONT, fontWeight: 800, fontSize, letterSpacing: '1.5px', color: C.blue, whiteSpace: 'nowrap' }}>
        ADAM BOARDS
      </span>
    </div>
  )
}
