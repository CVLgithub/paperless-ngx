import { DatePipe } from '@angular/common'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { Document } from 'src/app/data/document'
import { DocumentType } from 'src/app/data/document-type'
import { Tag } from 'src/app/data/tag'
import { DocumentService } from 'src/app/services/rest/document.service'
import { SettingsService } from 'src/app/services/settings.service'
import { VersionInboxService } from 'src/app/services/version-inbox.service'
import { RedesignDocumentCardComponent } from './redesign-document-card.component'

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
    document_type: 10,
    page_count: 3,
    ...overrides,
  }) as Document

describe('RedesignDocumentCardComponent', () => {
  let fixture: ComponentFixture<RedesignDocumentCardComponent>
  let component: RedesignDocumentCardComponent
  let documentService: { getThumbUrl: jest.Mock; getPreviewUrl: jest.Mock }

  const img = (): HTMLImageElement =>
    fixture.debugElement.query(By.css('img.rd-doc-card__thumb')).nativeElement
  const sheet = (): HTMLElement =>
    fixture.debugElement.query(By.css('.rd-doc-card__sheet')).nativeElement

  beforeEach(async () => {
    documentService = {
      getThumbUrl: jest.fn((id: number) => `/api/documents/${id}/thumb/`),
      getPreviewUrl: jest.fn((id: number) => `/api/documents/${id}/preview/`),
    }

    await TestBed.configureTestingModule({
      imports: [RedesignDocumentCardComponent],
      providers: [
        DatePipe,
        { provide: DocumentService, useValue: documentService },
        { provide: SettingsService, useValue: { get: () => null } },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(RedesignDocumentCardComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput('document', doc())
    fixture.componentRef.setInput(
      'tagMap',
      new Map(tags.map((t) => [t.id, t]))
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

  it('updates derived values when the document input changes', () => {
    fixture.componentRef.setInput(
      'document',
      doc({ id: 2, title: 'Zweites', tags: [2, 3], document_type: null })
    )
    fixture.detectChanges()

    const el: HTMLElement = fixture.nativeElement
    expect(img().getAttribute('src')).toBe('/api/documents/2/thumb/')
    expect(el.querySelector('.rd-doc-card__title').textContent.trim()).toBe(
      'Zweites'
    )
    expect(el.querySelector('.rd-doc-card__type')).toBeNull()
    expect(el.querySelectorAll('.rd-doc-card__dot').length).toBe(2)
    expect(
      el.querySelector('.rd-doc-card__preview').getAttribute('href')
    ).toBe('/api/documents/2/preview/')
  })

  it('updates the type pill when the documentTypeMap is replaced', () => {
    fixture.componentRef.setInput(
      'documentTypeMap',
      new Map<number, DocumentType>([[10, { id: 10, name: 'Vertrag' }]])
    )
    fixture.detectChanges()
    expect(
      fixture.nativeElement.querySelector('.rd-doc-card__type').textContent
    ).toBe('Vertrag')
  })

  it('caps the tag dots at 5 and hides inbox tags', () => {
    const many: Tag[] = Array.from({ length: 8 }, (_, i) => ({
      id: 100 + i,
      name: `T${i}`,
    }))
    fixture.componentRef.setInput(
      'tagMap',
      new Map([...tags, ...many].map((t) => [t.id, t]))
    )
    fixture.componentRef.setInput(
      'document',
      doc({ tags: [1, ...many.map((t) => t.id)] })
    )
    fixture.detectChanges()
    expect(
      fixture.nativeElement.querySelectorAll('.rd-doc-card__dot').length
    ).toBe(5)
  })

  it('shows a loading placeholder until the thumbnail loads', () => {
    expect(sheet().classList).toContain('rd-thumb-frame--loading')
    img().dispatchEvent(new Event('load'))
    fixture.detectChanges()
    expect(sheet().classList).not.toContain('rd-thumb-frame--loading')
    expect(sheet().classList).not.toContain('rd-thumb-frame--error')
  })

  it('keeps a neutral placeholder when the thumbnail fails', () => {
    img().dispatchEvent(new Event('error'))
    fixture.detectChanges()
    expect(sheet().classList).toContain('rd-thumb-frame--error')
    expect(sheet().classList).not.toContain('rd-thumb-frame--loading')
  })

  it('keeps the loaded state for a refreshed object of the same document, resets for a new one', () => {
    img().dispatchEvent(new Event('load'))
    fixture.detectChanges()

    fixture.componentRef.setInput('document', doc({ title: 'Neu geladen' }))
    fixture.detectChanges()
    expect(component.thumbState()).toBe('loaded')

    fixture.componentRef.setInput('document', doc({ id: 5 }))
    fixture.detectChanges()
    expect(component.thumbState()).toBe('loading')
    expect(sheet().classList).toContain('rd-thumb-frame--loading')
  })

  it('reflects selection inputs and emits events', () => {
    const clickSpy = jest.fn()
    const toggleSpy = jest.fn()
    component.cardClick.subscribe(clickSpy)
    component.toggleSelect.subscribe(toggleSpy)

    const article: HTMLElement =
      fixture.nativeElement.querySelector('.rd-doc-card')
    article.click()
    expect(clickSpy).toHaveBeenCalledTimes(1)

    fixture.componentRef.setInput('selected', true)
    fixture.componentRef.setInput('selectionMode', true)
    fixture.detectChanges()
    expect(article.classList).toContain('rd-doc-card--selected')
    expect(fixture.nativeElement.querySelector('.rd-doc-card__preview')).toBeNull()

    article.click()
    expect(toggleSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    fixture.nativeElement.querySelector('.rd-doc-card__check').click()
    expect(toggleSpy).toHaveBeenCalledTimes(2)
  })

  it('shows a version badge only when a document has multiple versions and reacts to read state', () => {
    localStorage.clear()
    expect(fixture.nativeElement.querySelector('.rd-doc-card__version')).toBeNull()

    fixture.componentRef.setInput(
      'document',
      doc({
        versions: [
          {
            id: 1,
            added: '2026-11-20T10:00:00Z' as unknown as Date,
            is_root: true,
          },
        ],
      })
    )
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('.rd-doc-card__version')).toBeNull()

    fixture.componentRef.setInput(
      'document',
      doc({
        id: 77,
        versions: [
          {
            id: 772,
            added: '2026-11-25T10:00:00Z' as unknown as Date,
            version_label: 'Unterschrieben',
            is_root: false,
          },
          {
            id: 77,
            added: '2026-11-01T10:00:00Z' as unknown as Date,
            is_root: true,
          },
        ],
      })
    )
    fixture.detectChanges()

    const badge: HTMLElement =
      fixture.nativeElement.querySelector('.rd-doc-card__version')
    expect(badge).not.toBeNull()
    expect(badge.textContent.trim()).toBe('v2')
    expect(badge.classList).toContain('rd-doc-card__version--unread')
    expect(badge.getAttribute('title')).toContain('2 Versionen')
    expect(badge.getAttribute('title')).toContain('Unterschrieben')

    const versionInbox = TestBed.inject(VersionInboxService)
    versionInbox.markAsRead(77, 772)
    fixture.detectChanges()

    expect(badge.classList).not.toContain('rd-doc-card__version--unread')
    localStorage.clear()
  })
})
