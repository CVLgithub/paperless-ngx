import { HttpClient, HttpParams } from '@angular/common/http'
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
  catchError,
  debounceTime,
  EMPTY,
  filter,
  merge,
  Subject,
  switchMap,
} from 'rxjs'
import { environment } from 'src/environments/environment'
import { Document, DocumentVersionInfo } from '../data/document'
import { PaperlessTaskStatus } from '../data/paperless-task'
import { Results } from '../data/results'
import {
  PermissionAction,
  PermissionsService,
  PermissionType,
} from './permissions.service'
import { WebsocketStatusService } from './websocket-status.service'

export const VERSION_INBOX_STORAGE_KEY = 'version-inbox-service:readState'
export const VERSION_INBOX_FIELDS = 'id,title,modified,versions'
export const VERSION_INBOX_PAGE_SIZE = 50

export interface VersionInboxReadState {
  /** Maps document ID (as string) to the latest version ID the user has seen. */
  seenVersionIds: Record<string, number>
  /** Epoch ms cutoff recorded when the user clicked "Mark all as read". */
  readAllBeforeMs?: number
}

export interface VersionInboxEntry {
  documentId: number
  title: string
  versionCount: number
  latestVersionId: number
  latestVersionLabel: string | null
  latestAdded: string | Date | null
  latestAddedMs: number
  modified: string | null
  modifiedMs: number
}

export interface VersionInboxItem extends VersionInboxEntry {
  unread: boolean
}

export function parseTimestampMs(value?: string | Date | null): number {
  if (!value) return 0
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : 0
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : 0
  }
  return 0
}

export function getDocumentVersionCount(
  doc?: Pick<Document, 'versions'> | null
): number {
  return Array.isArray(doc?.versions) ? doc.versions.length : 0
}

export function getDocumentLatestVersion(
  doc?: Pick<Document, 'versions'> | null
): DocumentVersionInfo | null {
  if (!Array.isArray(doc?.versions) || doc.versions.length <= 1) {
    return null
  }
  return doc.versions[0] ?? null
}

export function extractVersionInboxEntries(
  documents: Document[]
): VersionInboxEntry[] {
  const entries: VersionInboxEntry[] = []

  for (const doc of documents ?? []) {
    if (!Array.isArray(doc.versions) || doc.versions.length <= 1) {
      continue
    }
    const latest = doc.versions[0]
    if (!latest) {
      continue
    }
    const latestAdded = latest.added ?? doc.modified ?? null
    const latestAddedMs = parseTimestampMs(latestAdded)
    const modified = doc.modified ?? null
    const modifiedMs = parseTimestampMs(modified)
    const rawLabel = latest.version_label?.trim()

    entries.push({
      documentId: doc.id,
      title: doc.title ?? '',
      versionCount: doc.versions.length,
      latestVersionId: latest.id,
      latestVersionLabel: rawLabel ? rawLabel : null,
      latestAdded,
      latestAddedMs,
      modified,
      modifiedMs,
    })
  }

  entries.sort((a, b) => {
    if (b.latestAddedMs !== a.latestAddedMs) {
      return b.latestAddedMs - a.latestAddedMs
    }
    if (b.modifiedMs !== a.modifiedMs) {
      return b.modifiedMs - a.modifiedMs
    }
    return b.latestVersionId - a.latestVersionId
  })

  return entries
}

@Injectable({
  providedIn: 'root',
})
export class VersionInboxService {
  private readonly http = inject(HttpClient, { optional: true })
  private readonly permissionsService = inject(PermissionsService, {
    optional: true,
  })
  private readonly websocketStatusService = inject(WebsocketStatusService, {
    optional: true,
  })
  private readonly destroyRef = inject(DestroyRef)

  private readonly refreshTrigger$ = new Subject<void>()

  private readonly rawItems = signal<VersionInboxEntry[]>([])
  private readonly readState = signal<VersionInboxReadState>(
    this.loadReadState()
  )

  readonly loading = signal(false)
  readonly loaded = signal(false)
  readonly error = signal<string | null>(null)

  readonly items = computed<VersionInboxItem[]>(() => {
    const state = this.readState()
    return this.rawItems().map((entry) => ({
      ...entry,
      unread: this.evaluateUnread(
        state,
        entry.documentId,
        entry.latestVersionId,
        entry.latestAddedMs
      ),
    }))
  })

  readonly unreadCount = computed(
    () => this.items().filter((item) => item.unread).length
  )

  constructor() {
    this.refreshTrigger$
      .pipe(
        switchMap(() => {
          if (!this.http || !this.canViewDocuments()) {
            this.rawItems.set([])
            this.loading.set(false)
            this.loaded.set(true)
            this.error.set(null)
            return EMPTY
          }

          this.loading.set(true)
          this.error.set(null)

          const params = new HttpParams()
            .set('page', '1')
            .set('page_size', String(VERSION_INBOX_PAGE_SIZE))
            .set('ordering', '-modified')
            .set('fields', VERSION_INBOX_FIELDS)

          return this.http
            .get<Results<Document>>(`${environment.apiBaseUrl}documents/`, {
              params,
            })
            .pipe(
              catchError(() => {
                this.loading.set(false)
                this.error.set(
                  $localize`Versionsänderungen konnten nicht geladen werden.`
                )
                return EMPTY
              })
            )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((response) => {
        this.rawItems.set(extractVersionInboxEntries(response?.results ?? []))
        this.loading.set(false)
        this.loaded.set(true)
        this.error.set(null)
      })

    if (this.websocketStatusService) {
      merge(
        this.websocketStatusService.onDocumentConsumptionFinished(),
        this.websocketStatusService.onDocumentUpdated(),
        this.websocketStatusService.onDocumentDeleted(),
        this.websocketStatusService
          .onBulkOperationStatus()
          .pipe(
            filter((event) => event.status === PaperlessTaskStatus.Success)
          )
      )
        .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          if (this.loaded()) {
            this.refresh()
          }
        })
    }

    if (typeof window !== 'undefined') {
      const onStorage = (event: StorageEvent) => {
        if (event.key === VERSION_INBOX_STORAGE_KEY) {
          this.readState.set(this.loadReadState())
        }
      }
      window.addEventListener('storage', onStorage)
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('storage', onStorage)
      })
    }
  }

  ensureLoaded(): void {
    if (!this.loaded() && !this.loading()) {
      this.refresh()
    }
  }

  refresh(): void {
    this.refreshTrigger$.next()
  }

  isVersionUnread(
    documentId: number,
    latestVersionId: number,
    latestAddedMs: number
  ): boolean {
    return this.evaluateUnread(
      this.readState(),
      documentId,
      latestVersionId,
      latestAddedMs
    )
  }

  isDocumentUnread(
    doc?: Pick<Document, 'id' | 'versions' | 'modified'> | null
  ): boolean {
    const latest = getDocumentLatestVersion(doc)
    if (!doc || !latest) {
      return false
    }
    const latestAddedMs = parseTimestampMs(latest.added ?? doc.modified)
    return this.isVersionUnread(doc.id, latest.id, latestAddedMs)
  }

  markAsRead(documentId: number, latestVersionId: number): void {
    const current = this.readState()
    const key = String(documentId)
    if (current.seenVersionIds[key] === latestVersionId) {
      return
    }
    const next: VersionInboxReadState = {
      ...current,
      seenVersionIds: {
        ...current.seenVersionIds,
        [key]: latestVersionId,
      },
    }
    this.readState.set(next)
    this.saveReadState(next)
  }

  markAllAsRead(): void {
    const current = this.readState()
    const seenVersionIds: Record<string, number> = { ...current.seenVersionIds }
    let maxLatestAddedMs = current.readAllBeforeMs ?? 0

    for (const item of this.rawItems()) {
      seenVersionIds[String(item.documentId)] = item.latestVersionId
      if (item.latestAddedMs > maxLatestAddedMs) {
        maxLatestAddedMs = item.latestAddedMs
      }
    }

    const next: VersionInboxReadState = {
      seenVersionIds,
      ...(maxLatestAddedMs > 0 ? { readAllBeforeMs: maxLatestAddedMs } : {}),
    }
    this.readState.set(next)
    this.saveReadState(next)
  }

  private evaluateUnread(
    state: VersionInboxReadState,
    documentId: number,
    latestVersionId: number,
    latestAddedMs: number
  ): boolean {
    const seenVersionId = state.seenVersionIds[String(documentId)]
    if (seenVersionId === latestVersionId) {
      return false
    }
    if (seenVersionId !== undefined) {
      return true
    }
    if (
      state.readAllBeforeMs != null &&
      latestAddedMs > 0 &&
      latestAddedMs <= state.readAllBeforeMs
    ) {
      return false
    }
    return true
  }

  private canViewDocuments(): boolean {
    if (!this.permissionsService) return false
    return this.permissionsService.currentUserCan(
      PermissionAction.View,
      PermissionType.Document
    )
  }

  private loadReadState(): VersionInboxReadState {
    try {
      const raw = localStorage.getItem(VERSION_INBOX_STORAGE_KEY)
      if (!raw) {
        return { seenVersionIds: {} }
      }
      const parsed = JSON.parse(raw) as Partial<VersionInboxReadState>
      const seenVersionIds: Record<string, number> = {}
      if (
        parsed?.seenVersionIds &&
        typeof parsed.seenVersionIds === 'object' &&
        !Array.isArray(parsed.seenVersionIds)
      ) {
        for (const [key, value] of Object.entries(parsed.seenVersionIds)) {
          if (typeof value === 'number' && Number.isFinite(value)) {
            seenVersionIds[key] = value
          }
        }
      }
      const readAllBeforeMs =
        typeof parsed?.readAllBeforeMs === 'number' &&
        Number.isFinite(parsed.readAllBeforeMs)
          ? parsed.readAllBeforeMs
          : undefined
      return {
        seenVersionIds,
        ...(readAllBeforeMs !== undefined ? { readAllBeforeMs } : {}),
      }
    } catch {
      return { seenVersionIds: {} }
    }
  }

  private saveReadState(state: VersionInboxReadState): void {
    try {
      localStorage.setItem(VERSION_INBOX_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
}
