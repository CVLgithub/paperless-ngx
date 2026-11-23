import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { Subject, of, throwError } from 'rxjs'
import {
  PaperlessTask,
  PaperlessTaskStatus,
  PaperlessTaskTriggerSource,
  PaperlessTaskType,
} from '../data/paperless-task'
import { DocumentListViewService } from './document-list-view.service'
import {
  MergeWorkflowService,
  MergeWorkflowState,
  buildExpectedMergedFilename,
} from './merge-workflow.service'
import { DocumentService } from './rest/document.service'
import { TasksService } from './tasks.service'
import { ToastService } from './toast.service'
import { FileStatus, WebsocketStatusService } from './websocket-status.service'

describe('MergeWorkflowService', () => {
  let service: MergeWorkflowService
  let documentService: { mergeDocuments: jest.Mock }
  let tasksService: { list: jest.Mock }
  let router: { navigate: jest.Mock }
  let listService: { selectNone: jest.Mock; reload: jest.Mock }
  let toastService: { show: jest.Mock; showError: jest.Mock }
  let bulkStatus$: Subject<any>
  let detected$: Subject<FileStatus>
  let finished$: Subject<FileStatus>
  let failed$: Subject<FileStatus>

  beforeEach(() => {
    jest.useFakeTimers()
    bulkStatus$ = new Subject()
    detected$ = new Subject()
    finished$ = new Subject()
    failed$ = new Subject()

    documentService = {
      mergeDocuments: jest.fn(),
    }
    tasksService = {
      list: jest.fn().mockReturnValue(of({ count: 0, all: [], results: [] })),
    }
    router = {
      navigate: jest.fn(),
    }
    listService = {
      selectNone: jest.fn(),
      reload: jest.fn(),
    }
    toastService = {
      show: jest.fn(),
      showError: jest.fn(),
    }

    TestBed.configureTestingModule({
      providers: [
        MergeWorkflowService,
        { provide: DocumentService, useValue: documentService },
        { provide: TasksService, useValue: tasksService },
        { provide: Router, useValue: router },
        { provide: DocumentListViewService, useValue: listService },
        { provide: ToastService, useValue: toastService },
        {
          provide: WebsocketStatusService,
          useValue: {
            onBulkOperationStatus: () => bulkStatus$.asObservable(),
            onDocumentDetected: () => detected$.asObservable(),
            onDocumentConsumptionFinished: () => finished$.asObservable(),
            onDocumentConsumptionFailed: () => failed$.asObservable(),
          },
        },
      ],
    })

    service = TestBed.inject(MergeWorkflowService)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('builds expected merged filename matching backend convention', () => {
    expect(buildExpectedMergedFilename([12, 34])).toBe('12_34_merged.pdf')
  })

  it('tracks merge via polling and redirects to the newly created document detail page', () => {
    documentService.mergeDocuments.mockReturnValue(
      of({ result: 'OK', task_id: 'merge-task-1' })
    )

    const consumeTask: PaperlessTask = {
      id: 99,
      task_id: 'consume-task-1',
      task_type: PaperlessTaskType.ConsumeFile,
      task_type_display: 'Consume',
      trigger_source: PaperlessTaskTriggerSource.System,
      trigger_source_display: 'System',
      status: PaperlessTaskStatus.Success,
      status_display: 'Success',
      date_created: new Date(),
      input_data: { filename: '10_20_merged.pdf' },
      related_document_ids: [42],
      acknowledged: false,
    }

    tasksService.list
      .mockReturnValueOnce(
        of({
          count: 1,
          all: [1],
          results: [
            {
              ...consumeTask,
              id: 1,
              task_id: 'merge-task-1',
              task_type: PaperlessTaskType.BulkUpdate,
              related_document_ids: [],
            },
          ],
        })
      )
      .mockReturnValueOnce(
        of({
          count: 1,
          all: [99],
          results: [consumeTask],
        })
      )

    const states: MergeWorkflowState[] = []
    service
      .startMerge([10, 20], { delete_originals: false }, { pollIntervalMs: 500 })
      .state$.subscribe((s) => states.push(s))

    jest.advanceTimersByTime(0)
    expect(states.some((s) => s.phase === 'ocr')).toBe(true)

    jest.advanceTimersByTime(500)
    expect(states[states.length - 1].phase).toBe('completed')
    expect(states[states.length - 1].documentId).toBe(42)
    expect(listService.selectNone).toHaveBeenCalled()
    expect(listService.reload).toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/documents', 42, 'details'], {
      state: {
        mergedFrom: {
          count: 2,
          deleteOriginals: false,
        },
      },
    })
  })

  it('completes via websocket consumption finished event', () => {
    documentService.mergeDocuments.mockReturnValue(
      of({ result: 'OK', task_id: 'merge-task-ws' })
    )

    const states: MergeWorkflowState[] = []
    service
      .startMerge([5, 6], { delete_originals: true }, { pollIntervalMs: 5000 })
      .state$.subscribe((s) => states.push(s))

    jest.advanceTimersByTime(0)

    const status = new FileStatus()
    status.filename = '5_6_merged.pdf'
    status.documentId = 77
    finished$.next(status)

    expect(router.navigate).toHaveBeenCalledWith(['/documents', 77, 'details'], {
      state: {
        mergedFrom: {
          count: 2,
          deleteOriginals: true,
        },
      },
    })
  })

  it('shows toast instead of forcing navigation when continued in background', () => {
    documentService.mergeDocuments.mockReturnValue(
      of({ result: 'OK', task_id: 'merge-task-bg' })
    )

    const handle = service.startMerge([1, 2], {}, { pollIntervalMs: 5000 })
    handle.continueInBackground()

    const status = new FileStatus()
    status.filename = '1_2_merged.pdf'
    status.documentId = 88
    finished$.next(status)

    expect(router.navigate).not.toHaveBeenCalled()
    expect(toastService.show).toHaveBeenCalled()
  })

  it('emits error state when merge request fails', () => {
    documentService.mergeDocuments.mockReturnValue(
      throwError(() => new Error('Network error'))
    )

    const states: MergeWorkflowState[] = []
    service.startMerge([1, 2]).state$.subscribe((s) => states.push(s))

    expect(states[states.length - 1].phase).toBe('error')
    expect(states[states.length - 1].errorMessage).toBeTruthy()
  })

  it('emits error state on timeout', () => {
    documentService.mergeDocuments.mockReturnValue(
      of({ result: 'OK', task_id: 'merge-task-timeout' })
    )

    const states: MergeWorkflowState[] = []
    service
      .startMerge([1, 2], {}, { pollIntervalMs: 1000, timeoutMs: 2500 })
      .state$.subscribe((s) => states.push(s))

    jest.advanceTimersByTime(2500)
    expect(states[states.length - 1].phase).toBe('error')
    expect(states[states.length - 1].errorMessage).toContain('Hintergrund')
  })
})
