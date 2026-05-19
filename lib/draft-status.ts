export type DraftStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'error'

export type StatusMeta = {
  label: string
  bg: string
  fg: string
  border: string
}

export const STATUS_META: Record<DraftStatus, StatusMeta> = {
  pending_review: {
    label: 'Pendiente de revisión',
    bg: '#fff8e1',
    fg: '#7a5200',
    border: '#f0c674',
  },
  approved: {
    label: 'Aprobado',
    bg: '#e6f4ea',
    fg: '#0f7a3c',
    border: '#4fb26e',
  },
  rejected: {
    label: 'Rechazado',
    bg: '#fdecea',
    fg: '#a61b1b',
    border: '#e57373',
  },
  published: {
    label: 'Publicado',
    bg: '#e8f0fe',
    fg: '#1d3969',
    border: '#4b7bd9',
  },
  error: {
    label: 'Error',
    bg: '#fdecea',
    fg: '#a61b1b',
    border: '#e57373',
  },
}

export function statusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return STATUS_META.pending_review
  return STATUS_META[(status as DraftStatus) in STATUS_META ? (status as DraftStatus) : 'pending_review']
    ?? STATUS_META.pending_review
}
