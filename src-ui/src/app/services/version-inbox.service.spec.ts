import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { BulkOperationStatus } from 'src/app/data/bulk-operation'
import { Document } from 'src/app/data/document'
import { PaperlessTaskStatus } from 'src/app/data/paperless-task'
import { WebsocketDocumentUpdatedMessage } from 'src/app/data/websocket-document-updated-message'
import { environment } from 'src/environments/environment'
import { PermissionsService } from './permissions.service'
import {
  extractVersionInboxEntries,
  VERSION_INBOX_FIELDS,
  VERSION_INBOX_PAGE_SIZE,
  VERSION_INBOX_STORAGE_KEY,
  VersionInboxService,
} from './version-inbox.service'
import { FileStatus, WebsocketStatusService } from './websocket-status.service'

const makeDoc = (overrides: Partial<Document>): Document =>
  ({
    id: 1,
    title: 'Dokument',
    modified: '2026-11-20T10:00:00Z',
    versions: [],
    ...overrides,
  }) as Document

describe('VersionInboxService', () => {
  let service: VersionInboxService
  let httpTestingController: HttpTestingController
  let canViewDocuments: boolean
  let consumptionFinished$: Subject<FileStatus>
  let documentUpdated$: Subject<WebsocketDocumentUpdatedMessage>
  let documentDeleted$: Subject<boolean>
  let bulkOperationStatus$: Subject<BulkOperationStatus>

  const expectedUrl = `${environment.apiBaseUrl}documents/?page=1&page_size=${VERSION_INBOX_PAGE_SIZE}&ordering=-modified&fields=${VERSION_INBOX_FIELDS}`

  beforeEach(() => {
    localStorage.clear()
    canViewDocuments = true
    consumptionFinished$ = new Subject<FileStatus>()
    documentUpdated$ = new Subject<WebsocketDocumentUpdatedMessage>()
    documentDeleted$ = new Subject<boolean>()
    bulkOperationStatus$ = new Subject<BulkOperationStatus>()

    TestBed.configureTestingModule({
      providers: [
        VersionInboxService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: PermissionsService,
          useValue: {
            currentUserCan: jest.fn(() => canViewDocuments),
          },
        },
        {
          provide: WebsocketStatusService,
          useValue: {
            onDocumentConsumptionFinished: () =>
              consumptionFinished$.asObservable(),
            onDocumentUpdated: () => documentUpdated$.asObservable(),
            onDocumentDeleted: () => documentDeleted$.asObservable(),
            onBulkOperationStatus: () => bulkOperationStatus$.asObservable(),
          },
        },
      ],
    })

    service = TestBed.inject(VersionInboxService)
    httpTestingController = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpTestingController.verify()
    localStorage.clear()
  })

  it('extracts only documents with more than one version and sorts by latest version added timestamp', () => {
    const entries = extractVersionInboxEntries([
      makeDoc({
        id: 1,
        title: 'Nur eine Version',
        versions: [
          {
            id: 1,
            added: '2026-11-25T12:00:00Z' as unknown as Date,
            is_root: true,
          },
        ],
      }),
      makeDoc({
        id: 2,
        title: 'Ältere neue Version',
        modified: '2026-11-25T13:00:00Z',
        versions: [
          {
            id: 21,
            added: '2026-11-24T09:00:00Z' as unknown as Date,
            version_label: ' Korrektur ',
            is_root: false,
          },
          {
            id: 2,
            added: '2026-11-01T09:00:00Z' as unknown as Date,
            is_root: true,
          },
        ],
      }),
      makeDoc({
        id: 3,
        title: 'Neueste Version',
        modified: '2026-11-25T11:00:00Z',
        versions: [
          {
            id: 32,
            added: '2026-11-25T10:30:00Z' as unknown as Date,
            version_label: 'v3 Final',
            is_root: false,
          },
          {
            id: 31,
            added: '2026-11-20T08:00:00Z' as unknown as Date,
            is_root: false,
          },
          {
            id: 3,
            added: '2026-11-10T08:00:00Z' as unknown as Date,
            is_root: true,
          },
        ],
      }),
    ])

    expect(entries.map((e) => e.documentId)).toEqual([3, 2])
    expect(entries[0]).toMatchObject({
      documentId: 3,
      versionCount: 3,
      latestVersionId: 32,
      latestVersionLabel: 'v3 Final',
    })
    expect(entries[1]).toMatchObject({
      documentId: 2,
      versionCount: 2,
      latestVersionId: 21,
      latestVersionLabel: 'Korrektur',
    })
  })

  it('fetches recent documents ordered by -modified and filters to versioned entries', () => {
    service.ensureLoaded()
    expect(service.loading()).toBe(true)

    const req = httpTestingController.expectOne(expectedUrl)
    expect(req.request.method).toBe('GET')
    req.flush({
      count: 2,
      results: [
        makeDoc({
          id: 10,
          title: 'Ohne Versionen',
          versions: [
            {
              id: 10,
              added: '2026-11-25T12:00:00Z' as unknown as Date,
              is_root: true,
            },
          ],
        }),
        makeDoc({
          id: 11,
          title: 'Vertrag Strom',
          modified: '2026-11-25T11:00:00Z',
          versions: [
            {
              id: 112,
              added: '2026-11-25T11:00:00Z' as unknown as Date,
              version_label: 'Nachtrag',
              is_root: false,
            },
            {
              id: 11,
              added: '2025-01-01T10:00:00Z' as unknown as Date,
              is_root: true,
            },
          ],
        }),
      ],
    })

    expect(service.loading()).toBe(false)
    expect(service.loaded()).toBe(true)
    expect(service.items()).toHaveLength(1)
    expect(service.items()[0]).toMatchObject({
      documentId: 11,
      versionCount: 2,
      latestVersionId: 112,
      latestVersionLabel: 'Nachtrag',
      unread: true,
    })
    expect(service.unreadCount()).toBe(1)
  })

  it('persists markAsRead in localStorage and marks a document unread again when a newer version arrives', () => {
    service.refresh()
    httpTestingController.expectOne(expectedUrl).flush({
      count: 1,
      results: [
        makeDoc({
          id: 42,
          title: 'Police',
          versions: [
            {
              id: 200,
              added: '2026-11-24T12:00:00Z' as unknown as Date,
              is_root: false,
            },
            {
              id: 42,
              added: '2026-01-01T12:00:00Z' as unknown as Date,
              is_root: true,
            },
          ],
        }),
      ],
    })

    expect(service.unreadCount()).toBe(1)

    service.markAsRead(42, 200)
    expect(service.unreadCount()).toBe(0)
    expect(service.items()[0].unread).toBe(false)

    const saved = JSON.parse(localStorage.getItem(VERSION_INBOX_STORAGE_KEY))
    expect(saved.seenVersionIds['42']).toBe(200)

    // New automatic version 201 arrives for the same document
    service.refresh()
    httpTestingController.expectOne(expectedUrl).flush({
      count: 1,
      results: [
        makeDoc({
          id: 42,
          title: 'Police',
          versions: [
            {
              id: 201,
              added: '2026-11-25T14:00:00Z' as unknown as Date,
              version_label: 'Auto-Update',
              is_root: false,
            },
            {
              id: 200,
              added: '2026-11-24T12:00:00Z' as unknown as Date,
              is_root: false,
            },
            {
              id: 42,
              added: '2026-01-01T12:00:00Z' as unknown as Date,
              is_root: true,
            },
          ],
        }),
      ],
    })

    expect(service.unreadCount()).toBe(1)
    expect(service.items()[0].unread).toBe(true)
    expect(service.items()[0].versionCount).toBe(3)
  })

  it('marks all loaded items read with markAllAsRead and keeps newer future items unread', () => {
    service.refresh()
    httpTestingController.expectOne(expectedUrl).flush({
      count: 2,
      results: [
        makeDoc({
          id: 5,
          title: 'Alt',
          versions: [
            {
              id: 51,
              added: '2026-11-20T10:00:00Z' as unknown as Date,
              is_root: false,
            },
            {
              id: 5,
              added: '2026-01-01T10:00:00Z' as unknown as Date,
              is_root: true,
            },
          ],
        }),
        makeDoc({
          id: 6,
          title: 'Mittel',
          versions: [
            {
              id: 61,
              added: '2026-11-22T10:00:00Z' as unknown as Date,
              is_root: false,
            },
            {
              id: 6,
              added: '2026-01-01T10:00:00Z' as unknown as Date,
              is_root: true,
            },
          ],
        }),
      ],
    })

    expect(service.unreadCount()).toBe(2)
    service.markAllAsRead()
    expect(service.unreadCount()).toBe(0)

    // Unseen older document from before cutoff stays read
    const olderUnseenDoc = makeDoc({
      id: 99,
      versions: [
        {
          id: 991,
          added: '2026-11-21T10:00:00Z' as unknown as Date,
          is_root: false,
        },
        {
          id: 99,
          added: '2026-01-01T10:00:00Z' as unknown as Date,
          is_root: true,
        },
      ],
    })
    expect(service.isDocumentUnread(olderUnseenDoc)).toBe(false)

    // Brand new version after cutoff is highlighted as unread
    const newerDoc = makeDoc({
      id: 100,
      versions: [
        {
          id: 1001,
          added: '2026-11-25T15:00:00Z' as unknown as Date,
          is_root: false,
        },
        {
          id: 100,
          added: '2026-01-01T10:00:00Z' as unknown as Date,
          is_root: true,
        },
      ],
    })
    expect(service.isDocumentUnread(newerDoc)).toBe(true)
  })

  it('skips HTTP requests when user lacks Document view permission', () => {
    canViewDocuments = false
    service.ensureLoaded()
    httpTestingController.expectNone(expectedUrl)
    expect(service.loaded()).toBe(true)
    expect(service.items()).toEqual([])
  })

  it('handles API errors gracefully and allows retrying', () => {
    service.refresh()
    httpTestingController
      .expectOne(expectedUrl)
      .flush('Server Error', { status: 500, statusText: 'Server Error' })

    expect(service.loading()).toBe(false)
    expect(service.error()).toBeTruthy()

    service.refresh()
    httpTestingController.expectOne(expectedUrl).flush({
      count: 0,
      results: [],
    })

    expect(service.error()).toBeNull()
    expect(service.loaded()).toBe(true)
  })

  it('refreshes automatically on WebSocket document updates after initial load', () => {
    jest.useFakeTimers()
    try {
      // Before initial load, websocket events should not fire a request
      documentUpdated$.next({ document_id: 1 } as WebsocketDocumentUpdatedMessage)
      jest.advanceTimersByTime(500)
      httpTestingController.expectNone(expectedUrl)

      // Perform initial load
      service.ensureLoaded()
      httpTestingController
        .expectOne(expectedUrl)
        .flush({ count: 0, results: [] })

      // Now a bulk operation success triggers a debounced refresh
      bulkOperationStatus$.next({
        task_id: 't1',
        status: PaperlessTaskStatus.Success,
        message: 'Done',
      })
      jest.advanceTimersByTime(500)

      httpTestingController
        .expectOne(expectedUrl)
        .flush({ count: 0, results: [] })
    } finally {
      jest.useRealTimers()
    }
  })
})
