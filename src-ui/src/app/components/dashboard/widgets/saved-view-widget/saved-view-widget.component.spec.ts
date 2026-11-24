import { DragDropModule } from '@angular/cdk/drag-drop'
import { DatePipe } from '@angular/common'
import {
  HttpErrorResponse,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { Router } from '@angular/router'
import { RouterTestingModule } from '@angular/router/testing'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { Subject, of, throwError } from 'rxjs'
import { routes } from 'src/app/app-routing.module'
import { RedesignDocumentCardComponent } from 'src/app/components/redesign/redesign-document-card/redesign-document-card.component'
import { RedesignDocumentListRowComponent } from 'src/app/components/redesign/redesign-document-list-row/redesign-document-list-row.component'
import {
  DEFAULT_DASHBOARD_VIEW_PAGE_SIZE,
  DisplayField,
  DisplayMode,
} from 'src/app/data/document'
import {
  FILTER_CORRESPONDENT,
  FILTER_DOCUMENT_TYPE,
  FILTER_FULLTEXT_MORELIKE,
  FILTER_HAS_TAGS_ALL,
  FILTER_OWNER_ANY,
  FILTER_STORAGE_PATH,
} from 'src/app/data/filter-rule-type'
import { SavedView } from 'src/app/data/saved-view'
import { IfPermissionsDirective } from 'src/app/directives/if-permissions.directive'
import { PermissionsGuard } from 'src/app/guards/permissions.guard'
import {
  DOCUMENT_LIST_FIELDS,
  DocumentListViewService,
} from 'src/app/services/document-list-view.service'
import { PermissionsService } from 'src/app/services/permissions.service'
import { DocumentService } from 'src/app/services/rest/document.service'
import {
  FileStatus,
  WebsocketStatusService,
} from 'src/app/services/websocket-status.service'
import { WidgetFrameComponent } from '../widget-frame/widget-frame.component'
import { SavedViewWidgetComponent } from './saved-view-widget.component'

const savedView: SavedView = {
  id: 1,
  name: 'Saved View 1',
  sort_field: 'added',
  sort_reverse: true,
  show_in_sidebar: true,
  show_on_dashboard: true,
  filter_rules: [
    {
      rule_type: FILTER_HAS_TAGS_ALL,
      value: '1,2',
    },
  ],
  page_size: 20,
  display_mode: DisplayMode.TABLE,
  display_fields: [
    DisplayField.CREATED,
    DisplayField.TITLE,
    DisplayField.TAGS,
    DisplayField.CORRESPONDENT,
    DisplayField.DOCUMENT_TYPE,
    DisplayField.PAGE_COUNT,
  ],
}

const documentResults = [
  {
    id: 2,
    title: 'doc2',
    created: '2024-01-10',
    tags: [1],
    correspondent: 1,
    document_type: 1,
    page_count: 2,
  },
  {
    id: 3,
    title: 'doc3',
    created: '2024-01-11',
    correspondent: 0,
    tags: [],
  },
  {
    id: 4,
    title: 'doc4',
    created: '2024-01-12',
    tags: [],
  },
  {
    id: 5,
    title: 'doc5',
    created: '2024-01-13',
    tags: [],
  },
]

describe('SavedViewWidgetComponent', () => {
  let component: SavedViewWidgetComponent
  let fixture: ComponentFixture<SavedViewWidgetComponent>
  let documentService: DocumentService
  let websocketStatusService: WebsocketStatusService
  let documentListViewService: DocumentListViewService
  let router: Router

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [
        NgbModule,
        RouterTestingModule.withRoutes(routes),
        DragDropModule,
        SavedViewWidgetComponent,
        WidgetFrameComponent,
        RedesignDocumentCardComponent,
        RedesignDocumentListRowComponent,
        IfPermissionsDirective,
      ],
      providers: [
        PermissionsGuard,
        DocumentService,
        {
          provide: PermissionsService,
          useValue: {
            currentUserCan: () => true,
          },
        },
        DatePipe,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents()

    documentService = TestBed.inject(DocumentService)
    websocketStatusService = TestBed.inject(WebsocketStatusService)
    documentListViewService = TestBed.inject(DocumentListViewService)
    router = TestBed.inject(Router)
    fixture = TestBed.createComponent(SavedViewWidgetComponent)
    component = fixture.componentInstance
    component.savedView = { ...savedView }

    fixture.detectChanges()
  })

  it('should show redesign list rows in table mode with preview link', async () => {
    jest.useFakeTimers()
    jest.spyOn(documentService, 'listFiltered').mockReturnValue(
      of({
        all: [2, 3, 4, 5],
        count: 4,
        results: documentResults,
      })
    )
    component.ngOnInit()
    jest.advanceTimersByTime(500)
    await fixture.whenStable()
    fixture.detectChanges()

    const rows = fixture.debugElement.queryAll(
      By.directive(RedesignDocumentListRowComponent)
    )
    expect(rows).toHaveLength(documentResults.length)
    expect(fixture.debugElement.nativeElement.textContent).toContain('doc2')
    expect(fixture.debugElement.nativeElement.textContent).toContain('doc3')

    const previewLink = fixture.debugElement.query(
      By.css('.rd-list-row__preview')
    )
    expect(previewLink).not.toBeNull()
    expect(previewLink.attributes['href']).toEqual(
      documentService.getPreviewUrl(documentResults[0].id)
    )
    jest.useRealTimers()
  })

  it('should show redesign document cards in small and large card modes', () => {
    jest.spyOn(documentService, 'listFiltered').mockReturnValue(
      of({
        all: [2, 3, 4, 5],
        count: 4,
        results: documentResults,
      })
    )

    component.savedView = {
      ...savedView,
      display_mode: DisplayMode.SMALL_CARDS,
    }
    component.ngOnInit()
    fixture.detectChanges()

    expect(
      fixture.debugElement.queryAll(By.directive(RedesignDocumentCardComponent))
    ).toHaveLength(documentResults.length)
    expect(
      fixture.debugElement.query(By.css('.rd-doc-grid--large'))
    ).toBeNull()

    const previewLink = fixture.debugElement.query(
      By.css('.rd-doc-card__preview')
    )
    expect(previewLink).not.toBeNull()
    expect(previewLink.attributes['href']).toEqual(
      documentService.getPreviewUrl(documentResults[0].id)
    )

    component.savedView = {
      ...savedView,
      display_mode: DisplayMode.LARGE_CARDS,
    }
    component.ngOnInit()
    fixture.detectChanges()

    expect(
      fixture.debugElement.query(By.css('.rd-doc-grid--large'))
    ).not.toBeNull()
    expect(
      fixture.debugElement.queryAll(By.directive(RedesignDocumentCardComponent))
    ).toHaveLength(documentResults.length)
  })

  it('should call api endpoint with DOCUMENT_LIST_FIELDS across all display modes', () => {
    const listAllSpy = jest.spyOn(documentService, 'listFiltered')
    listAllSpy.mockReturnValue(
      of({
        all: [2, 3],
        count: 2,
        results: documentResults,
      })
    )
    component.ngOnInit()
    expect(listAllSpy).toHaveBeenCalledWith(
      1,
      20,
      savedView.sort_field,
      savedView.sort_reverse,
      savedView.filter_rules,
      { fields: DOCUMENT_LIST_FIELDS.join(',') }
    )
    const fields: string[] = (
      listAllSpy.mock.calls.at(-1)[5] as { fields: string }
    ).fields.split(',')
    expect(fields).toEqual(expect.arrayContaining(DOCUMENT_LIST_FIELDS))
    expect(fields).not.toContain('content')
    fixture.detectChanges()
    expect(component.documents()).toEqual(documentResults)

    component.displayMode.set(DisplayMode.SMALL_CARDS)
    component.reload()
    expect(listAllSpy.mock.calls.at(-1)[5]).toEqual({
      fields: DOCUMENT_LIST_FIELDS.join(','),
    })

    component.displayMode.set(DisplayMode.LARGE_CARDS)
    component.reload()
    expect(listAllSpy.mock.calls.at(-1)[5]).toEqual({
      fields: DOCUMENT_LIST_FIELDS.join(','),
    })
  })

  it('should show an error if documents fail to load', () => {
    jest.spyOn(documentService, 'listFiltered').mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            error: { added__date__lte: ['Enter a valid date.'] },
            status: 400,
          })
      )
    )

    component.reload()
    fixture.detectChanges()

    expect(component.loading()).toBe(false)
    expect(component.error()).toEqual('Added: Enter a valid date.')
    expect(fixture.debugElement.nativeElement.textContent).toContain(
      'Error while loading documents: Added: Enter a valid date.'
    )
  })

  it('should reload on document consumption finished', () => {
    const fileStatusSubject = new Subject<FileStatus>()
    jest
      .spyOn(websocketStatusService, 'onDocumentConsumptionFinished')
      .mockReturnValue(fileStatusSubject)
    const reloadSpy = jest.spyOn(component, 'reload')
    component.ngOnInit()
    fileStatusSubject.next(new FileStatus())
    expect(reloadSpy).toHaveBeenCalled()
  })

  it('should navigate on showAll', () => {
    const routerSpy = jest.spyOn(router, 'navigate')
    component.showAll()
    expect(routerSpy).toHaveBeenCalledWith(['view', savedView.id])
    component.savedView.show_in_sidebar = false
    component.showAll()
    expect(routerSpy).toHaveBeenCalledWith(['documents'], {
      queryParams: { view: savedView.id },
    })
  })

  it('should navigate to document', () => {
    const routerSpy = jest.spyOn(router, 'navigate')
    const activateSpy = jest.spyOn(
      documentListViewService,
      'activateSavedViewWithDocuments'
    )
    component.openDocumentDetail(documentResults[0])
    expect(activateSpy).toHaveBeenCalled()
    expect(routerSpy).toHaveBeenCalledWith(['documents', documentResults[0].id])
  })

  it('should hand its documents to the list service when opening a document row', () => {
    jest.spyOn(documentService, 'listFiltered').mockReturnValue(
      of({
        all: [2, 3],
        count: 25,
        results: documentResults,
      })
    )
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)
    const activateSpy = jest
      .spyOn(documentListViewService, 'activateSavedViewWithDocuments')
      .mockImplementation(() => {})
    component.ngOnInit()
    fixture.detectChanges()
    fixture.debugElement
      .query(By.css('.rd-list-row'))
      .nativeElement.click()
    expect(activateSpy).toHaveBeenCalledWith(
      component.savedView,
      documentResults,
      25,
      20
    )
    expect(navigateSpy).toHaveBeenCalledWith(['documents', documentResults[0].id])
  })

  it('should fall back to the default dashboard page size', () => {
    component.savedView = { ...savedView, page_size: undefined }
    expect(component.pageSize).toEqual(DEFAULT_DASHBOARD_VIEW_PAGE_SIZE)
  })

  it('should navigate via quickfilter on click tag', () => {
    const qfSpy = jest.spyOn(documentListViewService, 'quickFilter')
    component.clickTag(11, new MouseEvent('click'))
    expect(qfSpy).toHaveBeenCalledWith([
      { rule_type: FILTER_HAS_TAGS_ALL, value: '11' },
    ])
    component.clickTag(11) // coverage
  })

  it('should navigate via quickfilter on click correspondent', () => {
    const qfSpy = jest.spyOn(documentListViewService, 'quickFilter')
    component.clickCorrespondent(11, new MouseEvent('click'))
    expect(qfSpy).toHaveBeenCalledWith([
      { rule_type: FILTER_CORRESPONDENT, value: '11' },
    ])
    component.clickCorrespondent(11) // coverage
  })

  it('should navigate via quickfilter on click doc type', () => {
    const qfSpy = jest.spyOn(documentListViewService, 'quickFilter')
    component.clickDocType(11, new MouseEvent('click'))
    expect(qfSpy).toHaveBeenCalledWith([
      { rule_type: FILTER_DOCUMENT_TYPE, value: '11' },
    ])
    component.clickDocType(11) // coverage
  })

  it('should navigate via quickfilter on click storage path', () => {
    const qfSpy = jest.spyOn(documentListViewService, 'quickFilter')
    component.clickStoragePath(11, new MouseEvent('click'))
    expect(qfSpy).toHaveBeenCalledWith([
      { rule_type: FILTER_STORAGE_PATH, value: '11' },
    ])
    component.clickStoragePath(11) // coverage
  })

  it('should navigate via quickfilter on click owner', () => {
    const qfSpy = jest.spyOn(documentListViewService, 'quickFilter')
    component.clickOwner(11, new MouseEvent('click'))
    expect(qfSpy).toHaveBeenCalledWith([
      { rule_type: FILTER_OWNER_ANY, value: '11' },
    ])
    component.clickOwner(11) // coverage
  })

  it('should navigate via quickfilter on click more like', () => {
    const qfSpy = jest.spyOn(documentListViewService, 'quickFilter')
    component.clickMoreLike(11)
    expect(qfSpy).toHaveBeenCalledWith([
      { rule_type: FILTER_FULLTEXT_MORELIKE, value: '11' },
    ])
  })
})
