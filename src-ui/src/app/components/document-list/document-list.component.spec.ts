import { DatePipe } from '@angular/common'
import {
  HttpErrorResponse,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { RouterTestingModule } from '@angular/router/testing'
import {
  NgbDropdown,
  NgbDropdownItem,
  NgbModal,
  NgbModalRef,
} from '@ng-bootstrap/ng-bootstrap'
import { provideUiTour } from 'ngx-ui-tour-ng-bootstrap'
import { Subject, of, throwError } from 'rxjs'
import { routes } from 'src/app/app-routing.module'
import {
  DEFAULT_DISPLAY_FIELDS,
  DisplayField,
  DisplayMode,
  Document,
} from 'src/app/data/document'
import {
  FILTER_DOES_NOT_HAVE_CORRESPONDENT,
  FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE,
  FILTER_FULLTEXT_MORELIKE,
  FILTER_FULLTEXT_QUERY,
  FILTER_HAS_CORRESPONDENT_ANY,
  FILTER_HAS_DOCUMENT_TYPE_ANY,
  FILTER_HAS_TAGS_ANY,
} from 'src/app/data/filter-rule-type'
import { SavedView } from 'src/app/data/saved-view'
import { SETTINGS_KEYS } from 'src/app/data/ui-settings'
import { SortableDirective } from 'src/app/directives/sortable.directive'
import { PermissionsGuard } from 'src/app/guards/permissions.guard'
import { CustomDatePipe } from 'src/app/pipes/custom-date.pipe'
import { DocumentTitlePipe } from 'src/app/pipes/document-title.pipe'
import { FilterPipe } from 'src/app/pipes/filter.pipe'
import { UsernamePipe } from 'src/app/pipes/username.pipe'
import { DocumentListViewService } from 'src/app/services/document-list-view.service'
import { PermissionsService } from 'src/app/services/permissions.service'
import { CorrespondentService } from 'src/app/services/rest/correspondent.service'
import { DocumentTypeService } from 'src/app/services/rest/document-type.service'
import { DocumentService } from 'src/app/services/rest/document.service'
import { SavedViewService } from 'src/app/services/rest/saved-view.service'
import { TagService } from 'src/app/services/rest/tag.service'
import { SettingsService } from 'src/app/services/settings.service'
import { ToastService } from 'src/app/services/toast.service'
import {
  FileStatus,
  WebsocketStatusService,
} from 'src/app/services/websocket-status.service'
import { DocumentCardLargeComponent } from './document-card-large/document-card-large.component'
import { DocumentCardSmallComponent } from './document-card-small/document-card-small.component'
import { DocumentListComponent } from './document-list.component'

const docs: Document[] = [
  {
    id: 1,
    title: 'Doc1',
    notes: [],
    tags: [],
    content: 'document content 1',
  },
  {
    id: 2,
    title: 'Doc2',
    notes: [],
    tags: [],
    content: 'document content 2',
  },
  {
    id: 3,
    title: 'Doc3',
    notes: [],
    tags: [],
    content: 'document content 3',
  },
]

describe('DocumentListComponent', () => {
  let component: DocumentListComponent
  let fixture: ComponentFixture<DocumentListComponent>
  let documentListService: DocumentListViewService
  let documentService: DocumentService
  let websocketStatusService: WebsocketStatusService
  let savedViewService: SavedViewService
  let router: Router
  let activatedRoute: ActivatedRoute
  let toastService: ToastService
  let modalService: NgbModal
  let settingsService: SettingsService
  let permissionService: PermissionsService

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes(routes), DocumentListComponent],
      providers: [
        FilterPipe,
        CustomDatePipe,
        DatePipe,
        DocumentTitlePipe,
        UsernamePipe,
        PermissionsGuard,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideUiTour(),
      ],
    }).compileComponents()

    documentListService = TestBed.inject(DocumentListViewService)
    documentService = TestBed.inject(DocumentService)
    websocketStatusService = TestBed.inject(WebsocketStatusService)
    savedViewService = TestBed.inject(SavedViewService)
    router = TestBed.inject(Router)
    activatedRoute = TestBed.inject(ActivatedRoute)
    toastService = TestBed.inject(ToastService)
    modalService = TestBed.inject(NgbModal)
    settingsService = TestBed.inject(SettingsService)
    permissionService = TestBed.inject(PermissionsService)
    fixture = TestBed.createComponent(DocumentListComponent)
    component = fixture.componentInstance
  })

  it('should reload on new document consumed', () => {
    const reloadSpy = jest.spyOn(documentListService, 'reload')
    const fileStatusSubject = new Subject<FileStatus>()
    jest
      .spyOn(websocketStatusService, 'onDocumentConsumptionFinished')
      .mockReturnValue(fileStatusSubject)
    fixture.detectChanges()
    fileStatusSubject.next(new FileStatus())
    expect(reloadSpy).toHaveBeenCalled()
  })

  it('should reload on document deleted', () => {
    const reloadSpy = jest.spyOn(documentListService, 'reload')
    const documentDeletedSubject = new Subject<boolean>()
    jest
      .spyOn(websocketStatusService, 'onDocumentDeleted')
      .mockReturnValue(documentDeletedSubject)
    fixture.detectChanges()
    documentDeletedSubject.next(true)
    expect(reloadSpy).toHaveBeenCalled()
  })

  it('should stop reloading on document deleted after destroy', () => {
    const reloadSpy = jest.spyOn(documentListService, 'reload')
    const documentDeletedSubject = new Subject<boolean>()
    jest
      .spyOn(websocketStatusService, 'onDocumentDeleted')
      .mockReturnValue(documentDeletedSubject)
    fixture.detectChanges()
    fixture.destroy()
    reloadSpy.mockClear()
    documentDeletedSubject.next(true)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('should show score sort fields on fulltext queries', () => {
    documentListService.setFilterRules([
      {
        rule_type: FILTER_HAS_TAGS_ANY,
        value: '10',
      },
    ])
    fixture.detectChanges()
    expect(component.getSortFields()).toEqual(documentListService.sortFields)

    documentListService.setFilterRules([
      {
        rule_type: FILTER_FULLTEXT_QUERY,
        value: 'foo',
      },
    ])
    fixture.detectChanges()
    expect(component.getSortFields()).toEqual(
      documentListService.sortFieldsFullText
    )
  })

  it('should not allow changing a saved view when none is active', () => {
    expect(component.activeSavedViewCanChange).toBeFalsy()
  })

  it('should determine if filtered, support reset', () => {
    fixture.detectChanges()
    documentListService.setFilterRules([
      {
        rule_type: FILTER_HAS_TAGS_ANY,
        value: '10',
      },
    ])
    documentListService.isReloading = false
    fixture.detectChanges()
    expect(component.isFiltered).toBeTruthy()
    expect(fixture.nativeElement.textContent.match(/Reset/g)).toHaveLength(2)
    component.resetFilters()
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent.match(/Reset/g)).toHaveLength(1)
  })

  it('should apply filter rule changes via list service', () => {
    const setFilterRulesSpy = jest.spyOn(documentListService, 'setFilterRules')
    const rules = [{ rule_type: FILTER_HAS_TAGS_ANY, value: '10' }]
    component.onFilterRulesChange(rules)
    expect(setFilterRulesSpy).toHaveBeenCalledWith(rules)
  })

  it('should reset filter rules to page one via list service', () => {
    const setFilterRulesSpy = jest.spyOn(documentListService, 'setFilterRules')
    const rules = [{ rule_type: FILTER_HAS_TAGS_ANY, value: '10' }]
    component.onFilterRulesReset(rules)
    expect(setFilterRulesSpy).toHaveBeenCalledWith(rules, true)
  })

  it('should load saved view from URL', () => {
    const view: SavedView = {
      id: 10,
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
    }
    const queryParams = { id: view.id.toString() }
    const getSavedViewSpy = jest.spyOn(savedViewService, 'getCached')
    const setCountSpy = jest.spyOn(savedViewService, 'setDocumentCount')
    jest.spyOn(documentService, 'listFiltered').mockReturnValue(
      of({
        results: docs,
        count: 3,
        all: docs.map((d) => d.id),
      })
    )
    getSavedViewSpy.mockReturnValue(of(view))
    const activateSavedViewSpy = jest.spyOn(
      documentListService,
      'activateSavedViewWithQueryParams'
    )
    activateSavedViewSpy.mockImplementation((view, params) => {})
    jest
      .spyOn(activatedRoute, 'paramMap', 'get')
      .mockReturnValue(of(convertToParamMap(queryParams)))
    activatedRoute.snapshot.queryParams = queryParams
    component.ngOnInit()
    expect(getSavedViewSpy).toHaveBeenCalledWith(view.id)
    expect(activateSavedViewSpy).toHaveBeenCalledWith(
      view,
      convertToParamMap(queryParams)
    )
    expect(setCountSpy).toHaveBeenCalledWith(view, 3)
  })

  it('should 404 on load saved view from URL if no view', () => {
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(null)) // e.g. no saved view found
    jest
      .spyOn(activatedRoute, 'paramMap', 'get')
      .mockReturnValue(of(convertToParamMap({ id: '10' })))
    const navigateSpy = jest.spyOn(router, 'navigate')
    fixture.detectChanges()
    expect(navigateSpy).toHaveBeenCalledWith(['404'], { replaceUrl: true })
  })

  it('should load saved view from query params', () => {
    const view: SavedView = {
      id: 10,
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
    }
    const getSavedViewSpy = jest.spyOn(savedViewService, 'getCached')
    getSavedViewSpy.mockReturnValue(of(view))
    jest
      .spyOn(activatedRoute, 'queryParamMap', 'get')
      .mockReturnValue(of(convertToParamMap({ view: view.id.toString() })))
    fixture.detectChanges()
    expect(getSavedViewSpy).toHaveBeenCalledWith(view.id)
  })

  it('should update saved view document count on load saved view from query params', () => {
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(
      of({
        id: 10,
        sort_field: 'added',
        sort_reverse: true,
        filter_rules: [],
      })
    )
    jest.spyOn(documentService, 'listFiltered').mockReturnValue(
      of({
        results: docs,
        count: 3,
        all: docs.map((d) => d.id),
      })
    )
    const setCountSpy = jest.spyOn(savedViewService, 'setDocumentCount')
    jest.spyOn(documentService, 'listFiltered').mockReturnValue(
      of({
        results: docs,
        count: 3,
        all: docs.map((d) => d.id),
      })
    )
    component.loadViewConfig(10)
    expect(setCountSpy).toHaveBeenCalledWith(expect.any(Object), 3)
  })

  it('should reset active saved view when loading unknown view config', () => {
    component['activeSavedView'] = { id: 1 } as SavedView
    const activateSpy = jest.spyOn(documentListService, 'activateSavedView')
    const reloadSpy = jest.spyOn(documentListService, 'reload')
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(null))

    component.loadViewConfig(10)

    expect(component['activeSavedView']).toBeNull()
    expect(activateSpy).not.toHaveBeenCalled()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('should support 3 different display modes', () => {
    jest.spyOn(documentListService, 'documents', 'get').mockReturnValue(docs)
    fixture.detectChanges()
    const displayModeButtons = fixture.debugElement.queryAll(
      By.css('input[type="radio"]')
    )
    expect(component.list.displayMode).toEqual('smallCards')

    displayModeButtons[0].nativeElement.checked = true
    displayModeButtons[0].triggerEventHandler('change')
    fixture.detectChanges()
    expect(component.list.displayMode).toEqual('table')
    expect(fixture.debugElement.queryAll(By.css('tr'))).toHaveLength(4)

    displayModeButtons[1].nativeElement.checked = true
    displayModeButtons[1].triggerEventHandler('change')
    fixture.detectChanges()
    expect(component.list.displayMode).toEqual('smallCards')
    expect(
      fixture.debugElement.queryAll(By.directive(DocumentCardSmallComponent))
    ).toHaveLength(3)

    displayModeButtons[2].nativeElement.checked = true
    displayModeButtons[2].triggerEventHandler('change')
    fixture.detectChanges()
    expect(component.list.displayMode).toEqual('largeCards')
    expect(
      fixture.debugElement.queryAll(By.directive(DocumentCardLargeComponent))
    ).toHaveLength(3)
  })

  it('should support setting sort field', () => {
    expect(documentListService.sortField).toEqual('created')
    fixture.detectChanges()
    const sortDropdown = fixture.debugElement.queryAll(
      By.directive(NgbDropdown)
    )[2]
    const asnSortFieldButton = sortDropdown.query(By.directive(NgbDropdownItem))

    asnSortFieldButton.triggerEventHandler('click')
    fixture.detectChanges()
    expect(documentListService.sortField).toEqual('archive_serial_number')
    documentListService.sortField = 'created'
  })

  it('should support setting sort field by table head', () => {
    component.activeDisplayFields = [DisplayField.ASN]
    jest.spyOn(documentListService, 'documents', 'get').mockReturnValue(docs)
    fixture.detectChanges()
    expect(documentListService.sortField).toEqual('created')

    const detailsDisplayModeButton = fixture.debugElement.query(
      By.css('input[type="radio"]')
    )
    detailsDisplayModeButton.nativeElement.checked = true
    detailsDisplayModeButton.triggerEventHandler('change')
    fixture.detectChanges()
    expect(component.list.displayMode).toEqual(DisplayMode.TABLE)

    const sortTh = fixture.debugElement.query(By.directive(SortableDirective))
    sortTh.triggerEventHandler('click')
    fixture.detectChanges()
    expect(documentListService.sortField).toEqual('archive_serial_number')
    documentListService.sortField = 'created'
    expect(documentListService.sortReverse).toBeFalsy()
    component.listSortReverse = true
    expect(documentListService.sortReverse).toBeTruthy()
  })

  it('should support select all, none, page & range', () => {
    jest.spyOn(documentListService, 'documents', 'get').mockReturnValue(docs)
    jest
      .spyOn(documentListService, 'collectionSize', 'get')
      .mockReturnValue(docs.length)
    fixture.detectChanges()
    expect(documentListService.selected.size).toEqual(0)
    const docCards = fixture.debugElement.queryAll(
      By.directive(DocumentCardLargeComponent)
    )
    const displayModeButtons = fixture.debugElement.queryAll(
      By.directive(NgbDropdownItem)
    )

    const selectAllSpy = jest.spyOn(documentListService, 'selectAll')
    displayModeButtons[2].triggerEventHandler('click')
    expect(selectAllSpy).toHaveBeenCalled()
    fixture.detectChanges()
    expect(documentListService.allSelected).toBeTruthy()
    expect(documentListService.selectedCount).toEqual(3)
    docCards.forEach((card) => {
      expect(card.context.selected).toBeTruthy()
    })

    const selectNoneSpy = jest.spyOn(documentListService, 'selectNone')
    displayModeButtons[0].triggerEventHandler('click')
    expect(selectNoneSpy).toHaveBeenCalled()
    fixture.detectChanges()
    expect(documentListService.selected.size).toEqual(0)
    docCards.forEach((card) => {
      expect(card.context.selected).toBeFalsy()
    })

    const selectPageSpy = jest.spyOn(documentListService, 'selectPage')
    displayModeButtons[1].triggerEventHandler('click')
    expect(selectPageSpy).toHaveBeenCalled()
    fixture.detectChanges()
    expect(documentListService.selected.size).toEqual(3)
    docCards.forEach((card) => {
      expect(card.context.selected).toBeTruthy()
    })

    component.toggleSelected(docs[0], new MouseEvent('click'))
    fixture.detectChanges()
    expect(documentListService.selected.size).toEqual(2)
    // reset
    displayModeButtons[0].triggerEventHandler('click')
    fixture.detectChanges()
    expect(documentListService.selected.size).toEqual(0)

    // select a range
    component.toggleSelected(docs[0], new MouseEvent('click'))
    component.toggleSelected(
      docs[2],
      new MouseEvent('click', { shiftKey: true })
    )
    fixture.detectChanges()
    expect(documentListService.selected.size).toEqual(3)
  })

  it('should support saving a view', () => {
    const view: SavedView = {
      id: 10,
      name: 'Saved View 10',
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
      display_mode: DisplayMode.SMALL_CARDS,
      display_fields: [DisplayField.TITLE],
    }
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(view))
    const queryParams = { view: view.id.toString() }
    jest
      .spyOn(activatedRoute, 'queryParamMap', 'get')
      .mockReturnValue(of(convertToParamMap(queryParams)))
    activatedRoute.snapshot.queryParams = queryParams
    router.routerState.snapshot.url = '/view/10/'
    fixture.detectChanges()
    expect(documentListService.activeSavedViewId).toEqual(10)

    const modifiedView = Object.assign({}, view)
    delete modifiedView.name
    const savedViewServicePatch = jest.spyOn(savedViewService, 'patch')
    savedViewServicePatch.mockReturnValue(of(modifiedView))
    const toastSpy = jest.spyOn(toastService, 'showSuccess')

    component.saveViewConfig()
    expect(savedViewServicePatch).toHaveBeenCalledWith(modifiedView)
    expect(toastSpy).toHaveBeenCalledWith(
      `View "${view.name}" saved successfully.`
    )
  })

  it('should handle error on view saving', () => {
    const view: SavedView = {
      id: 10,
      name: 'Saved View 10',
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
    }
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(view))
    const queryParams = { view: view.id.toString() }
    jest
      .spyOn(activatedRoute, 'queryParamMap', 'get')
      .mockReturnValue(of(convertToParamMap(queryParams)))
    activatedRoute.snapshot.queryParams = queryParams
    router.routerState.snapshot.url = '/view/10/'
    fixture.detectChanges()

    const toastErrorSpy = jest.spyOn(toastService, 'showError')
    jest
      .spyOn(savedViewService, 'patch')
      .mockReturnValueOnce(throwError(() => new Error('Error saving view')))
    component.saveViewConfig()
    expect(toastErrorSpy).toHaveBeenCalledWith(
      'Failed to save view "Saved View 10".',
      expect.any(Error)
    )
  })

  it('should not save a view without object change permissions', () => {
    const view: SavedView = {
      id: 10,
      name: 'Saved View 10',
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
      owner: 999,
      user_can_change: false,
    }
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(view))
    jest
      .spyOn(permissionService, 'currentUserHasObjectPermissions')
      .mockReturnValue(false)
    const queryParams = { view: view.id.toString() }
    jest
      .spyOn(activatedRoute, 'queryParamMap', 'get')
      .mockReturnValue(of(convertToParamMap(queryParams)))
    activatedRoute.snapshot.queryParams = queryParams
    router.routerState.snapshot.url = '/view/10/'
    fixture.detectChanges()

    const patchSpy = jest.spyOn(savedViewService, 'patch')

    component.saveViewConfig()

    expect(patchSpy).not.toHaveBeenCalled()
  })

  it('should support edited view saving as', () => {
    const view: SavedView = {
      id: 10,
      name: 'Saved View 10',
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
    }
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(view))
    const queryParams = { view: view.id.toString() }
    jest
      .spyOn(activatedRoute, 'queryParamMap', 'get')
      .mockReturnValue(of(convertToParamMap(queryParams)))
    activatedRoute.snapshot.queryParams = queryParams
    router.routerState.snapshot.url = '/view/10/'
    fixture.detectChanges()
    expect(documentListService.activeSavedViewId).toEqual(10)

    const modifiedView = Object.assign({}, view)
    modifiedView.name = 'Foo Bar'

    let openModal: NgbModalRef
    modalService.activeInstances.subscribe((modal) => (openModal = modal[0]))
    const modalSpy = jest.spyOn(modalService, 'open')
    const toastSpy = jest.spyOn(toastService, 'showSuccess')
    const savedViewServiceCreate = jest.spyOn(savedViewService, 'create')
    jest
      .spyOn(savedViewService, 'dashboardViews', 'get')
      .mockReturnValue([{ id: 77 } as SavedView])
    jest
      .spyOn(savedViewService, 'sidebarViews', 'get')
      .mockReturnValue([{ id: 88 } as SavedView])
    const updateVisibilitySpy = jest
      .spyOn(settingsService, 'updateSavedViewsVisibility')
      .mockReturnValue(of({ success: true }))
    savedViewServiceCreate.mockReturnValueOnce(of(modifiedView))
    component.saveViewConfigAs()

    const modalCloseSpy = jest.spyOn(openModal, 'close')
    const permissions = {
      owner: 5,
      set_permissions: {
        view: {
          users: [4],
          groups: [3],
        },
        change: {
          users: [2],
          groups: [1],
        },
      },
    }
    openModal.componentInstance.saveClicked.next({
      name: 'Foo Bar',
      showOnDashboard: true,
      showInSideBar: true,
      permissions_form: permissions,
    })
    expect(savedViewServiceCreate).toHaveBeenCalled()
    expect(savedViewServiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Foo Bar',
        owner: permissions.owner,
        set_permissions: permissions.set_permissions,
      })
    )
    expect(updateVisibilitySpy).toHaveBeenCalledWith(
      expect.arrayContaining([77, modifiedView.id]),
      expect.arrayContaining([88, modifiedView.id])
    )
    expect(modalSpy).toHaveBeenCalled()
    expect(toastSpy).toHaveBeenCalled()
    expect(modalCloseSpy).toHaveBeenCalled()
  })

  it('should show error when visibility update fails after creating a view', () => {
    const view: SavedView = {
      id: 10,
      name: 'Saved View 10',
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
    }
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(view))
    const queryParams = { view: view.id.toString() }
    jest
      .spyOn(activatedRoute, 'queryParamMap', 'get')
      .mockReturnValue(of(convertToParamMap(queryParams)))
    activatedRoute.snapshot.queryParams = queryParams
    router.routerState.snapshot.url = '/view/10/'
    fixture.detectChanges()

    let openModal: NgbModalRef
    modalService.activeInstances.subscribe((modal) => (openModal = modal[0]))
    jest
      .spyOn(savedViewService, 'create')
      .mockReturnValueOnce(of({ ...view, id: 42, name: 'Foo Bar' }))
    jest.spyOn(savedViewService, 'dashboardViews', 'get').mockReturnValue([])
    jest.spyOn(savedViewService, 'sidebarViews', 'get').mockReturnValue([])
    jest
      .spyOn(settingsService, 'updateSavedViewsVisibility')
      .mockReturnValueOnce(
        throwError(() => new Error('unable to save visibility settings'))
      )
    const toastErrorSpy = jest.spyOn(toastService, 'showError')

    component.saveViewConfigAs()

    const modalCloseSpy = jest.spyOn(openModal, 'close')
    openModal.componentInstance.saveClicked.next({
      name: 'Foo Bar',
      showOnDashboard: true,
      showInSideBar: false,
    })

    expect(modalCloseSpy).toHaveBeenCalled()
    expect(toastErrorSpy).toHaveBeenCalledWith(
      'View "Foo Bar" created successfully, but could not update visibility settings.',
      expect.any(Error)
    )
  })

  it('should handle error on edited view saving as', () => {
    const view: SavedView = {
      id: 10,
      name: 'Saved View 10',
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
    }
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(view))
    const queryParams = { view: view.id.toString() }
    jest
      .spyOn(activatedRoute, 'queryParamMap', 'get')
      .mockReturnValue(of(convertToParamMap(queryParams)))
    activatedRoute.snapshot.queryParams = queryParams
    router.routerState.snapshot.url = '/view/10/'
    fixture.detectChanges()
    expect(documentListService.activeSavedViewId).toEqual(10)

    const modifiedView = Object.assign({}, view)
    modifiedView.name = 'Foo Bar'

    let openModal: NgbModalRef
    modalService.activeInstances.subscribe((modal) => (openModal = modal[0]))
    const updateVisibilitySpy = jest.spyOn(
      settingsService,
      'updateSavedViewsVisibility'
    )
    jest.spyOn(savedViewService, 'create').mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            error: { filter_rules: [{ value: '11' }] },
          })
      )
    )
    component.saveViewConfigAs()

    openModal.componentInstance.saveClicked.next({
      name: 'Foo Bar',
      showOnDashboard: true,
      showInSideBar: true,
    })
    expect(updateVisibilitySpy).not.toHaveBeenCalled()
    expect(openModal.componentInstance.error()).toEqual({
      filter_rules: ['11'],
    })
  })

  it('should detect saved view changes', () => {
    const view: SavedView = {
      id: 10,
      name: 'Saved View 10',
      sort_field: 'added',
      sort_reverse: true,
      filter_rules: [
        {
          rule_type: FILTER_HAS_TAGS_ANY,
          value: '20',
        },
      ],
      page_size: 5,
      display_mode: DisplayMode.SMALL_CARDS,
      display_fields: [DisplayField.TITLE],
    }
    jest.spyOn(savedViewService, 'getCached').mockReturnValue(of(view))
    const queryParams = { view: view.id.toString() }
    jest
      .spyOn(activatedRoute, 'queryParamMap', 'get')
      .mockReturnValue(of(convertToParamMap(queryParams)))
    activatedRoute.snapshot.queryParams = queryParams
    router.routerState.snapshot.url = '/view/10/'
    fixture.detectChanges()
    expect(documentListService.activeSavedViewId).toEqual(10)

    component.list.displayFields = [DisplayField.ASN]
    expect(component.savedViewIsModified).toBeTruthy()
    component.list.displayFields = [DisplayField.TITLE]
    expect(component.savedViewIsModified).toBeFalsy()
    component.list.displayMode = DisplayMode.TABLE
    expect(component.savedViewIsModified).toBeTruthy()
    component.list.displayMode = DisplayMode.SMALL_CARDS
    expect(component.savedViewIsModified).toBeFalsy()
  })

  it('should navigate to a document', () => {
    fixture.detectChanges()
    const routerSpy = jest.spyOn(router, 'navigate')
    component.openDocumentDetail({ id: 99 })
    expect(routerSpy).toHaveBeenCalledWith(['documents', 99])
  })

  it('should hide columns if no perms or notes disabled', () => {
    permissionService.initialize([], { is_superuser: true } as any)
    jest.spyOn(documentListService, 'documents', 'get').mockReturnValue(docs)
    expect(documentListService.sortField).toEqual('created')

    component.list.displayMode = DisplayMode.TABLE
    component.list.displayFields = DEFAULT_DISPLAY_FIELDS.map((f) => f.id)
    fixture.detectChanges()

    expect(
      fixture.debugElement.queryAll(By.directive(SortableDirective))
    ).toHaveLength(10)

    expect(component.notesEnabled).toBeTruthy()
    settingsService.set(SETTINGS_KEYS.NOTES_ENABLED, false)
    fixture.detectChanges()
    expect(component.notesEnabled).toBeFalsy()
    expect(
      fixture.debugElement.queryAll(By.directive(SortableDirective))
    ).toHaveLength(9)

    // insufficient perms
    permissionService.initialize([], { is_superuser: false } as any)
    fixture.detectChanges()
    expect(
      fixture.debugElement.queryAll(By.directive(SortableDirective))
    ).toHaveLength(5)
  })

  it('should support toggle on document objects', () => {
    // TODO: this is just for coverage atm
    fixture.detectChanges()
    component.clickTag(1)
    component.clickCorrespondent(2)
    component.clickDocumentType(3)
    component.clickStoragePath(4)
  })

  it('should support quick filter on document more like', () => {
    fixture.detectChanges()
    const qfSpy = jest.spyOn(documentListService, 'quickFilter')
    component.clickMoreLike(99)
    expect(qfSpy).toHaveBeenCalledWith([
      { rule_type: FILTER_FULLTEXT_MORELIKE, value: '99' },
    ])
  })

  it('should support toggling display fields', () => {
    fixture.detectChanges()
    component.activeDisplayFields = [DisplayField.ASN]
    component.toggleDisplayField(DisplayField.TITLE)
    expect(component.activeDisplayFields).toEqual([
      DisplayField.ASN,
      DisplayField.TITLE,
    ])
    component.toggleDisplayField(DisplayField.ASN)
    expect(component.activeDisplayFields).toEqual([DisplayField.TITLE])
  })

  it('should get custom field title', () => {
    fixture.detectChanges()
    const mockDisplayFields = [
      { id: 'custom_field_1' as any, name: 'Custom Field 1' },
    ]
    settingsService.allDisplayFields = jest.fn(() => mockDisplayFields) as any
    expect(component.getDisplayCustomFieldTitle('custom_field_1')).toEqual(
      'Custom Field 1'
    )
  })

  it('should support hotkeys', () => {
    fixture.detectChanges()
    const resetSpy = jest.spyOn(component['filterEditor'], 'resetSelected')
    jest.spyOn(component, 'isFiltered', 'get').mockReturnValue(true)
    component.clickTag(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'escape' }))
    expect(resetSpy).toHaveBeenCalled()

    jest
      .spyOn(documentListService, 'selected', 'get')
      .mockReturnValue(new Set([1]))
    const clearSelectedSpy = jest.spyOn(documentListService, 'selectNone')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'escape' }))
    expect(clearSelectedSpy).toHaveBeenCalled()

    const selectAllSpy = jest.spyOn(documentListService, 'selectAll')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(selectAllSpy).toHaveBeenCalled()

    const selectPageSpy = jest.spyOn(documentListService, 'selectPage')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))
    expect(selectPageSpy).toHaveBeenCalled()

    jest.spyOn(documentListService, 'documents', 'get').mockReturnValue(docs)
    fixture.detectChanges()
    const detailSpy = jest.spyOn(component, 'openDocumentDetail')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }))
    expect(detailSpy).toHaveBeenCalledWith(docs[0])

    jest.spyOn(documentListService, 'documents', 'get').mockReturnValue(docs)
    jest
      .spyOn(documentListService, 'selected', 'get')
      .mockReturnValue(new Set([docs[1].id]))
    fixture.detectChanges()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }))
    expect(detailSpy).toHaveBeenCalledWith(docs[1].id)

    const lotsOfDocs: Document[] = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      title: `Doc${i + 1}`,
      notes: [],
      content: `document content ${i + 1}`,
    }))
    jest
      .spyOn(documentListService, 'documents', 'get')
      .mockReturnValue(lotsOfDocs)
    jest
      .spyOn(documentService, 'listAllFilteredIds')
      .mockReturnValue(of(lotsOfDocs.map((d) => d.id)))
    jest.spyOn(documentListService, 'getLastPage').mockReturnValue(4)
    fixture.detectChanges()

    expect(component.list.currentPage).toEqual(1)
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true })
    )
    expect(component.list.currentPage).toEqual(2)
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true })
    )
    expect(component.list.currentPage).toEqual(1)
  })
  it('should only request selection data while the advanced filters are shown', () => {
    const retainSpy = jest.spyOn(documentListService, 'retainSelectionData')
    const releaseSpy = jest.spyOn(documentListService, 'releaseSelectionData')
    fixture.detectChanges()
    expect(retainSpy).not.toHaveBeenCalled()
    expect(documentListService.selectionDataRequired).toBeFalsy()

    component.showAdvancedFilters.set(true)
    fixture.detectChanges()
    expect(retainSpy).toHaveBeenCalledTimes(1)
    expect(documentListService.selectionDataRequired).toBeTruthy()

    component.showAdvancedFilters.set(false)
    fixture.detectChanges()
    expect(releaseSpy).toHaveBeenCalledTimes(1)
    expect(documentListService.selectionDataRequired).toBeFalsy()

    component.showAdvancedFilters.set(true)
    fixture.detectChanges()
    expect(retainSpy).toHaveBeenCalledTimes(2)
    fixture.destroy()
    expect(releaseSpy).toHaveBeenCalledTimes(2)
    expect(documentListService.selectionDataRequired).toBeFalsy()
  })

  it('should memoize active quick filter ids while filter rules are unchanged', () => {
    jest.spyOn(documentListService, 'reload').mockImplementation(() => {})
    documentListService.setFilterRules([
      { rule_type: FILTER_HAS_DOCUMENT_TYPE_ANY, value: '3' },
      { rule_type: FILTER_HAS_CORRESPONDENT_ANY, value: '5' },
    ])
    const documentTypeIds = component.activeDocumentTypeFilterIds
    const correspondentIds = component.activeCorrespondentFilterIds
    expect(documentTypeIds).toEqual(new Set([3]))
    expect(correspondentIds).toEqual(new Set([5]))
    expect(component.activeDocumentTypeFilterIds).toBe(documentTypeIds)
    expect(component.activeCorrespondentFilterIds).toBe(correspondentIds)

    // unrelated list state change keeps the same instances
    documentListService.selectNone()
    expect(component.activeDocumentTypeFilterIds).toBe(documentTypeIds)
    expect(component.activeCorrespondentFilterIds).toBe(correspondentIds)

    documentListService.setFilterRules([
      { rule_type: FILTER_HAS_DOCUMENT_TYPE_ANY, value: '4' },
    ])
    expect(component.activeDocumentTypeFilterIds).toEqual(new Set([4]))
    expect(component.activeCorrespondentFilterIds.size).toEqual(0)
    expect(component.isQuickDocumentTypeActive(4)).toBeTruthy()
    expect(component.isQuickDocumentTypeActive(3)).toBeFalsy()
    expect(component.isQuickCorrespondentActive(5)).toBeFalsy()
  })

  it('should compute the hidden active correspondent only when it can change', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })
    const flushAnimationFrames = () =>
      rafCallbacks.splice(0).forEach((cb) => cb(0))
    jest.spyOn(documentListService, 'reload').mockImplementation(() => {})
    documentListService.setFilterRules([])

    fixture.detectChanges()
    component.allCorrespondents.set([
      { id: 1, name: 'Correspondent 1' },
      { id: 2, name: 'Correspondent 2' },
    ] as any)
    fixture.detectChanges()
    flushAnimationFrames()
    expect(component.hasHiddenActiveCorrespondent).toBeFalsy()

    // the active pill wrapped into the hidden second row
    const offsetTopSpy = jest
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockReturnValue(40)
    documentListService.setFilterRules([
      { rule_type: FILTER_HAS_CORRESPONDENT_ANY, value: '2' },
    ])
    fixture.detectChanges()
    flushAnimationFrames()
    expect(component.hasHiddenActiveCorrespondent).toBeTruthy()

    // reading the getter does not touch the DOM
    offsetTopSpy.mockClear()
    for (let i = 0; i < 5; i++) {
      expect(component.hasHiddenActiveCorrespondent).toBeTruthy()
    }
    expect(offsetTopSpy).not.toHaveBeenCalled()

    // expanded row shows all pills
    component.toggleCorrespondentsRowExpanded()
    fixture.detectChanges()
    expect(component.hasHiddenActiveCorrespondent).toBeFalsy()
    component.toggleCorrespondentsRowExpanded()
    fixture.detectChanges()
    flushAnimationFrames()
    expect(component.hasHiddenActiveCorrespondent).toBeTruthy()

    // clearing the filter resets it
    documentListService.setFilterRules([])
    fixture.detectChanges()
    expect(component.hasHiddenActiveCorrespondent).toBeFalsy()
    offsetTopSpy.mockRestore()
  })

  it('should refresh documents and clear taxonomy caches via refreshDocuments()', () => {
    permissionService.initialize([], { is_superuser: true } as any)
    const tagService = TestBed.inject(TagService)
    const correspondentService = TestBed.inject(CorrespondentService)
    const documentTypeService = TestBed.inject(DocumentTypeService)

    const tagClearSpy = jest.spyOn(tagService, 'clearCache')
    const corrClearSpy = jest.spyOn(correspondentService, 'clearCache')
    const dtClearSpy = jest.spyOn(documentTypeService, 'clearCache')
    jest
      .spyOn(tagService, 'listAll')
      .mockReturnValue(of({ count: 0, results: [] }))
    jest
      .spyOn(correspondentService, 'listAll')
      .mockReturnValue(of({ count: 0, results: [] }))
    jest
      .spyOn(documentTypeService, 'listAll')
      .mockReturnValue(of({ count: 0, results: [] }))

    let finishCallback: (() => void) | undefined
    const reloadSpy = jest
      .spyOn(documentListService, 'reload')
      .mockImplementation((onFinish?: () => void) => {
        finishCallback = onFinish
      })

    component.refreshDocuments()

    expect(component.isRefreshing()).toBeTruthy()
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(tagClearSpy).toHaveBeenCalledTimes(1)
    expect(corrClearSpy).toHaveBeenCalledTimes(1)
    expect(dtClearSpy).toHaveBeenCalledTimes(1)

    finishCallback?.()
    expect(component.isRefreshing()).toBeFalsy()
  })

  it('should clear isRefreshing when reload fails with an error', () => {
    jest
      .spyOn(documentService, 'listFiltered')
      .mockReturnValue(
        throwError(() => new HttpErrorResponse({ error: 'Network failure' }))
      )
    fixture.detectChanges()

    component.refreshDocuments()
    fixture.detectChanges()

    expect(documentListService.isReloading).toBeFalsy()
    expect(component.isRefreshing()).toBeFalsy()
  })

  it('should cycle document type and correspondent quick pills through Neutral -> Include -> Exclude -> Neutral', () => {
    jest.spyOn(documentListService, 'reload').mockImplementation(() => {})
    documentListService.setFilterRules([])

    // Document type tri-state cycle
    component.toggleQuickDocumentType(1)
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_HAS_DOCUMENT_TYPE_ANY, value: '1' },
    ])
    expect(component.isQuickDocumentTypeActive(1)).toBeTruthy()
    expect(component.isQuickDocumentTypeExcluded(1)).toBeFalsy()
    expect(component.hasQuickPillFilter).toBeTruthy()

    component.toggleQuickDocumentType(1)
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE, value: '1' },
    ])
    expect(component.isQuickDocumentTypeActive(1)).toBeFalsy()
    expect(component.isQuickDocumentTypeExcluded(1)).toBeTruthy()
    expect(component.hasQuickPillFilter).toBeTruthy()

    component.toggleQuickDocumentType(1)
    expect(documentListService.filterRules).toEqual([])
    expect(component.isQuickDocumentTypeActive(1)).toBeFalsy()
    expect(component.isQuickDocumentTypeExcluded(1)).toBeFalsy()
    expect(component.hasQuickPillFilter).toBeFalsy()

    // Correspondent tri-state cycle
    component.toggleQuickCorrespondent(7)
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_HAS_CORRESPONDENT_ANY, value: '7' },
    ])
    expect(component.isQuickCorrespondentActive(7)).toBeTruthy()
    expect(component.isQuickCorrespondentExcluded(7)).toBeFalsy()

    component.toggleQuickCorrespondent(7)
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_DOES_NOT_HAVE_CORRESPONDENT, value: '7' },
    ])
    expect(component.isQuickCorrespondentActive(7)).toBeFalsy()
    expect(component.isQuickCorrespondentExcluded(7)).toBeTruthy()

    component.toggleQuickCorrespondent(7)
    expect(documentListService.filterRules).toEqual([])
    expect(component.isQuickCorrespondentActive(7)).toBeFalsy()
    expect(component.isQuickCorrespondentExcluded(7)).toBeFalsy()
  })

  it('should support multi-exclude via Alt+Click, right-click, and follow-up clicks', () => {
    jest.spyOn(documentListService, 'reload').mockImplementation(() => {})
    documentListService.setFilterRules([])
    fixture.detectChanges()

    component.allDocumentTypes.set([
      { id: 1, name: 'Invoice' },
      { id: 2, name: 'Contract' },
      { id: 3, name: 'Letter' },
    ] as any)
    component.allCorrespondents.set([
      { id: 10, name: 'Acme' },
      { id: 11, name: 'Bank' },
    ] as any)
    fixture.detectChanges()

    documentListService.setFilterRules([
      { rule_type: FILTER_HAS_DOCUMENT_TYPE_ANY, value: '1' },
    ])

    // Alt+Click replaces include rule for document type with exclude rule
    component.toggleQuickDocumentType(2, new MouseEvent('click', { altKey: true }))
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE, value: '2' },
    ])

    // While excluded rules exist on the row, normal-clicking another pill adds it to exclude
    component.toggleQuickDocumentType(3)
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE, value: '2' },
      { rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE, value: '3' },
    ])

    // Right-click on correspondent pill excludes it without touching document type exclusions
    fixture.detectChanges()
    const corrButtons = fixture.debugElement.queryAll(
      By.css('.rd-filter-pill-correspondent')
    )
    const contextEvent = new MouseEvent('contextmenu', { cancelable: true })
    corrButtons[1].nativeElement.dispatchEvent(contextEvent)
    expect(contextEvent.defaultPrevented).toBeTruthy()
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE, value: '2' },
      { rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE, value: '3' },
      { rule_type: FILTER_DOES_NOT_HAVE_CORRESPONDENT, value: '11' },
    ])
  })

  it('should deactivate Alle pills when exclusions are active and clear excluded rules on reset', () => {
    jest.spyOn(documentListService, 'reload').mockImplementation(() => {})
    fixture.detectChanges()
    component.allDocumentTypes.set([{ id: 1, name: 'Invoice' }] as any)
    component.allCorrespondents.set([{ id: 10, name: 'Acme' }] as any)
    documentListService.setFilterRules([
      { rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE, value: '1' },
      { rule_type: FILTER_DOES_NOT_HAVE_CORRESPONDENT, value: '10' },
      { rule_type: FILTER_HAS_TAGS_ANY, value: '99' },
    ])
    fixture.detectChanges()

    const docTypeGroup = fixture.debugElement.query(
      By.css('[role="group"][aria-label="Dokumenttypen"]')
    )
    const allTypesButton = docTypeGroup.query(By.css('.rd-filter-pill'))
    expect(
      allTypesButton.nativeElement.classList.contains('is-active')
    ).toBeFalsy()
    expect(allTypesButton.nativeElement.getAttribute('aria-pressed')).toBe(
      'false'
    )

    const corrTrack = fixture.debugElement.query(By.css('.rd-correspondents-track'))
    const allCorrsButton = corrTrack.query(By.css('.rd-filter-pill'))
    expect(
      allCorrsButton.nativeElement.classList.contains('is-active')
    ).toBeFalsy()
    expect(allCorrsButton.nativeElement.getAttribute('aria-pressed')).toBe(
      'false'
    )

    // clearQuickDocumentTypes clears excluded document types only
    component.clearQuickDocumentTypes()
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_DOES_NOT_HAVE_CORRESPONDENT, value: '10' },
      { rule_type: FILTER_HAS_TAGS_ANY, value: '99' },
    ])
    fixture.detectChanges()
    expect(
      allTypesButton.nativeElement.classList.contains('is-active')
    ).toBeTruthy()
    expect(
      allCorrsButton.nativeElement.classList.contains('is-active')
    ).toBeFalsy()

    // clearQuickCorrespondents clears excluded correspondents only
    component.clearQuickCorrespondents()
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_HAS_TAGS_ANY, value: '99' },
    ])
    fixture.detectChanges()
    expect(
      allCorrsButton.nativeElement.classList.contains('is-active')
    ).toBeTruthy()

    // clearQuickPillFilters clears both document type and correspondent exclusions while preserving tags
    documentListService.setFilterRules([
      { rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE, value: '1' },
      { rule_type: FILTER_DOES_NOT_HAVE_CORRESPONDENT, value: '10' },
      { rule_type: FILTER_HAS_TAGS_ANY, value: '99' },
    ])
    component.clearQuickPillFilters()
    expect(documentListService.filterRules).toEqual([
      { rule_type: FILTER_HAS_TAGS_ANY, value: '99' },
    ])
  })

  it('should detect a hidden excluded correspondent in the collapsed row', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })
    const flushAnimationFrames = () =>
      rafCallbacks.splice(0).forEach((cb) => cb(0))
    jest.spyOn(documentListService, 'reload').mockImplementation(() => {})
    documentListService.setFilterRules([])

    fixture.detectChanges()
    component.allCorrespondents.set([
      { id: 1, name: 'Correspondent 1' },
      { id: 2, name: 'Correspondent 2' },
    ] as any)
    fixture.detectChanges()
    flushAnimationFrames()

    const offsetTopSpy = jest
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockReturnValue(40)
    documentListService.setFilterRules([
      { rule_type: FILTER_DOES_NOT_HAVE_CORRESPONDENT, value: '2' },
    ])
    fixture.detectChanges()
    flushAnimationFrames()
    expect(component.hasHiddenActiveCorrespondent).toBeTruthy()

    documentListService.setFilterRules([])
    fixture.detectChanges()
    expect(component.hasHiddenActiveCorrespondent).toBeFalsy()
    offsetTopSpy.mockRestore()
  })
})
