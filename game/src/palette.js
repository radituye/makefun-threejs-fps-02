// The look plan, in one place. EMBERLINE is a dusk industrial yard: deep violet dusk,
// warm amber sodium light, teal for the defending Ashen team, ember orange for the
// attacking Emberline team. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#16121d',
  surface: '#221b2e',
  hairline: '#3a3049',
  ink: '#f0ead9',
  muted: '#9b93a8',
  accent: '#f5a02c',
  ember: '#ff5a2a',
  ash: '#6fc2b4',
  danger: '#e5484d',
};

export function shade(name) {
  return PALETTE[name];
}
