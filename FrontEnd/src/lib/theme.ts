export type Severity = 'critical' | 'high' | 'medium' | 'low';

/** Semantic accents — fixed regardless of theme (color must always mean the same thing). */
export const RED = '#DC2626';
export const GREEN = '#16A34A';

/** Severity uses a single navy/red intensity ramp (never 4 hues). */
const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#DC2626',
  high: '#3B5BA9',
  medium: '#6B84C4',
  low: '#A9B8DA',
};

export function sevColor(sev: Severity): string {
  return SEVERITY_COLORS[sev];
}
