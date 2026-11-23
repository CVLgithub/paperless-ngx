import { Injectable, inject } from '@angular/core'
import { Router } from '@angular/router'
import {
  BehaviorSubject,
  Observable,
  Subject,
  catchError,
  interval,
  of,
  startWith,
  switchMap,
  takeUntil,
  timer,
} from 'rxjs'
import {
  PaperlessTask,
  PaperlessTaskStatus,
  PaperlessTaskType,
} from '../data/paperless-task'
import { DocumentListViewService } from './document-list-view.service'
import {
  DocumentService,
  MergeDocumentsRequest,
} from './rest/document.service'
import { TasksService } from './tasks.service'
import { ToastService } from './toast.service'
import { WebsocketStatusService } from './websocket-status.service'

export type MergeWorkflowPhase =
  | 'merging'
  | 'ocr'
  | 'archiving'
  | 'completed'
  | 'background'
  | 'error'

export interface MergeWorkflowState {
  phase: MergeWorkflowPhase
  progress: number
  sourceCount: number
  deleteOriginals: boolean
  documentId?: number
  errorMessage?: string
}

export interface MergeWorkflowHandle {
  readonly state$: Observable<MergeWorkflowState>
  continueInBackground: () => void
  cancelTracking: () => void
}

export const MERGE_WORKFLOW_TIMEOUT_MS = 90_000
export const MERGE_WORKFLOW_POLL_MS = 1_000

export function buildExpectedMergedFilename(documentIds: number[]): string {
  return `${documentIds.join('_').slice(0, 100)}_merged.pdf`
}

export function extractRelatedDocumentId(task: PaperlessTask): number | null {
  if (Array.isArray(task.related_document_ids) && task.related_document_ids.length > 0) {
    const firstId = Number(task.related_document_ids[0])
    if (Number.isFinite(firstId) && firstId > 0) {
      return firstId
    }
  }
  const legacyId = (task as unknown as { related_document?: string | number })
    .related_document
  if (legacyId != null && legacyId !== '') {
    const parsed = Number(legacyId)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return null
}

@Injectable({
  providedIn: 'root',
})
export class MergeWorkflowService {
  private readonly documentService = inject(DocumentService)
  private readonly tasksService = inject(TasksService)
  private readonly websocketStatusService = inject(WebsocketStatusService)
  private readonly list = inject(DocumentListViewService)
  private readonly toastService = inject(ToastService)
  private readonly router = inject(Router)

  startMerge(
    documentIds: number[],
    args: MergeDocumentsRequest = {},
    options?: { pollIntervalMs?: number; timeoutMs?: number }
  ): MergeWorkflowHandle {
    const pollIntervalMs = options?.pollIntervalMs ?? MERGE_WORKFLOW_POLL_MS
    const timeoutMs = options?.timeoutMs ?? MERGE_WORKFLOW_TIMEOUT_MS
    const expectedFilename = buildExpectedMergedFilename(documentIds)
    const startedAtMs = Date.now() - 5_000
    const deleteOriginals = !!args.delete_originals

    const stateSubject = new BehaviorSubject<MergeWorkflowState>({
      phase: 'merging',
      progress: 14,
      sourceCount: documentIds.length,
      deleteOriginals,
    })

    const stop$ = new Subject<void>()
    let finished = false
    let backgrounded = false
    let ocrStartedAt: number | null = null

    const emitState = (partial: Partial<MergeWorkflowState>) => {
      if (finished) return
      const current = stateSubject.value
      stateSubject.next({
        ...current,
        ...partial,
        progress: Math.max(current.progress, partial.progress ?? current.progress),
      })
    }

    const completeWithDocument = (documentId: number) => {
      if (finished) return
      finished = true
      stateSubject.next({
        ...stateSubject.value,
        phase: 'completed',
        progress: 100,
        documentId,
      })
      stop$.next()
      stop$.complete()
      stateSubject.complete()

      this.list.selectNone()
      this.list.reload()

      if (backgrounded) {
        this.toastService.show({
          title: $localize`Neues Dokument erstellt`,
          content: $localize`Aus ${documentIds.length} Dokumenten zusammengeführt.`,
          delay: 6000,
          actionName: $localize`Öffnen`,
          action: () => {
            this.router.navigate(['/documents', documentId, 'details'])
          },
        })
      } else {
        this.router.navigate(['/documents', documentId, 'details'], {
          state: {
            mergedFrom: {
              count: documentIds.length,
              deleteOriginals,
            },
          },
        })
      }
    }

    const failWithMessage = (errorMessage: string) => {
      if (finished) return
      finished = true
      stateSubject.next({
        ...stateSubject.value,
        phase: 'error',
        errorMessage,
      })
      stop$.next()
      stop$.complete()
      stateSubject.complete()
      if (backgrounded) {
        this.toastService.showError(errorMessage)
      }
    }

    const handle: MergeWorkflowHandle = {
      state$: stateSubject.asObservable(),
      continueInBackground: () => {
        if (finished) return
        backgrounded = true
        stateSubject.next({
          ...stateSubject.value,
          phase: 'background',
        })
      },
      cancelTracking: () => {
        if (finished) return
        finished = true
        stop$.next()
        stop$.complete()
        stateSubject.complete()
      },
    }

    this.documentService
      .mergeDocuments(documentIds, args)
      .pipe(takeUntil(stop$))
      .subscribe({
        next: (response) => {
          const mergeTaskId = response?.task_id
          emitState({ phase: 'merging', progress: 22 })
          this.trackMergeTasks(
            mergeTaskId,
            expectedFilename,
            startedAtMs,
            pollIntervalMs,
            timeoutMs,
            stop$,
            () => {
              if (ocrStartedAt === null) {
                ocrStartedAt = Date.now()
              }
              return ocrStartedAt
            },
            emitState,
            completeWithDocument,
            failWithMessage
          )
        },
        error: () => {
          failWithMessage(
            $localize`Das Zusammenführen konnte nicht gestartet werden. Bitte versuche es erneut.`
          )
        },
      })

    return handle
  }

  private trackMergeTasks(
    mergeTaskId: string | undefined,
    expectedFilename: string,
    startedAtMs: number,
    pollIntervalMs: number,
    timeoutMs: number,
    stop$: Subject<void>,
    markOcrStarted: () => number,
    emitState: (partial: Partial<MergeWorkflowState>) => void,
    completeWithDocument: (documentId: number) => void,
    failWithMessage: (errorMessage: string) => void
  ): void {
    // 1. WebSocket live updates for bulk merge & follow-up consumption
    this.websocketStatusService
      .onBulkOperationStatus()
      .pipe(takeUntil(stop$))
      .subscribe((status) => {
        if (!mergeTaskId || status.task_id !== mergeTaskId) return
        if (status.status === 'failure') {
          failWithMessage(
            status.error ||
              $localize`Beim Zusammenführen der Dokumente ist ein Fehler aufgetreten.`
          )
        } else if (status.status === 'success') {
          markOcrStarted()
          emitState({ phase: 'ocr', progress: 48 })
        }
      })

    this.websocketStatusService
      .onDocumentDetected()
      .pipe(takeUntil(stop$))
      .subscribe((fileStatus) => {
        if (fileStatus.filename !== expectedFilename) return
        markOcrStarted()
        emitState({ phase: 'ocr', progress: 56 })
      })

    this.websocketStatusService
      .onDocumentConsumptionFinished()
      .pipe(takeUntil(stop$))
      .subscribe((fileStatus) => {
        if (fileStatus.filename !== expectedFilename) return
        if (fileStatus.documentId) {
          emitState({ phase: 'archiving', progress: 94 })
          completeWithDocument(fileStatus.documentId)
        }
      })

    this.websocketStatusService
      .onDocumentConsumptionFailed()
      .pipe(takeUntil(stop$))
      .subscribe((fileStatus) => {
        if (fileStatus.filename !== expectedFilename) return
        failWithMessage(
          fileStatus.message ||
            $localize`Die Verarbeitung des zusammengeführten Dokuments ist fehlgeschlagen.`
        )
      })

    // 2. Polling fallback against /api/tasks/ (works reliably even if WebSocket events are missed)
    interval(pollIntervalMs)
      .pipe(
        startWith(0),
        takeUntil(stop$),
        switchMap(() =>
          this.tasksService
            .list(1, 25, { ordering: '-date_created' })
            .pipe(catchError(() => of(null)))
        )
      )
      .subscribe((res) => {
        const tasks = res?.results
        if (!tasks) return

        if (mergeTaskId) {
          const mergeTask = tasks.find((t) => t.task_id === mergeTaskId)
          if (mergeTask) {
            if (
              mergeTask.status === PaperlessTaskStatus.Failure ||
              mergeTask.status === PaperlessTaskStatus.Revoked
            ) {
              failWithMessage(
                this.extractTaskError(mergeTask) ||
                  $localize`Beim Zusammenführen der Dokumente ist ein Fehler aufgetreten.`
              )
              return
            }

            const directDocId = extractRelatedDocumentId(mergeTask)
            if (
              mergeTask.status === PaperlessTaskStatus.Success &&
              directDocId
            ) {
              completeWithDocument(directDocId)
              return
            }

            if (mergeTask.status === PaperlessTaskStatus.Success) {
              markOcrStarted()
              emitState({ phase: 'ocr', progress: 48 })
            }
          }
        }

        const consumeTask = tasks.find((t) =>
          this.matchesConsumeTask(t, expectedFilename, startedAtMs)
        )
        if (!consumeTask) return

        if (
          consumeTask.status === PaperlessTaskStatus.Failure ||
          consumeTask.status === PaperlessTaskStatus.Revoked
        ) {
          failWithMessage(
            this.extractTaskError(consumeTask) ||
              $localize`Die Verarbeitung des zusammengeführten Dokuments ist fehlgeschlagen.`
          )
          return
        }

        if (consumeTask.status === PaperlessTaskStatus.Success) {
          const newDocId = extractRelatedDocumentId(consumeTask)
          if (newDocId) {
            emitState({ phase: 'archiving', progress: 95 })
            completeWithDocument(newDocId)
          }
          return
        }

        if (
          consumeTask.status === PaperlessTaskStatus.Started ||
          consumeTask.status === PaperlessTaskStatus.Pending
        ) {
          const ocrSince = markOcrStarted()
          if (Date.now() - ocrSince > 2_000) {
            emitState({ phase: 'archiving', progress: 80 })
          } else {
            emitState({ phase: 'ocr', progress: 58 })
          }
        }
      })

    // 3. Timeout guard
    timer(timeoutMs)
      .pipe(takeUntil(stop$))
      .subscribe(() => {
        failWithMessage(
          $localize`Die Verarbeitung dauert länger als erwartet. Das neue Dokument wird im Hintergrund weiter erstellt und erscheint anschließend in der Übersicht.`
        )
      })
  }

  private matchesConsumeTask(
    task: PaperlessTask,
    expectedFilename: string,
    startedAtMs: number
  ): boolean {
    if (task.task_type !== PaperlessTaskType.ConsumeFile) {
      return false
    }
    const taskFilename =
      task.input_data?.['filename'] ??
      (task as unknown as { task_file_name?: string }).task_file_name
    if (taskFilename !== expectedFilename) {
      return false
    }
    if (!task.date_created) {
      return true
    }
    const createdMs = new Date(task.date_created).getTime()
    return Number.isNaN(createdMs) || createdMs >= startedAtMs
  }

  private extractTaskError(task: PaperlessTask): string | null {
    const rd = task.result_data
    if (!rd) return null
    const candidate = rd['error'] ?? rd['message'] ?? rd['result']
    return typeof candidate === 'string' && candidate.trim().length > 0
      ? candidate
      : null
  }
}
