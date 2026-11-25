import { DatePipe } from '@angular/common'
import { computed, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { SettingsService } from 'src/app/services/settings.service'
import {
  VersionInboxItem,
  VersionInboxService,
} from 'src/app/services/version-inbox.service'
import { RedesignVersionInboxComponent } from './redesign-version-inbox.component'

const sampleItems: VersionInboxItem[] = [
  {
    documentId: 12,
    title: 'Stromvertrag',
    versionCount: 3,
    latestVersionId: 120,
    latestVersionLabel: 'Nachtrag 2026',
    latestAdded: '2026-11-25T13:00:00Z',
    latestAddedMs: Date.parse('2026-11-25T13:00:00Z'),
    modified: '2026-11-25T13:00:00Z',
    modifiedMs: Date.parse('2026-11-25T13:00:00Z'),
    unread: true,
  },
  {
    documentId: 15,
    title: 'Mietvertrag',
    versionCount: 2,
    latestVersionId: 150,
    latestVersionLabel: null,
    latestAdded: '2026-11-24T10:00:00Z',
    latestAddedMs: Date.parse('2026-11-24T10:00:00Z'),
    modified: '2026-11-24T10:00:00Z',
    modifiedMs: Date.parse('2026-11-24T10:00:00Z'),
    unread: false,
  },
]

describe('RedesignVersionInboxComponent', () => {
  let fixture: ComponentFixture<RedesignVersionInboxComponent>
  let component: RedesignVersionInboxComponent
  let itemsSignal: ReturnType<typeof signal<VersionInboxItem[]>>
  let loadingSignal: ReturnType<typeof signal<boolean>>
  let loadedSignal: ReturnType<typeof signal<boolean>>
  let errorSignal: ReturnType<typeof signal<string | null>>
  let mockService: {
    items: ReturnType<typeof signal<VersionInboxItem[]>>
    unreadCount: ReturnType<typeof computed<number>>
    loading: ReturnType<typeof signal<boolean>>
    loaded: ReturnType<typeof signal<boolean>>
    error: ReturnType<typeof signal<string | null>>
    ensureLoaded: jest.Mock
    refresh: jest.Mock
    markAsRead: jest.Mock
    markAllAsRead: jest.Mock
  }

  beforeEach(async () => {
    itemsSignal = signal<VersionInboxItem[]>(sampleItems)
    loadingSignal = signal(false)
    loadedSignal = signal(true)
    errorSignal = signal<string | null>(null)

    mockService = {
      items: itemsSignal,
      unreadCount: computed(
        () => itemsSignal().filter((i) => i.unread).length
      ),
      loading: loadingSignal,
      loaded: loadedSignal,
      error: errorSignal,
      ensureLoaded: jest.fn(),
      refresh: jest.fn(),
      markAsRead: jest.fn((docId: number) => {
        itemsSignal.update((list) =>
          list.map((i) =>
            i.documentId === docId ? { ...i, unread: false } : i
          )
        )
      }),
      markAllAsRead: jest.fn(() => {
        itemsSignal.update((list) => list.map((i) => ({ ...i, unread: false })))
      }),
    }

    await TestBed.configureTestingModule({
      imports: [RedesignVersionInboxComponent],
      providers: [
        DatePipe,
        provideRouter([]),
        { provide: VersionInboxService, useValue: mockService },
        { provide: SettingsService, useValue: { get: () => null } },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(RedesignVersionInboxComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('calls ensureLoaded on init and shows unread badge count on the trigger', () => {
    expect(mockService.ensureLoaded).toHaveBeenCalledTimes(1)

    const badge: HTMLElement = fixture.nativeElement.querySelector(
      '.rd-version-inbox__badge'
    )
    expect(badge.textContent.trim()).toBe('1')

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.rd-version-inbox__trigger'
    )
    expect(trigger.getAttribute('aria-label')).toContain('1 ungelesen')
  })

  it('renders versioned items with title, version pill, optional label, and document link', () => {
    const items: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.rd-version-inbox__item')
    )
    expect(items).toHaveLength(2)

    expect(items[0].classList).toContain('rd-version-inbox__item--unread')
    expect(
      items[0].querySelector('.rd-version-inbox__item-title').textContent.trim()
    ).toBe('Stromvertrag')
    expect(
      items[0]
        .querySelector('.rd-version-inbox__version-pill')
        .textContent.trim()
    ).toBe('v3')
    expect(
      items[0].querySelector('.rd-version-inbox__label').textContent.trim()
    ).toBe('Nachtrag 2026')
    expect(
      items[0]
        .querySelector('.rd-version-inbox__item-link')
        .getAttribute('href')
    ).toBe('/documents/12')

    expect(items[1].classList).not.toContain('rd-version-inbox__item--unread')
    expect(items[1].querySelector('.rd-version-inbox__label')).toBeNull()
    expect(items[1].querySelector('.rd-version-inbox__mark-read')).toBeNull()
  })

  it('marks an individual item as read when clicking its check button', () => {
    const markReadBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.rd-version-inbox__mark-read'
    )
    markReadBtn.click()
    fixture.detectChanges()

    expect(mockService.markAsRead).toHaveBeenCalledWith(12, 120)
    expect(
      fixture.nativeElement.querySelector('.rd-version-inbox__badge')
    ).toBeNull()
  })

  it('marks all items as read when clicking "Alle gelesen"', () => {
    const markAllBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.rd-version-inbox__mark-all'
    )
    markAllBtn.click()
    fixture.detectChanges()

    expect(mockService.markAllAsRead).toHaveBeenCalledTimes(1)
    expect(
      fixture.nativeElement.querySelector('.rd-version-inbox__badge')
    ).toBeNull()
    expect(
      fixture.nativeElement.querySelector('.rd-version-inbox__mark-all')
    ).toBeNull()
  })

  it('refreshes when opened and when clicking the refresh icon button', () => {
    component.onOpenChange(true)
    expect(mockService.refresh).toHaveBeenCalledTimes(1)

    const refreshBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.rd-version-inbox__icon-btn'
    )
    refreshBtn.click()
    expect(mockService.refresh).toHaveBeenCalledTimes(2)
  })

  it('shows empty state when there are no versioned documents', () => {
    itemsSignal.set([])
    fixture.detectChanges()

    expect(
      fixture.nativeElement
        .querySelector('.rd-version-inbox__empty-title')
        .textContent.trim()
    ).toBe('Keine Versionsänderungen')
  })

  it('shows error state and retries when clicking retry button', () => {
    itemsSignal.set([])
    errorSignal.set('Netzwerkfehler')
    fixture.detectChanges()

    expect(
      fixture.nativeElement.querySelector('.rd-version-inbox__state--error')
        .textContent
    ).toContain('Netzwerkfehler')

    const retryBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.rd-version-inbox__retry'
    )
    retryBtn.click()
    expect(mockService.refresh).toHaveBeenCalledTimes(1)
  })
})
