import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop'
import { DatePipe } from '@angular/common'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { RouterTestingModule } from '@angular/router/testing'
import { NgbAlertModule } from '@ng-bootstrap/ng-bootstrap'
import {
  provideUiTour,
  TourNgBootstrap,
  TourService,
} from 'ngx-ui-tour-ng-bootstrap'
import { of, Subject, throwError } from 'rxjs'
import { SavedView } from 'src/app/data/saved-view'
import { SETTINGS_KEYS } from 'src/app/data/ui-settings'
import { IfPermissionsDirective } from 'src/app/directives/if-permissions.directive'
import { PermissionsGuard } from 'src/app/guards/permissions.guard'
import { PermissionsService } from 'src/app/services/permissions.service'
import { CorrespondentService } from 'src/app/services/rest/correspondent.service'
import { DocumentTypeService } from 'src/app/services/rest/document-type.service'
import { SavedViewService } from 'src/app/services/rest/saved-view.service'
import { TagService } from 'src/app/services/rest/tag.service'
import { SettingsService } from 'src/app/services/settings.service'
import { ToastService } from 'src/app/services/toast.service'
import { DashboardComponent } from './dashboard.component'
import { SavedViewWidgetComponent } from './widgets/saved-view-widget/saved-view-widget.component'
import { StatisticsWidgetComponent } from './widgets/statistics-widget/statistics-widget.component'
import { WidgetFrameComponent } from './widgets/widget-frame/widget-frame.component'

const saved_views = [
  {
    name: 'Saved View 0',
    id: 0,
    show_on_dashboard: true,
    show_in_sidebar: true,
    sort_field: 'name',
    sort_reverse: true,
    filter_rules: [],
  },
  {
    name: 'Saved View 1',
    id: 1,
    show_on_dashboard: false,
    show_in_sidebar: false,
    sort_field: 'name',
    sort_reverse: true,
    filter_rules: [],
  },
  {
    name: 'Saved View 2',
    id: 2,
    show_on_dashboard: true,
    show_in_sidebar: false,
    sort_field: 'name',
    sort_reverse: true,
    filter_rules: [],
  },
  {
    name: 'Saved View 3',
    id: 3,
    show_on_dashboard: true,
    show_in_sidebar: false,
    sort_field: 'name',
    sort_reverse: true,
    filter_rules: [],
  },
]

describe('DashboardComponent', () => {
  let component: DashboardComponent
  let fixture: ComponentFixture<DashboardComponent>
  let settingsService: SettingsService
  let tourService: TourService
  let toastService: ToastService

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [
        NgbAlertModule,
        RouterTestingModule,
        TourNgBootstrap,
        DragDropModule,
        DashboardComponent,
        StatisticsWidgetComponent,
        WidgetFrameComponent,
        IfPermissionsDirective,
        SavedViewWidgetComponent,
      ],
      providers: [
        DatePipe,
        PermissionsGuard,
        {
          provide: PermissionsService,
          useValue: {
            currentUserCan: () => true,
          },
        },
        {
          provide: SavedViewService,
          useValue: {
            listAll: () =>
              of({
                all: [saved_views.map((v) => v.id)],
                count: saved_views.length,
                results: saved_views,
              }),
            dashboardViews: saved_views.filter((v) => v.show_on_dashboard),
            allViews: saved_views,
            setDocumentCount: jest.fn(),
          },
        },
        {
          provide: TagService,
          useValue: {
            listAll: () =>
              of({
                all: [1],
                count: 1,
                results: [{ id: 1, name: 'Invoice', color: '#007aff' }],
              }),
          },
        },
        {
          provide: CorrespondentService,
          useValue: {
            listAll: () =>
              of({
                all: [2],
                count: 1,
                results: [{ id: 2, name: 'Acme Corp' }],
              }),
          },
        },
        {
          provide: DocumentTypeService,
          useValue: {
            listAll: () =>
              of({
                all: [3],
                count: 1,
                results: [{ id: 3, name: 'Receipt' }],
              }),
          },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideUiTour(),
      ],
    }).compileComponents()

    settingsService = TestBed.inject(SettingsService)
    settingsService.currentUser.set({
      first_name: 'Foo',
      last_name: 'Bar',
    })
    jest.spyOn(settingsService, 'get').mockImplementation((key) => {
      if (key === SETTINGS_KEYS.DASHBOARD_VIEWS_SORT_ORDER) return [0, 2, 3]
    })
    tourService = TestBed.inject(TourService)
    toastService = TestBed.inject(ToastService)
    fixture = TestBed.createComponent(DashboardComponent)
    component = fixture.componentInstance

    fixture.detectChanges()
  })

  it('should show a welcome message', () => {
    expect(component.subtitle).toEqual(`Hello Foo, welcome to Paperless-ngx`)
    settingsService.currentUser.set({
      id: 1,
    })
    expect(component.subtitle).toEqual(`Welcome to Paperless-ngx`)
  })

  it('should show dashboard widgets and pass taxonomy lookup maps', () => {
    const widgetDebugElements = fixture.debugElement.queryAll(
      By.directive(SavedViewWidgetComponent)
    )
    expect(widgetDebugElements).toHaveLength(
      saved_views.filter((v) => v.show_on_dashboard).length
    )

    const firstWidget = widgetDebugElements[0]
      .componentInstance as SavedViewWidgetComponent
    expect(firstWidget.tagMap().get(1)?.name).toEqual('Invoice')
    expect(firstWidget.correspondentMap().get(2)?.name).toEqual('Acme Corp')
    expect(firstWidget.documentTypeMap().get(3)?.name).toEqual('Receipt')
  })

  it('should end tour service if still running and welcome widget dismissed', () => {
    jest.spyOn(tourService, 'getStatus').mockReturnValueOnce(1)
    const endSpy = jest.spyOn(tourService, 'end')
    component.completeTour()
    expect(endSpy).toHaveBeenCalled()
  })

  it('should save tour completion if it was stopped and welcome widget dismissed', () => {
    jest.spyOn(tourService, 'getStatus').mockReturnValueOnce(0)
    const settingsCompleteTourSpy = jest.spyOn(settingsService, 'completeTour')
    component.completeTour()
    expect(settingsCompleteTourSpy).toHaveBeenCalled()
  })

  it('should disable global dropzone on start drag + drop, re-enable after', () => {
    expect(settingsService.globalDropzoneEnabled()).toBeTruthy()
    component.onDragStart(null)
    expect(settingsService.globalDropzoneEnabled()).toBeFalsy()
    component.onDragEnd(null)
    expect(settingsService.globalDropzoneEnabled()).toBeTruthy()
  })

  it('should update saved view sorting on drag + drop, show info', () => {
    const settingsSpy = jest.spyOn(settingsService, 'updateDashboardViewsSort')
    const toastSpy = jest.spyOn(toastService, 'showSuccess')
    jest.spyOn(settingsService, 'storeSettings').mockReturnValue(of(true))
    component.onDrop({ previousIndex: 0, currentIndex: 1 } as CdkDragDrop<
      SavedView[]
    >)
    expect(settingsSpy).toHaveBeenCalledWith([
      saved_views[2],
      saved_views[0],
      saved_views[3],
    ])
    expect(toastSpy).toHaveBeenCalled()
  })

  it('should update saved view sorting on drag + drop, show error', () => {
    jest.spyOn(settingsService, 'get').mockImplementation((key) => {
      if (key === SETTINGS_KEYS.DASHBOARD_VIEWS_SORT_ORDER) return []
    })
    fixture.destroy()
    fixture = TestBed.createComponent(DashboardComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
    const toastSpy = jest.spyOn(toastService, 'showError')
    jest
      .spyOn(settingsService, 'storeSettings')
      .mockReturnValue(throwError(() => new Error('unable to save')))
    component.onDrop({ previousIndex: 0, currentIndex: 2 } as CdkDragDrop<
      SavedView[]
    >)
    expect(toastSpy).toHaveBeenCalled()
  })

  it('should refresh views, taxonomy lookups, statistics, and saved view widgets', () => {
    const savedViewService = TestBed.inject(SavedViewService)
    const tagService = TestBed.inject(TagService)
    const correspondentService = TestBed.inject(CorrespondentService)
    const documentTypeService = TestBed.inject(DocumentTypeService)

    const refreshSubject = new Subject<any>()
    const savedViewsSpy = jest
      .spyOn(savedViewService, 'listAll')
      .mockReturnValue(refreshSubject.asObservable())
    const tagSpy = jest.spyOn(tagService, 'listAll')
    const correspondentSpy = jest.spyOn(correspondentService, 'listAll')
    const documentTypeSpy = jest.spyOn(documentTypeService, 'listAll')

    const statsWidget = component.statisticsWidget()
    expect(statsWidget).toBeDefined()
    const statsReloadSpy = jest.spyOn(statsWidget, 'reload')

    const viewWidgets = component.savedViewWidgets()
    expect(viewWidgets).toHaveLength(
      saved_views.filter((v) => v.show_on_dashboard).length
    )
    const viewReloadSpies = viewWidgets.map((w) => jest.spyOn(w, 'reload'))

    const refreshButton = fixture.debugElement.query(
      By.css('button.rd-icon-control')
    )
    expect(refreshButton).not.toBeNull()

    refreshButton.nativeElement.click()
    fixture.detectChanges()

    expect(component.isRefreshing()).toBe(true)
    expect(refreshButton.nativeElement.disabled).toBe(true)
    expect(refreshButton.nativeElement.classList).toContain('is-refreshing')
    expect(savedViewsSpy).toHaveBeenCalledTimes(1)
    expect(tagSpy).toHaveBeenCalledTimes(1)
    expect(correspondentSpy).toHaveBeenCalledTimes(1)
    expect(documentTypeSpy).toHaveBeenCalledTimes(1)
    expect(statsReloadSpy).toHaveBeenCalledTimes(1)
    for (const spy of viewReloadSpies) {
      expect(spy).toHaveBeenCalledTimes(1)
    }

    // Re-entrant call while refreshing should be ignored
    component.refreshDashboard()
    expect(savedViewsSpy).toHaveBeenCalledTimes(1)

    refreshSubject.next({
      all: saved_views.map((v) => v.id),
      count: saved_views.length,
      results: saved_views,
    })
    refreshSubject.complete()
    fixture.detectChanges()

    expect(component.isRefreshing()).toBe(false)
    expect(refreshButton.nativeElement.disabled).toBe(false)
    expect(refreshButton.nativeElement.classList).not.toContain('is-refreshing')
  })
})
