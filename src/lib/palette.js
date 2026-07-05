// Curated franchise palette. Keys MUST stay in sync with the check constraint
// in supabase/migrations/006_franchise_identity.sql. Add a color here AND there.
export const PALETTE = [
  { key: 'forest',   name: 'Forest',   primary: '#183d2c', secondary: '#c8b273' },
  { key: 'crimson',  name: 'Crimson',  primary: '#8c2b2b', secondary: '#e8dcc5' },
  { key: 'royal',    name: 'Royal',    primary: '#1d3a8a', secondary: '#f2c14e' },
  { key: 'gold',     name: 'Gold',     primary: '#a47a2c', secondary: '#1c1a14' },
  { key: 'slate',    name: 'Slate',    primary: '#3f4a54', secondary: '#d7dde2' },
  { key: 'purple',   name: 'Purple',   primary: '#4b2673', secondary: '#d9c66a' },
  { key: 'teal',     name: 'Teal',     primary: '#12605c', secondary: '#e7d8a6' },
  { key: 'orange',   name: 'Orange',   primary: '#b4531f', secondary: '#1c1a14' },
  { key: 'navy',     name: 'Navy',     primary: '#16233f', secondary: '#c9a24b' },
  { key: 'maroon',   name: 'Maroon',   primary: '#5c1f2e', secondary: '#e2c9a0' },
  { key: 'emerald',  name: 'Emerald',  primary: '#0f6b3f', secondary: '#f0e6c8' },
  { key: 'charcoal', name: 'Charcoal', primary: '#232420', secondary: '#b9863f' }
];

export const PALETTE_KEYS = PALETTE.map((p) => p.key);
export const paletteByKey = Object.fromEntries(PALETTE.map((p) => [p.key, p]));

const MONOGRAM_STOPWORDS = new Set(['the', 'of', 'and', 'fc', 'sc', 'a']);

// Auto-generate a 1–3 char monogram from a franchise name. Editable afterward.
export function autoMonogram(name) {
  const clean = (name || '').trim();
  if (!clean) return 'X';
  const words = clean.split(/\s+/).filter((w) => !MONOGRAM_STOPWORDS.has(w.toLowerCase()));
  const source = words.length ? words : clean.split(/\s+/);
  let mono = source.map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (mono.length <= 1) {
    const letters = clean.toUpperCase().replace(/[^A-Z0-9]/g, '');
    mono = letters.slice(0, 2) || 'X';
  }
  return mono.slice(0, 3);
}
