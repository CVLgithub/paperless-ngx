import {
  Component,
  computed,
  inject,
  input,
  Input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core'
import { Router, RouterModule } from '@angular/router'
import { Subject, takeUntil } from 'rxjs'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { LoadingComponentWithPermissions } from 'src/app/components/loading-component/loading.component'
import { RedesignDocumentCardComponent } from 'src/app/components/redesign/redesign-document-card/redesign-document-card.component'
import { RedesignDocumentListRowComponent } from 'src/app/components/redesign/redesign-document-list-row/redesign-document-list-row.component'
import { Correspondent } from 'src/app/data/correspondent'
import {
  DEFAULT_DASHBOARD_VIEW_PAGE_SIZE,
  DisplayMode,
  Document,
} from 'src/app/data/document'
import { DocumentType } from 'src/app/data/document-type'
import {
  FILTER_CORRESPONDENT,
  FILTER_DOCUMENT_TYPE,
  FILTER_FULLTEXT_MORELIKE,
  FILTER_HAS_TAGS_ALL,
  FILTER_OWNER_ANY,
  FILTER_STORAGE_PATH,
} from 'src/app/data/filter-rule-type'
import { SavedView } from 'src/app/data/saved-view'
import { Tag } from 'src/app/data/tag'
import { IfPermissionsDirective } from 'src/app/directives/if-permissions.directive'
import {
  DOCUMENT_LIST_FIELDS,
  DocumentListViewService,
} from 'src/app/services/document-list-view.service'
import { DocumentService } from 'src/app/services/rest/document.service'
import { SavedViewService } from 'src/app/services/rest/saved-view.service'
import { WebsocketStatusService } from 'src/app/services/websocket-status.service'
import { WidgetFrameComponent } from '../widget-frame/widget-frame.component'

@Component({
  selector: 'pngx-saved-view-widget',
  templateUrl: './saved-view-widget.component.html',
  styleUrls: ['./saved-view-widget.component.scss'],
  imports: [
    WidgetFrameComponent,
    RedesignDocumentCardComponent,
    RedesignDocumentListRowComponent,
    IfPermissionsDirective,
    RouterModule,
    BootstrapIconComponent,
  ],
})
export class SavedViewWidgetComponent
  extends LoadingComponentWithPermissions
  implements OnInit, OnDestroy
{
  private documentService = inject(DocumentService)
  private router = inject(Router)
  private list = inject(DocumentListViewService)
  private websocketStatusService = inject(WebsocketStatusService)
  documentListViewService = inject(DocumentListViewService)
  private savedViewService = inject(SavedViewService)

  public DisplayMode = DisplayMode

  @Input()
  savedView: SavedView

  readonly tagMap = input<Map<number, Tag>>(new Map())
  readonly correspondentMap = input<Map<number, Correspondent>>(new Map())
  readonly documentTypeMap = input<Map<number, DocumentType>>(new Map())

  readonly documents = signal<Document[]>([])

  unsubscribeNotifier: Subject<any> = new Subject()

  readonly displayMode = signal<DisplayMode>(null)

  readonly count = signal<number>(null)

  readonly error = signal<string | null>(null)

  private readonly resolvedPageSize = signal<number>(
    DEFAULT_DASHBOARD_VIEW_PAGE_SIZE
  )

  readonly skeletonItems = computed(() => {
    const mode = this.displayMode()
    const maxCount =
      mode === DisplayMode.LARGE_CARDS
        ? 4
        : mode === DisplayMode.TABLE
          ? 5
          : 6
    const length = Math.max(1, Math.min(this.resolvedPageSize(), maxCount))
    return Array.from({ length }, (_, index) => index)
  })

  ngOnInit(): void {
    this.resolvedPageSize.set(this.pageSize)
    this.displayMode.set(this.savedView.display_mode ?? DisplayMode.TABLE)

    this.reload()
    this.websocketStatusService
      .onDocumentConsumptionFinished()
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe(() => {
        this.reload()
      })
  }

  ngOnDestroy(): void {
    this.unsubscribeNotifier.next(true)
    this.unsubscribeNotifier.complete()
  }

  reload() {
    this.loading.set(this.documents().length == 0)
    this.error.set(null)
    this.show.set(true)
    this.documentService
      .listFiltered(
        1,
        this.pageSize,
        this.savedView.sort_field,
        this.savedView.sort_reverse,
        this.savedView.filter_rules,
        this.listParams()
      )
      .pipe(takeUntil(this.unsubscribeNotifier))
      .subscribe({
        next: (result) => {
          this.documents.set(result.results)
          this.count.set(result.count)
          this.savedViewService.setDocumentCount(this.savedView, result.count)
          this.loading.set(false)
          this.show.set(true)
        },
        error: (error) => {
          this.documents.set([])
          this.count.set(null)
          let errorMessage
          if (
            typeof error.error === 'object' &&
            Object.keys(error.error).length > 0
          ) {
            errorMessage = Object.keys(error.error)
              .map((fieldName) => {
                const fieldNameBase = fieldName.split('__')[0]
                const fieldError: Array<string> = error.error[fieldName]
                return `${
                  this.documentService.sortFields.find(
                    (f) => f.field?.split('__')[0] == fieldNameBase
                  )?.name ?? fieldNameBase
                }: ${fieldError[0]}`
              })
              .join(', ')
          } else {
            errorMessage = error.error
          }
          this.error.set(errorMessage)
          this.loading.set(false)
          this.show.set(true)
        },
      })
  }

  /**
   * Request the exact lightweight field set needed by the redesign cards,
   * list rows, and DocumentListViewService handoff across all display modes.
   */
  private listParams(): Record<string, string | boolean> {
    return { fields: DOCUMENT_LIST_FIELDS.join(',') }
  }

  showAll() {
    if (this.savedView.show_in_sidebar) {
      this.router.navigate(['view', this.savedView.id])
    } else {
      this.router.navigate(['documents'], {
        queryParams: { view: this.savedView.id },
      })
    }
  }

  clickTag(tagID: number, event: MouseEvent = null) {
    event?.preventDefault()
    event?.stopImmediatePropagation()

    this.list.quickFilter([
      { rule_type: FILTER_HAS_TAGS_ALL, value: tagID.toString() },
    ])
  }

  clickCorrespondent(correspondentId: number, event: MouseEvent = null) {
    event?.preventDefault()
    event?.stopImmediatePropagation()

    this.list.quickFilter([
      { rule_type: FILTER_CORRESPONDENT, value: correspondentId.toString() },
    ])
  }

  clickDocType(docTypeId: number, event: MouseEvent = null) {
    event?.preventDefault()
    event?.stopImmediatePropagation()

    this.list.quickFilter([
      { rule_type: FILTER_DOCUMENT_TYPE, value: docTypeId.toString() },
    ])
  }

  clickStoragePath(storagePathId: number, event: MouseEvent = null) {
    event?.preventDefault()
    event?.stopImmediatePropagation()

    this.list.quickFilter([
      { rule_type: FILTER_STORAGE_PATH, value: storagePathId.toString() },
    ])
  }

  clickMoreLike(documentID: number) {
    this.list.quickFilter([
      { rule_type: FILTER_FULLTEXT_MORELIKE, value: documentID.toString() },
    ])
  }

  clickOwner(ownerID: number, event: MouseEvent = null) {
    event?.preventDefault()
    event?.stopImmediatePropagation()

    this.list.quickFilter([
      { rule_type: FILTER_OWNER_ANY, value: ownerID.toString() },
    ])
  }

  get pageSize(): number {
    return this.savedView?.page_size ?? DEFAULT_DASHBOARD_VIEW_PAGE_SIZE
  }

  /**
   * Pass the widget's documents to the list service to enable next / previous.
   */
  activateViewForNavigation() {
    this.documentListViewService.activateSavedViewWithDocuments(
      this.savedView,
      this.documents(),
      this.count(),
      this.pageSize
    )
  }

  openDocumentDetail(document: Document) {
    this.activateViewForNavigation()
    this.router.navigate(['documents', document.id])
  }

  getPreviewUrl(document: Document): string {
    return this.documentService.getPreviewUrl(document.id)
  }

  getDownloadUrl(document: Document): string {
    return this.documentService.getDownloadUrl(document.id)
  }
}
