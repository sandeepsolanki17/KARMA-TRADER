/**
 * React Native has no CSS/Tailwind — these are the same design tokens used
 * in apps/admin's tailwind.config.js, kept in sync by hand. True glass
 * blur (backdrop-filter) isn't available in RN, so panels here use a
 * translucent fill + hairline border + shadow to approximate the same
 * layered depth language instead.
 */
export const colors = {
  void: '#0B0D0F',
  panel: 'rgba(255,255,255,0.045)',
  panelStrong: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.09)',
  ink: '#E7E9EA',
  muted: '#8A9199',
  buy: '#3DDC84',
  sell: '#FF6B5B',
  amber: '#F5B942',
  info: '#5B9DFF',
};

export const radius = { md: 12, lg: 16, xl: 20 };

export const spacing = (n: number) => n * 4;
