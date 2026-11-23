import { Document } from 'src/app/data/document'
import { groupDocumentsByRecency } from './redesign-document-groups'

describe('groupDocumentsByRecency', () => {
  it('groups documents into Heute hinzugefügt, Diese Woche, and Älter', () => {
    const now = new Date('2026-11-20T14:00:00Z')
    const docs: Document[] = [
      { id: 1, title: 'Heute', added: new Date('2026-11-20T09:00:00Z') },
      { id: 2, title: 'Diese Woche', added: new Date('2026-11-17T09:00:00Z') },
      { id: 3, title: 'Älter', added: new Date('2026-09-01T09:00:00Z') },
    ]

    const groups = groupDocumentsByRecency(docs, now)
    expect(groups.map((g) => g.key)).toEqual(['today', 'week', 'older'])
    expect(groups[0].documents.map((d) => d.id)).toEqual([1])
    expect(groups[1].documents.map((d) => d.id)).toEqual([2])
    expect(groups[2].documents.map((d) => d.id)).toEqual([3])
  })

  it('omits empty groups', () => {
    const now = new Date('2026-11-20T14:00:00Z')
    const docs: Document[] = [
      { id: 10, title: 'Alt', added: new Date('2025-01-01T00:00:00Z') },
    ]
    const groups = groupDocumentsByRecency(docs, now)
    expect(groups.length).toBe(1)
    expect(groups[0].key).toBe('older')
  })
})
