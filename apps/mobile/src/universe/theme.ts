/**
 * Zuri Universe — design tokens.
 * Source of truth for the mobile look. Spec: docs/MOBILE_UNIVERSE_DESIGN.md
 */
export const colors = {
  void: '#03040B',
  space: '#070818',
  deep: '#140F33',
  ink: '#EEF0FF', // primary text
  inkSoft: '#B9BFE0', // body text
  inkMuted: '#A3AACC', // labels, timestamps (≥ 4.5:1 on space)
  nebula: '#7C5CFF', // primary accent (violet)
  nebulaSoft: '#CFC4FF',
  ion: '#7DF9FF', // live / selection / focus (cyan)
  ionSoft: '#AFF7FF',
  sun: '#FF9E4A', // "you" — the user's core
  aurora: '#5BF5B0', // thriving / success
  auroraSoft: '#9DF5C9',
  ember: '#FF966E', // drifting / attention
  emberSoft: '#FFC1A8',
  star: '#FFB86B', // warnings, noticings
  starSoft: '#FFD9AE',
  glassFill: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.13)',
} as const;

export const gradients = {
  sky: ['#140F33', '#070818', '#03040B'] as const,
  launch: ['#6A45FF', '#9B5CFF', '#3EC6E0'] as const,
  outgoing: ['#6A45FF', '#9B5CFF'] as const,
  glass: ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.03)'] as const,
  card: ['rgba(28,24,66,0.95)', 'rgba(10,11,30,0.96)'] as const,
};

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  bodyHeavy: 'Inter_800ExtraBold',
} as const;

export const radii = { chip: 999, control: 18, card: 24, sheet: 30, hero: 32 } as const;

/** A planet's surface: [highlight, body, shadow]. Every contact gets one, deterministically. */
export type PlanetSkin = readonly [string, string, string];

export const PLANET_SKINS: readonly PlanetSkin[] = [
  ['#FFD6F0', '#FF6FB5', '#7A1650'], // rose
  ['#FFF0D0', '#FFB86B', '#7A3A0A'], // amber
  ['#D8FFFB', '#3EE6E0', '#0B5A62'], // teal
  ['#E5F9D8', '#7BE06A', '#1D5A12'], // moss
  ['#E0E6FF', '#6F8BFF', '#16236E'], // cobalt
  ['#EDE0FF', '#A57BFF', '#341670'], // amethyst
  ['#FFF6C8', '#F5D547', '#6E5A06'], // citrine
  ['#FFE0D6', '#FF8A6B', '#6E200F'], // coral
];

export const SUN_SKIN: PlanetSkin = ['#FFE1A8', '#FF9E4A', '#B5361E'];
export const CORE_SKIN: PlanetSkin = ['#E9E3FF', '#9B7BFF', '#1B1150'];
export const CLEAR_SKIN: PlanetSkin = ['#BFFFE6', '#5BF5B0', '#0E5E43'];

export function skinFor(seed: string): PlanetSkin {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PLANET_SKINS[Math.abs(h) % PLANET_SKINS.length];
}

export function initialOf(name: string): string {
  const ch = name.trim().replace(/^\+/, '').charAt(0);
  return ch ? ch.toUpperCase() : '•';
}

export type HealthBand = 'thriving' | 'steady' | 'drifting' | 'dormant';

/** Health score → band. Same thresholds as the web relationship grid. */
export function healthBand(score: number | null | undefined): HealthBand {
  if (score == null) return 'dormant';
  if (score >= 75) return 'thriving';
  if (score >= 50) return 'steady';
  if (score >= 25) return 'drifting';
  return 'dormant';
}

export const BAND_STYLE: Record<HealthBand, { label: string; color: string; soft: string; fill: string }> = {
  thriving: { label: 'Thriving', color: colors.aurora, soft: colors.auroraSoft, fill: 'rgba(91,245,176,0.15)' },
  steady: { label: 'Steady', color: colors.ion, soft: colors.ionSoft, fill: 'rgba(125,249,255,0.13)' },
  drifting: { label: 'Drifting', color: colors.ember, soft: colors.emberSoft, fill: 'rgba(255,150,110,0.16)' },
  dormant: { label: 'Dormant', color: '#8F97BD', soft: '#C9CEEA', fill: 'rgba(160,170,220,0.15)' },
};

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff < 7 * 86_400_000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
