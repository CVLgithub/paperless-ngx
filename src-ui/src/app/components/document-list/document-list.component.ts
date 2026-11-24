import { AsyncPipe, NgClass, NgTemplateOutlet } from '@angular/common'
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  QueryList,
  signal,
  untracked,
  ViewChild,
  viewChild,
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
  FILTER_DOES_NOT_HAVE_CORRESPONDENT,
  FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE,
  FILTER_FULLTEXT_MORELIKE,
  FILTER_HAS_CORRESPONDENT_ANY,
  FILTER_HAS_DOCUMENT_TYPE_ANY,
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

function collectFilterRuleIds(
  rules: FilterRule[],
  ruleTypes: number[]
): Set<number> {
  const ids = new Set<number>()
  for (const rule of rules || []) {
    if (
      ruleTypes.includes(rule.rule_type) &&
      rule.value !== null &&
      rule.value !== ''
    ) {
      const parsed = Number(rule.value)
      if (Number.isFinite(parsed) && parsed > 0) {
        ids.add(parsed)
      }
    }
  }
  return ids
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

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
  private readonly ngZone = inject(NgZone)
  private readonly tagService = inject(TagService)
  private readonly correspondentService = inject(CorrespondentService)
  private readonly documentTypeService = inject(DocumentTypeService)
  private readonly notesEnabledSetting =
    this.settingsService.getSignal<boolean>(SETTINGS_KEYS.NOTES_ENABLED)

  DisplayField = DisplayField
  DisplayMode = DisplayMode

  readonly selectionMode = signal(false)
  readonly showAdvancedFilters = signal(false)
  readonly isRefreshing = signal(false)
  readonly quickFilterExcludeMode = signal(false)

  /**
   * Ensure manual refresh state settles even if a reload fails or is superseded
   * without invoking its onFinish callback.
   */
  private readonly refreshSettlementEffect = effect(() => {
    void this.list.activeSavedViewId
    if (this.isRefreshing() && !this.list.isReloading) {
      this.isRefreshing.set(false)
    }
  })

  /**
   * Selection data (document counts) is only consumed by the filter editor in
   * the advanced filter panel, so only request it from the backend while the
   * panel is open.
   */
  private readonly selectionDataDemandEffect = effect((onCleanup) => {
    if (!this.showAdvancedFilters()) {
      return
    }
    untracked(() => this.list.retainSelectionData())
    onCleanup(() => this.list.releaseSelectionData())
  })
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
        if (
          (rule.rule_type === FILTER_CORRESPONDENT ||
            rule.rule_type === FILTER_HAS_CORRESPONDENT_ANY) &&
          rule.value
        ) {
          const corr = this.correspondentMap.get(Number(rule.value))
          if (corr) return corr.name
        }
        if (
          (rule.rule_type === FILTER_DOCUMENT_TYPE ||
            rule.rule_type === FILTER_HAS_DOCUMENT_TYPE_ANY) &&
          rule.value
        ) {
          const dt = this.documentTypeMap.get(Number(rule.value))
          if (dt) return dt.name
        }
      }
      title = $localize`Alle Dokumente`
    }
    return title
  }

  get redesignDisplayMode(): 'grid' | 'list' {
    return this.list.displayMode === DisplayMode.TABLE ? 'list' : 'grid'
  }

  private cachedDocGroups: DocumentTimeGroup[] = []
  private cachedDocGroupsKey: {
    documents: Document[] | null
    length: number
    firstId: number | undefined
    lastId: number | undefined
    sortField: string
  } | null = null

  get documentGroups(): DocumentTimeGroup[] {
    const documents = this.list.documents || []
    const sortField = this.list.sortField
    const length = documents.length
    const firstId = documents[0]?.id
    const lastId = documents[length - 1]?.id

    if (
      this.cachedDocGroupsKey &&
      this.cachedDocGroupsKey.documents === documents &&
      this.cachedDocGroupsKey.length === length &&
      this.cachedDocGroupsKey.firstId === firstId &&
      this.cachedDocGroupsKey.lastId === lastId &&
      this.cachedDocGroupsKey.sortField === sortField
    ) {
      return this.cachedDocGroups
    }

    this.cachedDocGroups = groupDocumentsByRecency(
      documents,
      sortField,
      false
    ).filter((group) => group.documents.length > 0)
    this.cachedDocGroupsKey = {
      documents,
      length,
      firstId,
      lastId,
      sortField,
    }
    return this.cachedDocGroups
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

  private readonly correspondentsTrack =
    viewChild<ElementRef<HTMLElement>>('correspondentsTrack')

  readonly correspondentsRowExpanded = signal(false)
  readonly correspondentsHasOverflow = signal(false)
  readonly correspondentsExpandedHeight = signal(29)
  private correspondentsResizing = false
  private readonly hiddenActiveCorrespondent = signal(false)

  private measureHiddenActiveCorrespondent(
    trackEl: HTMLElement,
    isExpanded: boolean
  ): boolean {
    if (
      isExpanded ||
      (this.activeCorrespondentFilterIds.size === 0 &&
        this.excludedCorrespondentFilterIds.size === 0)
    ) {
      return false
    }
    const activeButtons = trackEl.querySelectorAll<HTMLElement>(
      '.rd-filter-pill-correspondent.is-active, .rd-filter-pill-correspondent.is-excluded'
    )
    return Array.from(activeButtons).some((btn) => btn.offsetTop >= 30)
  }

  /**
   * Re-measures whether an active or excluded correspondent pill is hidden in
   * the collapsed row whenever the active/excluded correspondents, the
   * expanded state or the pills change. Measuring reads layout, so it runs
   * once after the DOM has been updated instead of on every change detection
   * pass.
   */
  private readonly hiddenActiveCorrespondentEffect = effect((onCleanup) => {
    const trackEl = this.correspondentsTrack()?.nativeElement
    const isExpanded = this.correspondentsRowExpanded()
    const activeIds = this.activeCorrespondentFilterIdsSignal()
    const excludedIds = this.excludedCorrespondentFilterIdsSignal()
    this.allCorrespondents()

    if (
      !trackEl ||
      isExpanded ||
      (activeIds.size === 0 && excludedIds.size === 0)
    ) {
      this.hiddenActiveCorrespondent.set(false)
      return
    }

    const measure = () => {
      if (this.correspondentsResizing) {
        // the resize observer measures once resizing settled
        return
      }
      this.hiddenActiveCorrespondent.set(
        this.measureHiddenActiveCorrespondent(
          trackEl,
          untracked(() => this.correspondentsRowExpanded())
        )
      )
    }

    if (typeof requestAnimationFrame === 'function') {
      const rafId = requestAnimationFrame(() => untracked(measure))
      onCleanup(() => {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(rafId)
        }
      })
    } else {
      const timerId = setTimeout(() => untracked(measure))
      onCleanup(() => clearTimeout(timerId))
    }
  })

  private readonly correspondentsLayoutEffect = effect((onCleanup) => {
    const trackEl = this.correspondentsTrack()?.nativeElement
    this.allCorrespondents()
    if (!trackEl) {
      this.correspondentsHasOverflow.set(false)
      this.correspondentsExpandedHeight.set(29)
      this.hiddenActiveCorrespondent.set(false)
      return
    }

    const computeHiddenActive = (isExpanded: boolean): boolean =>
      untracked(() =>
        this.measureHiddenActiveCorrespondent(trackEl, isExpanded)
      )

    const applyMeasurement = () => {
      const fullHeight = Math.max(29, Math.ceil(trackEl.scrollHeight))
      const hasOverflow = fullHeight > 34
      const wasExpanded = untracked(() => this.correspondentsRowExpanded())
      const shouldCollapse = !hasOverflow && wasExpanded
      const nextExpanded = shouldCollapse ? false : wasExpanded
      const hiddenActive = computeHiddenActive(nextExpanded)
      const changed =
        fullHeight !== untracked(() => this.correspondentsExpandedHeight()) ||
        hasOverflow !== untracked(() => this.correspondentsHasOverflow()) ||
        shouldCollapse ||
        hiddenActive !== untracked(() => this.hiddenActiveCorrespondent())

      this.correspondentsResizing = false

      if (!changed) {
        return
      }

      this.ngZone.run(() => {
        this.hiddenActiveCorrespondent.set(hiddenActive)
        this.correspondentsExpandedHeight.set(fullHeight)
        this.correspondentsHasOverflow.set(hasOverflow)
        if (shouldCollapse) {
          this.correspondentsRowExpanded.set(false)
        }
      })
    }

    let initRafId: number | null = null
    let settleTimerId: ReturnType<typeof setTimeout> | null = null
    let settleRafId: number | null = null
    let observer: ResizeObserver | null = null
    let initialized = false

    untracked(() => applyMeasurement())
    if (typeof requestAnimationFrame === 'function') {
      initRafId = requestAnimationFrame(() => {
        initRafId = null
        applyMeasurement()
      })
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.ngZone.runOutsideAngular(() => {
        observer = new ResizeObserver(() => {
          if (!initialized) {
            initialized = true
            return
          }
          this.correspondentsResizing = true
          if (settleTimerId !== null) {
            clearTimeout(settleTimerId)
          }
          if (
            settleRafId !== null &&
            typeof cancelAnimationFrame === 'function'
          ) {
            cancelAnimationFrame(settleRafId)
            settleRafId = null
          }
          settleTimerId = setTimeout(() => {
            settleTimerId = null
            if (typeof requestAnimationFrame === 'function') {
              settleRafId = requestAnimationFrame(() => {
                settleRafId = null
                applyMeasurement()
              })
            } else {
              applyMeasurement()
            }
          }, 140)
        })
        observer.observe(trackEl)
      })
    }

    onCleanup(() => {
      this.correspondentsResizing = false
      if (initRafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(initRafId)
      }
      if (settleTimerId !== null) {
        clearTimeout(settleTimerId)
      }
      if (settleRafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(settleRafId)
      }
      observer?.disconnect()
    })
  })

  toggleCorrespondentsRowExpanded(): void {
    this.correspondentsRowExpanded.update((expanded) => !expanded)
  }

  get hasHiddenActiveCorrespondent(): boolean {
    return this.hiddenActiveCorrespondent()
  }

  // Memoized: the template reads these once per pill on every change
  // detection pass. They only recompute when the list state changes and keep
  // returning the same Set instance while the contained ids are unchanged.
  private readonly activeDocumentTypeFilterIdsSignal = computed(
    () =>
      collectFilterRuleIds(this.list.filterRules, [
        FILTER_DOCUMENT_TYPE,
        FILTER_HAS_DOCUMENT_TYPE_ANY,
      ]),
    { equal: setsEqual }
  )

  private readonly activeCorrespondentFilterIdsSignal = computed(
    () =>
      collectFilterRuleIds(this.list.filterRules, [
        FILTER_CORRESPONDENT,
        FILTER_HAS_CORRESPONDENT_ANY,
      ]),
    { equal: setsEqual }
  )

  private readonly excludedDocumentTypeFilterIdsSignal = computed(
    () =>
      collectFilterRuleIds(this.list.filterRules, [
        FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE,
      ]),
    { equal: setsEqual }
  )

  private readonly excludedCorrespondentFilterIdsSignal = computed(
    () =>
      collectFilterRuleIds(this.list.filterRules, [
        FILTER_DOES_NOT_HAVE_CORRESPONDENT,
      ]),
    { equal: setsEqual }
  )

  get activeDocumentTypeFilterIds(): Set<number> {
    return this.activeDocumentTypeFilterIdsSignal()
  }

  get activeCorrespondentFilterIds(): Set<number> {
    return this.activeCorrespondentFilterIdsSignal()
  }

  get excludedDocumentTypeFilterIds(): Set<number> {
    return this.excludedDocumentTypeFilterIdsSignal()
  }

  get excludedCorrespondentFilterIds(): Set<number> {
    return this.excludedCorrespondentFilterIdsSignal()
  }

  isQuickDocumentTypeActive(documentTypeId: number): boolean {
    return this.activeDocumentTypeFilterIds.has(documentTypeId)
  }

  isQuickCorrespondentActive(correspondentId: number): boolean {
    return this.activeCorrespondentFilterIds.has(correspondentId)
  }

  isQuickDocumentTypeExcluded(documentTypeId: number): boolean {
    return this.excludedDocumentTypeFilterIds.has(documentTypeId)
  }

  isQuickCorrespondentExcluded(correspondentId: number): boolean {
    return this.excludedCorrespondentFilterIds.has(correspondentId)
  }

  get hasQuickPillFilter(): boolean {
    return (
      this.activeDocumentTypeFilterIds.size > 0 ||
      this.excludedDocumentTypeFilterIds.size > 0 ||
      this.activeCorrespondentFilterIds.size > 0 ||
      this.excludedCorrespondentFilterIds.size > 0
    )
  }

  toggleQuickFilterExcludeMode(): void {
    this.quickFilterExcludeMode.update((mode) => !mode)
  }

  clearQuickDocumentTypes(): void {
    const remaining = (this.list.filterRules || []).filter(
      (r) =>
        r.rule_type !== FILTER_DOCUMENT_TYPE &&
        r.rule_type !== FILTER_HAS_DOCUMENT_TYPE_ANY &&
        r.rule_type !== FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE
    )
    this.list.setFilterRules(remaining)
  }

  clearQuickCorrespondents(): void {
    const remaining = (this.list.filterRules || []).filter(
      (r) =>
        r.rule_type !== FILTER_CORRESPONDENT &&
        r.rule_type !== FILTER_HAS_CORRESPONDENT_ANY &&
        r.rule_type !== FILTER_DOES_NOT_HAVE_CORRESPONDENT
    )
    this.list.setFilterRules(remaining)
  }

  clearQuickPillFilters(): void {
    const remaining = (this.list.filterRules || []).filter(
      (r) =>
        r.rule_type !== FILTER_DOCUMENT_TYPE &&
        r.rule_type !== FILTER_HAS_DOCUMENT_TYPE_ANY &&
        r.rule_type !== FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE &&
        r.rule_type !== FILTER_CORRESPONDENT &&
        r.rule_type !== FILTER_HAS_CORRESPONDENT_ANY &&
        r.rule_type !== FILTER_DOES_NOT_HAVE_CORRESPONDENT
    )
    this.list.setFilterRules(remaining)
  }

  toggleQuickDocumentTypeExclude(documentTypeId: number): void {
    const nextExcluded = new Set(this.excludedDocumentTypeFilterIds)
    if (nextExcluded.has(documentTypeId)) {
      nextExcluded.delete(documentTypeId)
    } else {
      nextExcluded.add(documentTypeId)
    }
    const withoutType = (this.list.filterRules || []).filter(
      (r) =>
        r.rule_type !== FILTER_DOCUMENT_TYPE &&
        r.rule_type !== FILTER_HAS_DOCUMENT_TYPE_ANY &&
        r.rule_type !== FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE
    )
    const excludeRules: FilterRule[] = Array.from(nextExcluded).map((id) => ({
      rule_type: FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE,
      value: id.toString(),
    }))
    this.list.setFilterRules([...withoutType, ...excludeRules])
  }

  toggleQuickDocumentType(documentTypeId: number, event?: MouseEvent): void {
    if (event?.altKey || this.quickFilterExcludeMode()) {
      this.toggleQuickDocumentTypeExclude(documentTypeId)
      return
    }
    const activeIds = this.activeDocumentTypeFilterIds
    const excludedIds = this.excludedDocumentTypeFilterIds
    if (
      excludedIds.has(documentTypeId) ||
      (excludedIds.size > 0 && activeIds.size === 0) ||
      (activeIds.size === 1 && activeIds.has(documentTypeId))
    ) {
      this.toggleQuickDocumentTypeExclude(documentTypeId)
      return
    }
    const nextIds = new Set(activeIds)
    if (nextIds.has(documentTypeId)) {
      nextIds.delete(documentTypeId)
    } else {
      nextIds.add(documentTypeId)
    }
    const withoutType = (this.list.filterRules || []).filter(
      (r) =>
        r.rule_type !== FILTER_DOCUMENT_TYPE &&
        r.rule_type !== FILTER_HAS_DOCUMENT_TYPE_ANY &&
        r.rule_type !== FILTER_DOES_NOT_HAVE_DOCUMENT_TYPE
    )
    const typeRules: FilterRule[] = Array.from(nextIds).map((id) => ({
      rule_type: FILTER_HAS_DOCUMENT_TYPE_ANY,
      value: id.toString(),
    }))
    this.list.setFilterRules([...withoutType, ...typeRules])
  }

  toggleQuickCorrespondentExclude(correspondentId: number): void {
    const nextExcluded = new Set(this.excludedCorrespondentFilterIds)
    if (nextExcluded.has(correspondentId)) {
      nextExcluded.delete(correspondentId)
    } else {
      nextExcluded.add(correspondentId)
    }
    const withoutCorr = (this.list.filterRules || []).filter(
      (r) =>
        r.rule_type !== FILTER_CORRESPONDENT &&
        r.rule_type !== FILTER_HAS_CORRESPONDENT_ANY &&
        r.rule_type !== FILTER_DOES_NOT_HAVE_CORRESPONDENT
    )
    const excludeRules: FilterRule[] = Array.from(nextExcluded).map((id) => ({
      rule_type: FILTER_DOES_NOT_HAVE_CORRESPONDENT,
      value: id.toString(),
    }))
    this.list.setFilterRules([...withoutCorr, ...excludeRules])
  }

  toggleQuickCorrespondent(correspondentId: number, event?: MouseEvent): void {
    if (event?.altKey || this.quickFilterExcludeMode()) {
      this.toggleQuickCorrespondentExclude(correspondentId)
      return
    }
    const activeIds = this.activeCorrespondentFilterIds
    const excludedIds = this.excludedCorrespondentFilterIds
    if (
      excludedIds.has(correspondentId) ||
      (excludedIds.size > 0 && activeIds.size === 0) ||
      (activeIds.size === 1 && activeIds.has(correspondentId))
    ) {
      this.toggleQuickCorrespondentExclude(correspondentId)
      return
    }
    const nextIds = new Set(activeIds)
    if (nextIds.has(correspondentId)) {
      nextIds.delete(correspondentId)
    } else {
      nextIds.add(correspondentId)
    }
    const withoutCorr = (this.list.filterRules || []).filter(
      (r) =>
        r.rule_type !== FILTER_CORRESPONDENT &&
        r.rule_type !== FILTER_HAS_CORRESPONDENT_ANY &&
        r.rule_type !== FILTER_DOES_NOT_HAVE_CORRESPONDENT
    )
    const corrRules: FilterRule[] = Array.from(nextIds).map((id) => ({
      rule_type: FILTER_HAS_CORRESPONDENT_ANY,
      value: id.toString(),
    }))
    this.list.setFilterRules([...withoutCorr, ...corrRules])
  }

  getQuickDocumentTypeTooltip(documentTypeId: number): string {
    return this.getQuickPillTooltip(
      this.isQuickDocumentTypeActive(documentTypeId),
      this.isQuickDocumentTypeExcluded(documentTypeId),
      this.activeDocumentTypeFilterIds.size,
      this.excludedDocumentTypeFilterIds.size
    )
  }

  getQuickCorrespondentTooltip(correspondentId: number): string {
    return this.getQuickPillTooltip(
      this.isQuickCorrespondentActive(correspondentId),
      this.isQuickCorrespondentExcluded(correspondentId),
      this.activeCorrespondentFilterIds.size,
      this.excludedCorrespondentFilterIds.size
    )
  }

  private getQuickPillTooltip(
    isActive: boolean,
    isExcluded: boolean,
    activeCount: number,
    excludedCount: number
  ): string {
    if (isExcluded) {
      return $localize`Ausgeblendet · Klick: zurücksetzen`
    }
    if (
      this.quickFilterExcludeMode() ||
      (excludedCount > 0 && activeCount === 0)
    ) {
      return $localize`Klick: ausblenden`
    }
    if (isActive) {
      return activeCount === 1
        ? $localize`Gefiltert · Klick: ausblenden`
        : $localize`Gefiltert · Klick: entfernen · Rechtsklick: ausblenden`
    }
    return $localize`Klick: filtern · Rechtsklick: ausblenden`
  }

  getCorrespondentColor(id: number): string {
    return CORRESPONDENT_DOT_COLORS[Math.abs(id) % CORRESPONDENT_DOT_COLORS.length]
  }

  refreshDocuments(): void {
    this.isRefreshing.set(true)
    this.loadTaxonomyLookups(true)
    this.list.reload(() => {
      if (this.activeSavedView) {
        this.savedViewService.setDocumentCount(
          this.activeSavedView,
          this.list.collectionSize
        )
      }
      this.isRefreshing.set(false)
    })
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

  private loadTaxonomyLookups(forceRefresh: boolean = false): void {
    if (
      this.permissionService.currentUserCan(
        PermissionAction.View,
        PermissionType.Tag
      )
    ) {
      if (forceRefresh) {
        this.tagService.clearCache()
      }
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
      if (forceRefresh) {
        this.correspondentService.clearCache()
      }
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
      if (forceRefresh) {
        this.documentTypeService.clearCache()
      }
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
