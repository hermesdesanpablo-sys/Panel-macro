// Íconos de commodities (decorativos: el nombre siempre va al lado). Trazos en currentColor + tinte por producto.
const TINT = { oil: '#c9ccd1', gold: '#e0b73f', silver: '#c7ccd4', copper: '#d07a4a', soy: '#93c25a' };

const SHAPES = {
  // Barril con dos aros
  oil: (
    <>
      <path d="M7 4h10c.9 2.6 1.4 5.3 1.4 8s-.5 5.4-1.4 8H7c-.9-2.6-1.4-5.3-1.4-8S6.1 6.6 7 4z" />
      <path d="M5.9 8.5h12.2M5.9 15.5h12.2" />
    </>
  ),
  // Lingote (trapecio en perspectiva)
  bar: (
    <>
      <path d="M3.5 17.5 6.5 9h11l3 8.5z" />
      <path d="M6.5 9 8.5 6h7l2 3" />
    </>
  ),
  // Bobina de cable de cobre
  copper: (
    <>
      <ellipse cx="12" cy="12" rx="7.5" ry="7.5" />
      <ellipse cx="12" cy="12" rx="4.5" ry="4.5" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M19.5 12h2" />
    </>
  ),
  // Vaina de soja con tres granos
  soy: (
    <>
      <path d="M5 18.5C4 13 8.5 5.5 15.5 4.5c3-.4 4.3 1 3.9 3.6C18.4 14.5 11 19.8 5 18.5z" />
      <circle cx="9.3" cy="14.3" r="1.6" />
      <circle cx="12.6" cy="10.9" r="1.6" />
      <circle cx="15.7" cy="7.8" r="1.4" />
    </>
  ),
};

const BY_TICKER = {
  'BZ=F': ['oil', 'oil'],
  'CL=F': ['oil', 'oil'],
  'GC=F': ['bar', 'gold'],
  'SI=F': ['bar', 'silver'],
  'HG=F': ['copper', 'copper'],
  'ZS=F': ['soy', 'soy'],
};

export function CmdIcon({ ticker, size = 22 }) {
  const m = BY_TICKER[ticker];
  if (!m) return null;
  const [shape, tint] = m;
  return (
    <svg className="cmd-icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={TINT[tint]} strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SHAPES[shape]}
    </svg>
  );
}
