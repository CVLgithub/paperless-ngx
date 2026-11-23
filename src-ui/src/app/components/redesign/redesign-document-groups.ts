import { Document } from 'src/app/data/document'

export interface DocumentTimeGroup {
  key: 'today' | 'week' | 'older' | 'all'
  label: string
  documents: Document[]
  showUploadCard: boolean
}

export function isDateSortField(sortField: string | null | undefined): boolean {
  if (!sortField) return true
  return ['created', 'added', 'modified', 'created_date'].includes(sortField)
}

export function groupDocumentsByRecency(
  documents: Document[],
  sortField: string | null | undefined,
  includeUploadCard: boolean,
  now: Date = new Date()
): DocumentTimeGroup[] {
  if (!isDateSortField(sortField)) {
    return [
      {
        key: 'all',
        label: '',
        documents,
        showUploadCard: includeUploadCard,
      },
    ]
  }

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000

  const todayDocs: Document[] = []
  const weekDocs: Document[] = []
  const olderDocs: Document[] = []

  for (const doc of documents) {
    const rawDate = doc.added ?? doc.created
    const ts = rawDate ? new Date(rawDate).getTime() : 0
    if (ts >= startOfToday) {
      todayDocs.push(doc)
    } else if (ts >= startOfWeek) {
      weekDocs.push(doc)
    } else {
      olderDocs.push(doc)
    }
  }

  const groups: DocumentTimeGroup[] = []

  if (todayDocs.length > 0 || includeUploadCard) {
    groups.push({
      key: 'today',
      label: 'Heute hinzugefügt',
      documents: todayDocs,
      showUploadCard: includeUploadCard,
    })
  }

  if (weekDocs.length > 0) {
    groups.push({
      key: 'week',
      label: 'Diese Woche',
      documents: weekDocs,
      showUploadCard: false,
    })
  }

  if (olderDocs.length > 0) {
    groups.push({
      key: 'older',
      label: 'Älter',
      documents: olderDocs,
      showUploadCard: false,
    })
  }

  return groups
}
