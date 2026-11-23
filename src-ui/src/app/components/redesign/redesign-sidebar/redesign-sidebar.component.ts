import { NgClass } from '@angular/common'
import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Router, RouterModule } from '@angular/router'
import {
  NgbDropdownModule,
  NgbTooltipModule,
} from '@ng-bootstrap/ng-bootstrap'
import { catchError, of } from 'rxjs'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { Correspondent } from 'src/app/data/correspondent'
import { DocumentType } from 'src/app/data/document-type'
import {
  FILTER_CORRESPONDENT,
  FILTER_DOCUMENT_TYPE,
  FILTER_HAS_TAGS_ALL,
  FILTER_IS_IN_INBOX,
} from 'src/app/data/filter-rule-type'
import { Tag } from 'src/app/data/tag'
import { SETTINGS_KEYS } from 'src/app/data/ui-settings'
import { IfPermissionsDirective } from 'src/app/directives/if-permissions.directive'
import { DocumentListViewService } from 'src/app/services/document-list-view.service'
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
import { TasksService } from 'src/app/services/tasks.service'
import { WebsocketStatusService } from 'src/app/services/websocket-status.service'

const CORRESPONDENT_PALETTE = [
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
  selector: 'pngx-redesign-sidebar',
  templateUrl: './redesign-sidebar.component.html',
  styleUrls: ['./redesign-sidebar.component.scss'],
  imports: [
    NgClass,
    RouterModule,
    NgbDropdownModule,
    NgbTooltipModule,
    BootstrapIconComponent,
    IfPermissionsDirective,
  ],
})
export class RedesignSidebarComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef)
  readonly router = inject(Router)
  readonly documentList = inject(DocumentListViewService)
  readonly savedViewService = inject(SavedViewService)
  readonly settingsService = inject(SettingsService)
  readonly permissionsService = inject(PermissionsService)
  readonly tasksService = inject(TasksService)
  private readonly tagService = inject(TagService)
  private readonly correspondentService = inject(CorrespondentService)
  private readonly documentTypeService = inject(DocumentTypeService)
  private readonly websocketStatusService = inject(WebsocketStatusService)

  @Input() collapsed = false
  @Input() appTitle = 'Paperless'
  @Input() canManageAttributes = false
  @Input() canManageShareLinks = false

  @Output() toggleCollapse = new EventEmitter<void>()
  @Output() editProfileClicked = new EventEmitter<void>()
  @Output() logoutClicked = new EventEmitter<void>()
  @Output() itemSelected = new EventEmitter<void>()

  readonly PermissionAction = PermissionAction
  readonly PermissionType = PermissionType

  readonly tags = signal<Tag[]>([])
  readonly correspondents = signal<Correspondent[]>([])
  readonly documentTypes = signal<DocumentType[]>([])

  readonly tagsExpanded = signal(true)
  readonly correspondentsExpanded = signal(false)
  readonly documentTypesExpanded = signal(false)

  readonly inboxCount = computed(() => {
    const inboxTags = this.tags().filter((t) => t.is_inbox_tag)
    return inboxTags.reduce((sum, t) => sum + (t.document_count ?? 0), 0)
  })

  readonly visibleTags = computed(() =>
    this.tags().filter((t) => !t.is_inbox_tag)
  )

  private readonly darkModeEnabledSetting =
    this.settingsService.getSignal<boolean>(SETTINGS_KEYS.DARK_MODE_ENABLED)
  private readonly darkModeUseSystemSetting =
    this.settingsService.getSignal<boolean>(SETTINGS_KEYS.DARK_MODE_USE_SYSTEM)

  ngOnInit(): void {
    this.loadTaxonomies()

    this.websocketStatusService
      .onDocumentConsumptionFinished()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadTaxonomies(true))

    this.websocketStatusService
      .onDocumentUpdated()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadTaxonomies(true))

    this.websocketStatusService
      .onDocumentDeleted()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadTaxonomies(true))
  }

  public loadTaxonomies(clearCache = false): void {
    if (
      this.permissionsService.currentUserCan(
        PermissionAction.View,
        PermissionType.Tag
      )
    ) {
      if (clearCache) this.tagService.clearCache()
      this.tagService
        .listAll()
        .pipe(
          catchError(() => of({ results: [] as Tag[] })),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe((r) => this.tags.set(r.results ?? []))
    }

    if (
      this.permissionsService.currentUserCan(
        PermissionAction.View,
        PermissionType.Correspondent
      )
    ) {
      if (clearCache) this.correspondentService.clearCache()
      this.correspondentService
        .listAll()
        .pipe(
          catchError(() => of({ results: [] as Correspondent[] })),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe((r) => this.correspondents.set(r.results ?? []))
    }

    if (
      this.permissionsService.currentUserCan(
        PermissionAction.View,
        PermissionType.DocumentType
      )
    ) {
      if (clearCache) this.documentTypeService.clearCache()
      this.documentTypeService
        .listAll()
        .pipe(
          catchError(() => of({ results: [] as DocumentType[] })),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe((r) => this.documentTypes.set(r.results ?? []))
    }
  }

  get isDarkMode(): boolean {
    if (this.darkModeUseSystemSetting()) {
      return (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches
      )
    }
    return !!this.darkModeEnabledSetting()
  }

  toggleDarkMode(event?: Event): void {
    event?.stopPropagation()
    const nextDark = !this.isDarkMode
    this.settingsService.set(SETTINGS_KEYS.DARK_MODE_USE_SYSTEM, false)
    this.settingsService.set(SETTINGS_KEYS.DARK_MODE_ENABLED, nextDark)
    this.settingsService.updateAppearanceSettings(false, nextDark)
    this.settingsService.storeSettings().subscribe()
  }

  get userInitials(): string {
    const user = this.settingsService.currentUser()
    const first = user?.first_name?.trim()
    const last = user?.last_name?.trim()
    if (first && last) {
      return (first[0] + last[0]).toUpperCase()
    }
    const name = this.settingsService.displayName || 'U'
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  get userDisplayName(): string {
    const user = this.settingsService.currentUser()
    const full = [user?.first_name, user?.last_name]
      .filter((p) => !!p?.trim())
      .join(' ')
    return full || this.settingsService.displayName || 'Benutzer'
  }

  get isInboxActive(): boolean {
    return (
      this.router.url.startsWith('/documents') &&
      !this.documentList.activeSavedViewId &&
      this.documentList.filterRules.some(
        (r) => r.rule_type === FILTER_IS_IN_INBOX && r.value === 'true'
      )
    )
  }

  get isAllDocumentsActive(): boolean {
    if (!this.router.url.startsWith('/documents')) return false
    if (this.router.url.match(/^\/documents\/\d+/)) return false
    if (this.documentList.activeSavedViewId) return false
    return this.documentList.filterRules.length === 0
  }

  isTagActive(tagId: number): boolean {
    return (
      this.router.url.startsWith('/documents') &&
      !this.documentList.activeSavedViewId &&
      this.documentList.filterRules.some(
        (r) =>
          r.rule_type === FILTER_HAS_TAGS_ALL && r.value === tagId.toString()
      )
    )
  }

  isCorrespondentActive(correspondentId: number): boolean {
    return (
      this.router.url.startsWith('/documents') &&
      !this.documentList.activeSavedViewId &&
      this.documentList.filterRules.some(
        (r) =>
          r.rule_type === FILTER_CORRESPONDENT &&
          r.value === correspondentId.toString()
      )
    )
  }

  isDocumentTypeActive(docTypeId: number): boolean {
    return (
      this.router.url.startsWith('/documents') &&
      !this.documentList.activeSavedViewId &&
      this.documentList.filterRules.some(
        (r) =>
          r.rule_type === FILTER_DOCUMENT_TYPE &&
          r.value === docTypeId.toString()
      )
    )
  }

  openInbox(): void {
    this.documentList.quickFilter([
      { rule_type: FILTER_IS_IN_INBOX, value: 'true' },
    ])
    this.itemSelected.emit()
  }

  openAllDocuments(): void {
    this.documentList.quickFilter([])
    this.itemSelected.emit()
  }

  filterByTag(tag: Tag): void {
    this.documentList.quickFilter([
      { rule_type: FILTER_HAS_TAGS_ALL, value: tag.id.toString() },
    ])
    this.itemSelected.emit()
  }

  filterByCorrespondent(correspondent: Correspondent): void {
    this.documentList.quickFilter([
      { rule_type: FILTER_CORRESPONDENT, value: correspondent.id.toString() },
    ])
    this.itemSelected.emit()
  }

  filterByDocumentType(docType: DocumentType): void {
    this.documentList.quickFilter([
      { rule_type: FILTER_DOCUMENT_TYPE, value: docType.id.toString() },
    ])
    this.itemSelected.emit()
  }

  getCorrespondentColor(id: number): string {
    return CORRESPONDENT_PALETTE[id % CORRESPONDENT_PALETTE.length]
  }
}
