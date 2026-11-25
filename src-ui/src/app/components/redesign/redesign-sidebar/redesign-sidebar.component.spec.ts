import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'
import { of, Subject } from 'rxjs'
import { SavedView } from 'src/app/data/saved-view'
import { SETTINGS_KEYS, SidebarSectionID } from 'src/app/data/ui-settings'
import { DocumentListViewService } from 'src/app/services/document-list-view.service'
import { PermissionsService } from 'src/app/services/permissions.service'
import { CorrespondentService } from 'src/app/services/rest/correspondent.service'
import { DocumentTypeService } from 'src/app/services/rest/document-type.service'
import { SavedViewService } from 'src/app/services/rest/saved-view.service'
import { TagService } from 'src/app/services/rest/tag.service'
import { SettingsService } from 'src/app/services/settings.service'
import { TasksService } from 'src/app/services/tasks.service'
import { WebsocketStatusService } from 'src/app/services/websocket-status.service'
import { RedesignSidebarComponent } from './redesign-sidebar.component'

describe('RedesignSidebarComponent', () => {
  let fixture: ComponentFixture<RedesignSidebarComponent>
  let component: RedesignSidebarComponent

  const mockViews: SavedView[] = [
    {
      id: 1,
      name: 'Heute',
      icon: 'bookmark',
      show_in_sidebar: true,
      sort_field: 'created',
      sort_reverse: true,
      filter_rules: [],
    },
    {
      id: 2,
      name: 'Rechnungen',
      icon: 'funnel',
      show_in_sidebar: true,
      sort_field: 'created',
      sort_reverse: true,
      filter_rules: [],
    },
  ]

  const counts = new Map<number, number>([
    [1, 3],
    [2, 12],
  ])

  beforeEach(async () => {
    const noop$ = new Subject<void>()

    await TestBed.configureTestingModule({
      imports: [RedesignSidebarComponent],
      providers: [
        provideRouter([]),
        {
          provide: DocumentListViewService,
          useValue: {
            activeSavedViewId: null,
            filterRules: [],
            quickFilter: jest.fn(),
          },
        },
        {
          provide: SavedViewService,
          useValue: {
            sidebarViews: mockViews,
            getDocumentCount: (view: SavedView) => counts.get(view.id),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            currentUser: signal({ first_name: 'Test', last_name: 'User' }),
            displayName: 'Test User',
            getSignal: (key: string) => {
              if (key === SETTINGS_KEYS.SIDEBAR_SECTION_ORDER) {
                return signal([
                  SidebarSectionID.SavedViews,
                  SidebarSectionID.Tags,
                  SidebarSectionID.Correspondents,
                  SidebarSectionID.DocumentTypes,
                ])
              }
              return signal(false)
            },
            set: jest.fn(),
            updateAppearanceSettings: jest.fn(),
            storeSettings: jest.fn(() => of({})),
          },
        },
        {
          provide: PermissionsService,
          useValue: {
            currentUserCan: () => true,
            isAdmin: () => false,
          },
        },
        {
          provide: TasksService,
          useValue: {
            needsAttentionTasksCount: 0,
          },
        },
        {
          provide: TagService,
          useValue: {
            clearCache: jest.fn(),
            listAll: () => of({ results: [] }),
          },
        },
        {
          provide: CorrespondentService,
          useValue: {
            clearCache: jest.fn(),
            listAll: () => of({ results: [] }),
          },
        },
        {
          provide: DocumentTypeService,
          useValue: {
            clearCache: jest.fn(),
            listAll: () => of({ results: [] }),
          },
        },
        {
          provide: WebsocketStatusService,
          useValue: {
            onDocumentConsumptionFinished: () => noop$.asObservable(),
            onDocumentUpdated: () => noop$.asObservable(),
            onDocumentDeleted: () => noop$.asObservable(),
          },
        },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(RedesignSidebarComponent)
    component = fixture.componentInstance
  })

  it('keeps saved views interactive and sets tooltips/aria-labels when collapsed while hiding taxonomy sections', () => {
    component.collapsed = true
    fixture.detectChanges()

    const savedViewsSection = fixture.debugElement.query(
      By.css('.rd-sidebar__section--saved-views')
    )
    expect(savedViewsSection).not.toBeNull()
    expect(savedViewsSection.nativeElement.closest('[inert]')).toBeNull()

    const savedViewLinks = fixture.debugElement.queryAll(
      By.css('a.rd-nav-item--saved-view')
    )
    expect(savedViewLinks).toHaveLength(2)
    expect(savedViewLinks[0].nativeElement.getAttribute('aria-label')).toBe(
      'Heute (3)'
    )
    expect(savedViewLinks[1].nativeElement.getAttribute('aria-label')).toBe(
      'Rechnungen (12)'
    )

    const labelClip = fixture.debugElement.query(
      By.css('.rd-sidebar__section-label-clip')
    )
    expect(labelClip.nativeElement.getAttribute('aria-hidden')).toBe('true')

    const taxonomyClips = fixture.debugElement.queryAll(
      By.css('.rd-sidebar__section-clip')
    )
    expect(taxonomyClips).toHaveLength(3)
    taxonomyClips.forEach((clip) => {
      expect(clip.nativeElement.getAttribute('aria-hidden')).toBe('true')
      expect(clip.nativeElement.hasAttribute('inert')).toBe(true)
    })
  })

  it('omits collapsed aria-label and restores taxonomy sections when expanded', () => {
    component.collapsed = false
    fixture.detectChanges()

    const savedViewLinks = fixture.debugElement.queryAll(
      By.css('a.rd-nav-item--saved-view')
    )
    expect(savedViewLinks).toHaveLength(2)
    expect(savedViewLinks[0].nativeElement.getAttribute('aria-label')).toBeNull()

    const taxonomyClips = fixture.debugElement.queryAll(
      By.css('.rd-sidebar__section-clip')
    )
    expect(taxonomyClips).toHaveLength(3)
    taxonomyClips.forEach((clip) => {
      expect(clip.nativeElement.getAttribute('aria-hidden')).toBeNull()
      expect(clip.nativeElement.hasAttribute('inert')).toBe(false)
    })
  })
})
