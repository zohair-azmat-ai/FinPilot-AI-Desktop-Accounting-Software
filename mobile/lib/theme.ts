export const C = {
  bg:        '#0F1117',
  card:      '#161828',
  border:    '#1E2235',
  brand:     '#6366F1',
  brandBg:   'rgba(99,102,241,0.12)',
  text:      '#F1F5F9',
  sub:       '#94A3B8',
  muted:     '#475569',
  success:   '#10B981',
  successBg: 'rgba(16,185,129,0.12)',
  warn:      '#F59E0B',
  warnBg:    'rgba(245,158,11,0.12)',
  err:       '#EF4444',
  errBg:     'rgba(239,68,68,0.12)',
} as const;

export const STATUS_COLOR: Record<string, string> = {
  unpaid:  C.err,
  partial: C.warn,
  paid:    C.success,
  draft:   C.muted,
  sent:    C.brand,
  overdue: C.err,
};

export const STATUS_BG: Record<string, string> = {
  unpaid:  C.errBg,
  partial: C.warnBg,
  paid:    C.successBg,
  draft:   'rgba(71,85,105,0.2)',
  sent:    C.brandBg,
};
