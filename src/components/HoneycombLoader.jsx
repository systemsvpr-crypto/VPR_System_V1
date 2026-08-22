import React from 'react';

/*
  HoneycombLoader — system-matched design
  ─────────────────────────────────────────
  Design tokens lifted directly from index.css + tailwind.config.js:
    • Glass:   rgba(255,255,255,0.72) + blur(24px) saturate(160%)
    • Border:  rgba(37,99,235,0.12)
    • Shadow:  0 8px 32px rgba(37,99,235,.10)  →  glow-blue 0 0 32px rgba(96,165,250,.35)
    • Primary: #2563EB  (royal-600)
    • Sky:     #60A5FA  (royal-400)
    • Deep:    #1D4ED8  (royal-700)
    • Float:   translateY -6px / 6s  (aidash-float)
    • Radius:  24px
    • Specular: white gradient line top-edge  (aidash-specular)
*/

const HEX_GRID = [
  { id: 0, col: 0, row: 0 },
  { id: 1, col: 1, row: 0 },
  { id: 2, col: 2, row: 0 },
  { id: 3, col: 0, row: 1 },
  { id: 4, col: 1, row: 1 }, // centre
  { id: 5, col: 2, row: 1 },
  { id: 6, col: 3, row: 1 },
  { id: 7, col: 0, row: 2 },
  { id: 8, col: 1, row: 2 },
  { id: 9, col: 2, row: 2 },
];

/* Ripple stagger: distance from centre (id=4) */
const STAGGER = [0.42, 0.28, 0.42, 0.28, 0, 0.28, 0.42, 0.28, 0.42, 0.56];

/* Per-hex opacity variation so the mesh has depth */
const BASE_OPACITY = [0.82, 0.88, 0.82, 0.88, 1, 0.88, 0.82, 0.88, 0.82, 0.75];

const CSS = `
  /* --- Hex ripple pulse --- */
  @keyframes hcl-pulse {
    0%, 100% {
      opacity: .1;
      transform: scale(.72);
      filter: brightness(.5) saturate(.7);
    }
    46% {
      opacity: 1;
      transform: scale(1.04);
      filter: brightness(1.2) saturate(1.3)
              drop-shadow(0 4px 14px rgba(37,99,235,.45))
              drop-shadow(0 0 6px rgba(96,165,250,.5));
    }
  }

  /* --- System float (matches aidash-float: -6px / 6s) --- */
  @keyframes hcl-float {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-6px); }
  }

  /* --- Card entrance (matches aidash-panel-in) --- */
  @keyframes hcl-panel-in {
    from { opacity: 0; transform: scale(.96) translateY(8px); }
    to   { opacity: 1; transform: scale(1)   translateY(0);   }
  }

  /* --- Full-screen fade in --- */
  @keyframes hcl-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

/**
 * HoneycombLoader
 *
 * Props
 *   size    – hex width px            (default 42)
 *   overlay – covers nearest parent   (default false)
 *             When true: glass panel centred in the parent.
 *             When false: renders the card directly — caller centers it.
 */
const HoneycombLoader = ({
  size    = 42,
  overlay = false,
}) => {
  const gap     = size * 0.165;
  const hexW    = size;
  const hexH    = size * 1.1547;       // 2 / √3
  const colStep = hexW + gap;
  const rowStep = hexH * 0.75 + gap * 0.44;

  const gridW   = 4 * colStep - gap;
  const gridH   = 2 * rowStep + hexH;
  const shiftX  = colStep * 0.5;       // even rows are indented

  /* ── Single hexagon tile ──────────────────────────────────────── */
  const Hex = ({ cell }) => {
    const midRow  = cell.row === 1;
    const x       = cell.col * colStep + (midRow ? 0 : shiftX);
    const y       = cell.row * rowStep;
    const dur     = 1.8 + cell.id * 0.03;
    const delay   = STAGGER[cell.id];
    /* Gradient shifts slightly per tile — centre is the "hottest" (most saturated) */
    const pct     = Math.round(48 + (4 - cell.id % 5) * 4);

    return (
      <div style={{
        position:  'absolute',
        left: x,   top: y,
        width:     hexW,
        height:    hexH,
        clipPath:  'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)',
        /* system royal-blue gradient */
        background:`linear-gradient(140deg, #60a5fa 0%, #2563eb ${pct}%, #1d4ed8 100%)`,
        animation: `hcl-pulse ${dur}s cubic-bezier(.4,0,.6,1) ${delay}s infinite`,
        /* base opacity per distance from centre */
        opacity:   BASE_OPACITY[cell.id],
      }} />
    );
  };

  /* ── The floating hex grid (no card/panel background) ─────────── */
  const card = (
    <div style={{
      position:  'relative',
      width:     gridW,
      height:    gridH,
      animation: 'hcl-float 6s ease-in-out infinite, hcl-panel-in .3s cubic-bezier(.16,1,.3,1) both',
    }}>
      {HEX_GRID.map(cell => <Hex key={cell.id} cell={cell} />)}
    </div>
  );

  /* ── Render modes ─────────────────────────────────────────────── */
  return (
    <>
      <style>{CSS}</style>

      {overlay ? (
        /* Glass panel centred over the nearest positioned parent */
        <div style={{
          position:            'absolute',
          inset:               0,
          zIndex:              50,
          display:             'flex',
          alignItems:          'center',
          justifyContent:      'center',
          background:          'rgba(255,255,255,0.55)',
          backdropFilter:      'blur(10px) saturate(140%)',
          WebkitBackdropFilter:'blur(10px) saturate(140%)',
          borderRadius:        'inherit',
          animation:           'hcl-fade-in .2s ease both',
        }}>
          {card}
        </div>
      ) : (
        card
      )}
    </>
  );
};

export default HoneycombLoader;
