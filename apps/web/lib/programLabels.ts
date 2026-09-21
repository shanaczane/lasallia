// apps/web/lib/programLabels.ts
// Display names for catalog "Program" values. books.category holds the raw
// Excel sheet name, and two of those read badly as labels. Only what's shown
// changes — the stored value, filter values and URL params stay the raw code,
// so links, backend filters and report grouping keep working.

const PROGRAM_LABELS: Record<string, string> = {
  ABCOMMUNICATION: 'AB Communication',
  HRM: 'Human Resource Management',
}

export function programLabel(value: string | null | undefined): string {
  if (!value) return ''
  return PROGRAM_LABELS[value] ?? value
}
