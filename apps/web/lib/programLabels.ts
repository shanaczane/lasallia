// Nicer display names for some catalog programs. Only the label changes;
// stored values, filters and URLs keep the raw name.

const PROGRAM_LABELS: Record<string, string> = {
  ABCOMMUNICATION: 'AB Communication',
  HRM: 'Human Resource Management',
}

export function programLabel(value: string | null | undefined): string {
  if (!value) return ''
  return PROGRAM_LABELS[value] ?? value
}
