import { DatePipe } from '@angular/common'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { Correspondent } from 'src/app/data/correspondent'
import { Document } from 'src/app/data/document'
import { DocumentType } from 'src/app/data/document-type'
import { Tag } from 'src/app/data/tag'
import { DocumentService } from 'src/app/services/rest/document.service'
import { SettingsService } from 'src/app/services/settings.service'
import { RedesignDocumentListRowComponent } from './redesign-document-list-row.component'

const tags: Tag[] = [
  { id: 1, name: 'Inbox', color: '#ff0000', is_inbox_tag: true },
  { id: 2, name: 'Rechnung', color: '#00ff00' },
  { id: 3, name: 'Steuer', color: '#0000ff' },
]

const doc = (overrides: Partial<Document> = {}): Document =>
  ({
    id: 1,
    title: 'Erstes Dokument',
    created: new Date('2024-01-02'),
    tags: [1, 2],
    correspondent: 20,
    document_type: 10,
    page_count: 3,
    ...overrides,
  }) as Document

describe('RedesignDocumentListRowComponent', () => {
  let fixture: ComponentFixture<RedesignDocumentListRowComponent>
  let component: RedesignDocumentListRowComponent
  let documentService: { getThumbUrl: jest.Mock; getPreviewUrl: jest.Mock }

  const img = (): HTMLImageElement =>
    fixture.debugElement.query(By.css('img.rd-list-row__thumb')).nativeElement
  const frame = (): HTMLElement =>
    fixture.debugElement.query(By.css('.rd-list-row__thumb-wrap'))
      .nativeElement
  const text = (selector: string): string | undefined =>
    fixture.nativeElement.querySelector(selector)?.textContent.trim()

  beforeEach(async () => {
    documentService = {
      getThumbUrl: jest.fn((id: number) => `/api/documents/${id}/thumb/`),
      getPreviewUrl: jest.fn((id: number) => `/api/documents/${id}/preview/`),
    }

    await TestBed.configureTestingModule({
      imports: [RedesignDocumentListRowComponent],
      providers: [
        DatePipe,
        { provide: DocumentService, useValue: documentService },
        { provide: SettingsService, useValue: { get: () => null } },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(RedesignDocumentListRowComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput('document', doc())
    fixture.componentRef.setInput(
      'tagMap',
      new Map(tags.map((t) => [t.id, t]))
    )
    fixture.componentRef.setInput(
      'correspondentMap',
      new Map<number, Correspondent>([[20, { id: 20, name: 'Stadtwerke' }]])
    )
    fixture.componentRef.setInput(
      'documentTypeMap',
      new Map<number, DocumentType>([[10, { id: 10, name: 'Rechnung' }]])
    )
    fixture.detectChanges()
  })

  it('renders lazy, low-priority thumbnails by default', () => {
    expect(img().getAttribute('loading')).toBe('lazy')
    expect(img().getAttribute('fetchpriority')).toBe('low')
    expect(img().getAttribute('decoding')).toBe('async')
    expect(img().getAttribute('src')).toBe('/api/documents/1/thumb/')
  })

  it('renders eager, high-priority thumbnails when priority is set', () => {
    fixture.componentRef.setInput('priority', true)
    fixture.detectChanges()
    expect(img().getAttribute('loading')).toBe('eager')
    expect(img().getAttribute('fetchpriority')).toBe('high')
  })

  it('derives values once and does not recompute on unrelated change detection', () => {
    fixture.detectChanges()
    fixture.detectChanges()
    expect(documentService.getThumbUrl).toHaveBeenCalledTimes(1)
    expect(documentService.getPreviewUrl).toHaveBeenCalledTimes(1)
    const resolved = component.resolvedTags()
    expect(resolved.map((t) => t.id)).toEqual([2])
    expect(component.resolvedTags()).toBe(resolved)
  })

  it('renders correspondent, type and tags', () => {
    expect(text('.rd-list-row__correspondent')).toBe('Stadtwerke')
    expect(text('.rd-list-row__type-badge')).toBe('Rechnung')
    expect(text('.rd-list-row__tag-pill')).toBe('Rechnung')
    expect(text('.rd-list-row__pages')).toBe('3 S.')
  })

  it('updates derived values when the document input changes', () => {
    fixture.componentRef.setInput(
      'document',
      doc({
        id: 2,
        title: 'Zweites',
        tags: [2, 3],
        correspondent: null,
        document_type: null,
      })
    )
    fixture.detectChanges()

    expect(img().getAttribute('src')).toBe('/api/documents/2/thumb/')
    expect(text('.rd-list-row__title')).toBe('Zweites')
    expect(text('.rd-list-row__correspondent')).toBeUndefined()
    expect(text('.rd-list-row__type-badge')).toBeUndefined()
    expect(
      fixture.nativeElement.querySelectorAll('.rd-list-row__tag-pill').length
    ).toBe(2)
    expect(
      fixture.nativeElement
        .querySelector('.rd-list-row__preview')
        .getAttribute('href')
    ).toBe('/api/documents/2/preview/')
  })

  it('updates names when taxonomy maps are replaced', () => {
    fixture.componentRef.setInput(
      'correspondentMap',
      new Map<number, Correspondent>([[20, { id: 20, name: 'Finanzamt' }]])
    )
    fixture.detectChanges()
    expect(text('.rd-list-row__correspondent')).toBe('Finanzamt')
  })

  it('caps the tag pills at 4', () => {
    const many: Tag[] = Array.from({ length: 6 }, (_, i) => ({
      id: 100 + i,
      name: `T${i}`,
    }))
    fixture.componentRef.setInput(
      'tagMap',
      new Map([...tags, ...many].map((t) => [t.id, t]))
    )
    fixture.componentRef.setInput(
      'document',
      doc({ tags: many.map((t) => t.id) })
    )
    fixture.detectChanges()
    expect(
      fixture.nativeElement.querySelectorAll('.rd-list-row__tag-pill').length
    ).toBe(4)
  })

  it('shows a loading placeholder until the thumbnail loads', () => {
    expect(frame().classList).toContain('rd-thumb-frame--loading')
    img().dispatchEvent(new Event('load'))
    fixture.detectChanges()
    expect(frame().classList).not.toContain('rd-thumb-frame--loading')
    expect(frame().classList).not.toContain('rd-thumb-frame--error')
  })

  it('keeps a neutral placeholder when the thumbnail fails', () => {
    img().dispatchEvent(new Event('error'))
    fixture.detectChanges()
    expect(frame().classList).toContain('rd-thumb-frame--error')
    expect(frame().classList).not.toContain('rd-thumb-frame--loading')
  })

  it('resets the thumbnail state only when the document id changes', () => {
    img().dispatchEvent(new Event('load'))
    fixture.detectChanges()

    fixture.componentRef.setInput('document', doc({ title: 'Neu geladen' }))
    fixture.detectChanges()
    expect(component.thumbState()).toBe('loaded')

    fixture.componentRef.setInput('document', doc({ id: 7 }))
    fixture.detectChanges()
    expect(component.thumbState()).toBe('loading')
  })

  it('reflects selection inputs and emits events', () => {
    const clickSpy = jest.fn()
    const toggleSpy = jest.fn()
    component.rowClick.subscribe(clickSpy)
    component.toggleSelect.subscribe(toggleSpy)

    const row: HTMLElement = fixture.nativeElement.querySelector('.rd-list-row')
    row.click()
    expect(clickSpy).toHaveBeenCalledTimes(1)

    fixture.componentRef.setInput('selected', true)
    fixture.componentRef.setInput('selectionMode', true)
    fixture.detectChanges()
    expect(row.classList).toContain('rd-list-row--selected')

    row.click()
    expect(toggleSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    fixture.nativeElement.querySelector('.rd-list-row__check').click()
    expect(toggleSpy).toHaveBeenCalledTimes(2)
  })
})
