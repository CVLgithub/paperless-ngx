import { AsyncPipe, NgClass, NgTemplateOutlet } from '@angular/common'
import {
  Component,
  inject,
  OnDestroy,
  OnInit,
  QueryList,
  signal,
  ViewChild,
  ViewChildren,
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import {
  ActivatedRoute,
  convertToParamMap,
  Router,
  RouterModule,
} from '@angular/router'
import {
  NgbDropdownModule,
  NgbModal,
  NgbPaginationModule,
} from '@ng-bootstrap/ng-bootstrap'
import { TourNgBootstrap } from 'ngx-ui-tour-ng-bootstrap'
import {
  catchError,
  filter,
  first,
  map,
  of,
  Subject,
  switchMap,
  takeUntil,
} from 'rxjs'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { Correspondent } from 'src/app/data/correspondent'
import {
  DEFAULT_DISPLAY_FIELDS,
  DisplayField,
  DisplayMode,
  Document,
} from 'src/app/data/document'
import { DocumentType } from 'src/app/data/document-type'
import { FilterRule } from 'src/app/data/filter-rule'
import {
  FILTER_CORRESPONDENT,
  FILTER_DOCUMENT_TYPE,
  FILTER_FULLTEXT_MORELIKE,
  FILTER_HAS_TAGS_ALL,
  FILTER_IS_IN_INBOX,
} from 'src/app/data/filter-rule-type'
import { SavedView } from 'src/app/data/saved-view'
import { Tag } from 'src/app/data/tag'
import { SETTINGS_KEYS } from 'src/app/data/ui-settings'
import { IfPermissionsDirective } from 'src/app/directives/if-permissions.directive'
import {
  SortableDirective,
  SortEvent,
} from 'src/app/directives/sortable.directive'
import { CorrespondentNamePipe } from 'src/app/pipes/correspondent-name.pipe'
import { CustomDatePipe } from 'src/app/pipes/custom-date.pipe'
import { DocumentTitlePipe } from 'src/app/pipes/document-title.pipe'
import { DocumentTypeNamePipe } from 'src/app/pipes/document-type-name.pipe'
import { StoragePathNamePipe } from 'src/app/pipes/storage-path-name.pipe'
import { UsernamePipe } from 'src/app/pipes/username.pipe'
import { DocumentListViewService } from 'src/app/services/document-list-view.service'
import { HotKeyService } from 'src/app/services/hot-key.service'
import { OpenDocumentsService } from 'src/app/services/open-documents.service'
import {
  PermissionAction,
  PermissionsService,
  PermissionType,
} from 'src/app/services/permissions.service'
import { CorrespondentService } from 'src/app/services/rest/correspondent.service'
import { DocumentTypeService } from 'src/app/services/rest/document-type.service'
import { SavedViewService } from 'src/app/services/rest/saved-view.service'
import { TagService } from 'src/app/services/rest/tag.service'
import { SettingsService } from 'src/app/services/settings.service'
import { ToastService } from 'src/app/services/toast.service'
import { WebsocketStatusService } from 'src/app/services/websocket-status.service'
import {
  filterRulesDiffer,
  isFullTextFilterRule,
} from 'src/app/utils/filter-rules'
import { ClearableBadgeComponent } from '../common/clearable-badge/clearable-badge.component'
import { CustomFieldDisplayComponent } from '../common/custom-field-display/custom-field-display.component'
import { PageHeaderComponent } from '../common/page-header/page-header.component'
import { PreviewPopupComponent } from '../common/preview-popup/preview-popup.component'
import { TagComponent } from '../common/tag/tag.component'
import { RedesignDocumentCardComponent } from '../redesign/redesign-document-card/redesign-document-card.component'
import {
  DocumentTimeGroup,
  groupDocumentsByRecency,
} from '../redesign/redesign-document-groups'
import { RedesignDocumentListRowComponent } from '../redesign/redesign-document-list-row/redesign-document-list-row.component'
import { RedesignTopbarService } from '../redesign/redesign-topbar.service'
import { ComponentWithPermissions } from '../with-permissions/with-permissions.component'
import { BulkEditorComponent } from './bulk-editor/bulk-editor.component'
import { DocumentCardLargeComponent } from './document-card-large/document-card-large.component'
import { DocumentCardSmallComponent } from './document-card-small/document-card-small.component'
import { FilterEditorComponent } from './filter-editor/filter-editor.component'
import { SaveViewConfigDialogComponent } from './save-view-config-dialog/save-view-config-dialog.component'

const CORRESPONDENT_DOT_COLORS = [
  '#c92a2a',
  '#7c5a3c',
  '#1b7f4b',
  '#1c4e80',
  '#5c6670',
  '#7048e8',
  '#d9480f',
  '#0b7285',
]

@Component({
  selector: 'pngx-document-list',
  templateUrl: './document-list.component.html',
  styleUrls: ['./document-list.component.scss'],
  imports: [
    ClearableBadgeComponent,
    CustomFieldDisplayComponent,
    PageHeaderComponent,
    BulkEditorComponent,
    FilterEditorComponent,
    DocumentCardSmallComponent,
    DocumentCardLargeComponent,
    RedesignDocumentCardComponent,
    RedesignDocumentListRowComponent,
    PreviewPopupComponent,
    TagComponent,
    CustomDatePipe,
    DocumentTitlePipe,
    IfPermissionsDirective,
    SortableDirective,
    UsernamePipe,
    CorrespondentNamePipe,
    DocumentTypeNamePipe,
    StoragePathNamePipe,
    BootstrapIconComponent,
    AsyncPipe,
    FormsModule,
    ReactiveFormsModule,
    NgTemplateOutlet,
    NgbDropdownModule,
    NgbPaginationModule,
    NgClass,
    RouterModule,
    TourNgBootstrap,
  ],
})
export class DocumentListComponent
  extends ComponentWithPermissions
  implements OnInit, OnDestroy
{
  list = inject(DocumentListViewService)
  savedViewService = inject(SavedViewService)
  route = inject(ActivatedRoute)
  private router = inject(Router)
  private toastService = inject(ToastService)
  private modalService = inject(NgbModal)
  private websocketStatusService = inject(WebsocketStatusService)
  openDocumentsService = inject(OpenDocumentsService)
  settingsService = inject(SettingsService)
  private hotKeyService = inject(HotKeyService)
  permissionService = inject(PermissionsService)
  private readonly topbar = inject(RedesignTopbarService)
  private readonly tagService = inject(TagService)
  private readonly correspondentService = inject(CorrespondentService)
  private readonly documentTypeService = inject(DocumentTypeService)
  private readonly notesEnabledSetting =
    this.settingsService.getSignal<boolean>(SETTINGS_KEYS.NOTES_ENABLED)

  DisplayField = DisplayField
  DisplayMode = DisplayMode

  readonly selectionMode = signal(false)
  readonly showAdvancedFilters = signal(false)
  readonly allTags = signal<Tag[]>([])
  readonly allCorrespondents = signal<Correspondent[]>([])
  readonly allDocumentTypes = signal<DocumentType[]>([])

  tagMap: Map<number, Tag> = new Map()
  correspondentMap: Map<number, Correspondent> = new Map()
  documentTypeMap: Map<number, DocumentType> = new Map()

  @ViewChild('filterEditor')
  private filterEditor: FilterEditorComponent

  @ViewChildren(SortableDirective) headers: QueryList<SortableDirective>

  get activeDisplayFields(): DisplayField[] {
    return this.list.displayFields
  }

  set activeDisplayFields(fields: DisplayField[]) {
    this.list.displayFields = fields
    this.updateDisplayCustomFields()
  }
  activeDisplayCustomFields: Set<string> = new Set()

  public updateDisplayCustomFields() {
    this.activeDisplayCustomFields = new Set(
      Array.from(this.activeDisplayFields).filter(
        (field) =>
          typeof field === 'string' &&
          field.startsWith(DisplayField.CUSTOM_FIELD)
      )
    )
  }

  readonly unmodifiedFilterRules = signal<FilterRule[]>([])
  private unmodifiedSavedView: SavedView
  private activeSavedView: SavedView | null = null

  private unsubscribeNotifier: Subject<any> = new Subject()

  get savedViewIsModified(): boolean {
    if (
      !this.list.activeSavedViewId ||
      !this.unmodifiedSavedView ||
      !this.activeSavedViewCanChange
    ) {
      return false
    } else {
      return (
        this.unmodifiedSavedView.sort_field !== this.list.sortField ||
        this.unmodifiedSavedView.sort_reverse !== this.list.sortReverse ||
        (this.unmodifiedSavedView.page_size &&
          this.unmodifiedSavedView.page_size !== this.list.pageSize) ||
        (this.unmodifiedSavedView.display_mode &&
          this.unmodifiedSavedView.display_mode !== this.list.displayMode) ||
        // if the saved view has no display mode, we assume it's small cards
        (!this.unmodifiedSavedView.display_mode &&
          this.list.displayMode !== DisplayMode.SMALL_CARDS) ||
        (this.unmodifiedSavedView.display_fields &&
          this.unmodifiedSavedView.display_fields.join(',') !==
            this.activeDisplayFields.join(',')) ||
        (!this.unmodifiedSavedView.display_fields &&
          this.activeDisplayFields.join(',') !==
            DEFAULT_DISPLAY_FIELDS.filter((f) => f.id !== DisplayField.ADDED)
              .map((f) => f.id)
              .join(',')) ||
        filterRulesDiffer(
          this.unmodifiedSavedView.filter_rules,
          this.list.filterRules
        )
      )
    }
  }

  get activeSavedViewCanChange(): boolean {
    if (!this.activeSavedView) {
      return false
    }
    return this.permissionService.currentUserHasObjectPermissions(
      PermissionAction.Change,
      this.activeSavedView
    )
  }

  get isFiltered() {
    return !!this.filterEditor?.rulesModified || this.list.filterRules.length > 0
  }

  getTitle() {
    let title = this.list.activeSavedViewTitle
    if (title && this.savedViewIsModified) {
      title += '*'
    } else if (!title) {
      const rules = this.list.filterRules || []
      if (rules.length === 1) {
        const rule = rules[0]
        if (rule.rule_type === FILTER_IS_IN_INBOX && rule.value === 'true') {
          return $localize`Inbox`
        }
        if (rule.rule_type === FILTER_HAS_TAGS_ALL && rule.value) {
          const tag = this.tagMap.get(Number(rule.value))
          if (tag) return tag.name
        }
        if (rule.rule_type === FILTER_CORRESPONDENT && rule.value) {
          const corr = this.correspondentMap.get(Number(rule.value))
          if (corr) return corr.name
        }
        if (rule.rule_type === FILTER_DOCUMENT_TYPE && rule.value) {
          const dt = this.documentTypeMap.get(Number(rule.value))
          if (dt) return dt.name
        }
      }
      title = $localize`All Documents`
    }
    return title
  }

  get redesignDisplayMode(): 'grid' | 'list' {
    return this.list.displayMode === DisplayMode.TABLE ? 'list' : 'grid'
  }

  get documentGroups(): DocumentTimeGroup[] {
    return groupDocumentsByRecency(
      this.list.documents || [],
      this.list.sortField,
      !this.selectionMode() &&
        !this.list.hasSelection &&
        this.permissionService.currentUserCan(
          PermissionAction.Add,
          PermissionType.Document
        )
    )
  }

  get activeSortSegment(): 'date' | 'name' | 'type' {
    const field = this.list.sortField
    if (field === 'title') return 'name'
    if (field === 'document_type__name') return 'type'
    return 'date'
  }

  setSortSegment(segment: 'date' | 'name' | 'type'): void {
    const fieldMap: Record<'date' | 'name' | 'type', string> = {
      date: 'created',
      name: 'title',
      type: 'document_type__name',
    }
    const defaultReverse: Record<'date' | 'name' | 'type', boolean> = {
      date: true,
      name: false,
      type: false,
    }
    const targetField = fieldMap[segment]
    if (this.list.sortField === targetField) {
      this.list.setSort(targetField, !this.list.sortReverse)
    } else {
      this.list.setSort(targetField, defaultReverse[segment])
    }
  }

  get activeDocumentTypeFilterId(): number | null {
    const rule = (this.list.filterRules || []).find(
      (r) => r.rule_type === FILTER_DOCUMENT_TYPE && r.value
    )
    return rule ? Number(rule.value) : null
  }

  get activeCorrespondentFilterId(): number | null {
    const rule = (this.list.filterRules || []).find(
      (r) => r.rule_type === FILTER_CORRESPONDENT && r.value
    )
    return rule ? Number(rule.value) : null
  }

  get hasQuickPillFilter(): boolean {
    return (
      this.activeDocumentTypeFilterId !== null ||
      this.activeCorrespondentFilterId !== null
    )
  }

  clearQuickPillFilters(): void {
    const remaining = (this.list.filterRules || []).filter(
      (r) =>
        r.rule_type !== FILTER_DOCUMENT_TYPE &&
        r.rule_type !== FILTER_CORRESPONDENT
    )
    this.list.setFilterRules(remaining)
  }

  toggleQuickDocumentType(documentTypeId: number): void {
    const isActive = this.activeDocumentTypeFilterId === documentTypeId
    const withoutType = (this.list.filterRules || []).filter(
      (r) => r.rule_type !== FILTER_DOCUMENT_TYPE
    )
    if (isActive) {
      this.list.setFilterRules(withoutType)
    } else {
      this.list.setFilterRules([
        ...withoutType,
        {
          rule_type: FILTER_DOCUMENT_TYPE,
          value: documentTypeId.toString(),
        },
      ])
    }
  }

  toggleQuickCorrespondent(correspondentId: number): void {
    const isActive = this.activeCorrespondentFilterId === correspondentId
    const withoutCorr = (this.list.filterRules || []).filter(
      (r) => r.rule_type !== FILTER_CORRESPONDENT
    )
    if (isActive) {
      this.list.setFilterRules(withoutCorr)
    } else {
      this.list.setFilterRules([
        ...withoutCorr,
        {
          rule_type: FILTER_CORRESPONDENT,
          value: correspondentId.toString(),
        },
      ])
    }
  }

  getCorrespondentColor(id: number): string {
    return CORRESPONDENT_DOT_COLORS[Math.abs(id) % CORRESPONDENT_DOT_COLORS.length]
  }

  requestUpload(): void {
    this.topbar.requestUpload()
  }

  toggleSelectionMode(): void {
    const next = !this.selectionMode()
    this.selectionMode.set(next)
    if (!next && this.list.hasSelection) {
      this.list.selectNone()
    }
    this.syncTopbarConfig()
  }

  setRedesignDisplayMode(mode: 'grid' | 'list'): void {
    this.list.displayMode =
      mode === 'list' ? DisplayMode.TABLE : DisplayMode.SMALL_CARDS
    this.syncTopbarConfig()
  }

  private syncTopbarConfig(): void {
    this.topbar.setListConfig({
      displayMode: this.redesignDisplayMode,
      selectionMode: this.selectionMode() || this.list.hasSelection,
      canUpload: this.permissionService.currentUserCan(
        PermissionAction.Add,
        PermissionType.Document
      ),
      onSetDisplayMode: (mode) => this.setRedesignDisplayMode(mode),
      onToggleSelectionMode: () => this.toggleSelectionMode(),
    })
  }

  private loadTaxonomyLookups(): void {
    if (
      this.permissionService.currentUserCan(
        PermissionAction.View,
        PermissionType.Tag
      )
    ) {
      this.tagService
        .listAll()
        .pipe(
          first(),
          catchError(() => of({ results: [] as Tag[] }))
        )
        .subscribe((res) => {
          const items = res.results ?? []
          this.allTags.set(items)
          this.tagMap = new Map(items.map((t) => [t.id, t]))
        })
    }

    if (
      this.permissionService.currentUserCan(
        PermissionAction.View,
        PermissionType.Correspondent
      )
    ) {
      this.correspondentService
        .listAll()
        .pipe(
          first(),
          catchError(() => of({ results: [] as Correspondent[] }))
        )
        .subscribe((res) => {
          const items = res.results ?? []
          this.allCorrespondents.set(items)
          this.correspondentMap = new Map(items.map((c) => [c.id, c]))
        })
    }

    if (
      this.permissionService.currentUserCan(
        PermissionAction.View,
        PermissionType.DocumentType
      )
    ) {
      this.documentTypeService
        .listAll()
        .pipe(
          first(),
          catchError(() => of({ results: [] as DocumentType[] }))
        )
        .subscribe((res) => {
          const items = res.results ?? []
          this.allDocumentTypes.set(items)
          this.documentTypeMap = new Map(items.map((dt) => [dt.id, dt]))
        })
    }
  }

  getSortFields() {
    return isFullTextFilterRule(this.list.filterRules)
      ? this.list.sortFieldsFullText
      : this.list.sortFields
  }

  set listSortReverse(reverse: boolean) {
    this.list.sortReverse = reverse
  }

  get listSortReverse(): boolean {
    return this.list.sortReverse
  }

  onSort(event: SortEvent) {
    this.list.setSort(event.column, event.reverse)
  }

  onFilterRulesChange(filterRules: FilterRule[]) {
    this.list.setFilterRules(filterRules)
  }

  onFilterRulesReset(filterRules: FilterRule[]) {
    this.list.setFilterRules(filterRules, true)
  }

  get isBulkEditing(): boolean {
    return this.list.hasSelection
  }

  toggleDisplayField(field: DisplayField) {
    if (this.activeDisplayFields.includes(field)) {
      this.activeDisplayFields = this.activeDisplayFields.filter(
        (f) => f !== field
      )
    } else {
      this.activeDisplayFields = [...this.activeDisplayFields, field]
    }
    this.updateDisplayCustomFields()
  }

  public getDisplayCustomFieldTitle(field: string) {
    return this.settingsService.allDisplayFields().find((f) => f.id === field)
      ?.name
  }

  ngOnInit(): void {
    this.loadTaxonomyLookups()
    this.syncTopbarConfig()

    this.websocketStatusService
      .onDocumentConsumptionFinished()
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        this.list.reload()
        this.loadTaxonomyLookups()
      })

    this.websocketStatusService
      .onDocumentDeleted()
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        this.list.reload()
        this.loadTaxonomyLookups()
      })

    this.route.paramMap
      .pipe(
        filter((params) => params.has('id')), // only on saved view e.g. /view/id
        switchMap((params) => {
          return this.savedViewService
            .getCached(+params.get('id'))
            .pipe(map((view) => ({ view })))
        })
      )
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(({ view }) => {
        if (!view) {
          this.activeSavedView = null
          this.router.navigate(['404'], {
            replaceUrl: true,
          })
          return
        }
        this.activeSavedView = view
        this.unmodifiedSavedView = view
        this.list.activateSavedViewWithQueryParams(
          view,
          convertToParamMap(this.route.snapshot.queryParams)
        )
        this.list.reload(() => {
          this.savedViewService.setDocumentCount(view, this.list.collectionSize)
        })
        this.updateDisplayCustomFields()
        this.unmodifiedFilterRules.set(view.filter_rules)
        this.syncTopbarConfig()
      })

    this.route.queryParamMap
      .pipe(
        filter(() => !this.route.snapshot.paramMap.has('id')), // only when not on /view/id
        takeUntil(this.unsubscribeNotifier)
      )
      .subscribe((queryParams) => {
        this.updateDisplayCustomFields()
        if (queryParams.has('view')) {
          // loading a saved view on /documents
          this.loadViewConfig(parseInt(queryParams.get('view')))
        } else {
          this.activeSavedView = null
          this.list.activateSavedView(null)
          this.list.loadFromQueryParams(queryParams)
          this.unmodifiedFilterRules.set([])
        }
        this.syncTopbarConfig()
      })

    this.hotKeyService
      .addShortcut({
        keys: 'escape',
        description: $localize`Reset filters / selection`,
      })
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        if (this.list.hasSelection) {
          this.list.selectNone()
          this.selectionMode.set(false)
          this.syncTopbarConfig()
        } else if (this.selectionMode()) {
          this.selectionMode.set(false)
          this.syncTopbarConfig()
        } else if (this.isFiltered) {
          this.resetFilters()
        }
      })

    this.hotKeyService
      .addShortcut({ keys: 'a', description: $localize`Select all` })
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        this.list.selectAll()
        this.syncTopbarConfig()
      })

    this.hotKeyService
      .addShortcut({ keys: 'p', description: $localize`Select page` })
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        this.list.selectPage()
        this.syncTopbarConfig()
      })

    this.hotKeyService
      .addShortcut({
        keys: 'o',
        description: $localize`Open first [selected] document`,
      })
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        if (this.list.documents.length > 0) {
          if (this.list.hasSelection) {
            this.openDocumentDetail(Array.from(this.list.selected)[0])
          } else {
            this.openDocumentDetail(this.list.documents[0])
          }
        }
      })

    this.hotKeyService
      .addShortcut({
        keys: 'control.arrowleft',
        description: $localize`Previous page`,
      })
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        if (this.list.currentPage > 1) {
          this.list.currentPage--
        }
      })

    this.hotKeyService
      .addShortcut({
        keys: 'control.arrowright',
        description: $localize`Next page`,
      })
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        if (this.list.currentPage < this.list.getLastPage()) {
          this.list.currentPage++
        }
      })
  }

  ngOnDestroy() {
    this.topbar.reset()
    this.list.cancelPending()
    this.unsubscribeNotifier.next(this)
    this.unsubscribeNotifier.complete()
  }

  saveViewConfig() {
    if (this.list.activeSavedViewId != null && this.activeSavedViewCanChange) {
      let savedView: SavedView = {
        id: this.list.activeSavedViewId,
        filter_rules: this.list.filterRules,
        sort_field: this.list.sortField,
        sort_reverse: this.list.sortReverse,
        display_mode: this.list.displayMode,
        display_fields: this.activeDisplayFields,
      }
      const title = this.list.activeSavedViewTitle
      this.savedViewService
        .patch(savedView)
        .pipe(first())
        .subscribe({
          next: (view) => {
            this.activeSavedView = view
            this.unmodifiedSavedView = view
            this.toastService.showSuccess(
              $localize`View "${view.name ?? title}" saved successfully.`
            )
            this.unmodifiedFilterRules.set(this.list.filterRules)
          },
          error: (err) => {
            this.toastService.showError(
              $localize`Failed to save view "${title}".`,
              err
            )
          },
        })
    }
  }

  loadViewConfig(viewID: number) {
    this.savedViewService
      .getCached(viewID)
      .pipe(first())
      .subscribe((view) => {
        if (!view) {
          this.activeSavedView = null
          return
        }
        this.activeSavedView = view
        this.unmodifiedSavedView = view
        this.list.activateSavedView(view)
        this.list.reload(() => {
          this.savedViewService.setDocumentCount(view, this.list.collectionSize)
        })
      })
  }

  saveViewConfigAs() {
    let modal = this.modalService.open(SaveViewConfigDialogComponent, {
      backdrop: 'static',
    })
    modal.componentInstance.setDefaultName(
      this.filterEditor.generateFilterName()
    )
    modal.componentInstance.saveClicked.pipe(first()).subscribe((formValue) => {
      modal.componentInstance.buttonsEnabled.set(false)
      let savedView: SavedView = {
        name: formValue.name,
        icon: formValue.icon,
        filter_rules: this.list.filterRules,
        sort_reverse: this.list.sortReverse,
        sort_field: this.list.sortField,
        display_mode: this.list.displayMode,
        display_fields: this.activeDisplayFields,
      }
      const permissions = formValue.permissions_form
      if (permissions) {
        if (permissions.owner !== null && permissions.owner !== undefined) {
          savedView.owner = permissions.owner
        }
        if (permissions.set_permissions) {
          savedView['set_permissions'] = permissions.set_permissions
        }
      }

      this.savedViewService
        .create(savedView)
        .pipe(first())
        .subscribe({
          next: (createdView) => {
            this.saveCreatedViewVisibility(
              createdView,
              formValue.showOnDashboard,
              formValue.showInSideBar
            )
              .pipe(first())
              .subscribe({
                next: () => {
                  modal.close()
                  this.toastService.showSuccess(
                    $localize`View "${savedView.name}" created successfully.`
                  )
                },
                error: (error) => {
                  modal.close()
                  this.toastService.showError(
                    $localize`View "${savedView.name}" created successfully, but could not update visibility settings.`,
                    error
                  )
                },
              })
          },
          error: (httpError) => {
            let error = httpError.error
            if (error.filter_rules) {
              error.filter_rules = error.filter_rules.map((r) => r.value)
            }
            modal.componentInstance.error.set(error)
            modal.componentInstance.buttonsEnabled.set(true)
          },
        })
    })
  }

  private saveCreatedViewVisibility(
    createdView: SavedView,
    showOnDashboard: boolean,
    showInSideBar: boolean
  ) {
    const dashboardViewIds = this.savedViewService.dashboardViews.map(
      (v) => v.id
    )
    const sidebarViewIds = this.savedViewService.sidebarViews.map((v) => v.id)
    if (showOnDashboard) {
      dashboardViewIds.push(createdView.id)
    }
    if (showInSideBar) {
      sidebarViewIds.push(createdView.id)
    }

    return this.settingsService.updateSavedViewsVisibility(
      dashboardViewIds,
      sidebarViewIds
    )
  }

  openDocumentDetail(document: Document | number) {
    this.router.navigate([
      'documents',
      typeof document === 'number' ? document : document.id,
    ])
  }

  toggleSelected(document: Document, event: MouseEvent): void {
    if (!event.shiftKey) this.list.toggleSelected(document)
    else this.list.selectRangeTo(document)
    this.syncTopbarConfig()
  }

  clickTag(tagID: number) {
    this.list.selectNone()
    this.filterEditor.toggleTag(tagID)
  }

  clickCorrespondent(correspondentID: number) {
    this.list.selectNone()
    this.filterEditor.toggleCorrespondent(correspondentID)
  }

  clickDocumentType(documentTypeID: number) {
    this.list.selectNone()
    this.filterEditor.toggleDocumentType(documentTypeID)
  }

  clickStoragePath(storagePathID: number) {
    this.list.selectNone()
    this.filterEditor.toggleStoragePath(storagePathID)
  }

  clickMoreLike(documentID: number) {
    this.list.quickFilter([
      { rule_type: FILTER_FULLTEXT_MORELIKE, value: documentID.toString() },
    ])
  }

  get notesEnabled(): boolean {
    return this.notesEnabledSetting()
  }

  resetFilters() {
    this.filterEditor?.resetSelected()
    this.list.setFilterRules([], true)
  }
}
