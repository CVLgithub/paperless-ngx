import {
  CdkDragDrop,
  CdkDragEnd,
  CdkDragStart,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop'
import { Component, inject, signal } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TourNgBootstrap, TourService } from 'ngx-ui-tour-ng-bootstrap'
import { catchError, first, of } from 'rxjs'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { Correspondent } from 'src/app/data/correspondent'
import { DocumentType } from 'src/app/data/document-type'
import { SavedView } from 'src/app/data/saved-view'
import { Tag } from 'src/app/data/tag'
import { IfPermissionsDirective } from 'src/app/directives/if-permissions.directive'
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
import { environment } from 'src/environments/environment'
import { ComponentWithPermissions } from '../with-permissions/with-permissions.component'
import { SavedViewWidgetComponent } from './widgets/saved-view-widget/saved-view-widget.component'
import {
  Statistics,
  StatisticsWidgetComponent,
} from './widgets/statistics-widget/statistics-widget.component'
import { WelcomeWidgetComponent } from './widgets/welcome-widget/welcome-widget.component'

@Component({
  selector: 'pngx-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  imports: [
    SavedViewWidgetComponent,
    StatisticsWidgetComponent,
    WelcomeWidgetComponent,
    IfPermissionsDirective,
    DragDropModule,
    TourNgBootstrap,
    BootstrapIconComponent,
    RouterModule,
  ],
})
export class DashboardComponent extends ComponentWithPermissions {
  settingsService = inject(SettingsService)
  savedViewService = inject(SavedViewService)
  private permissionsService = inject(PermissionsService)
  private tagService = inject(TagService)
  private correspondentService = inject(CorrespondentService)
  private documentTypeService = inject(DocumentTypeService)
  private tourService = inject(TourService)
  private toastService = inject(ToastService)

  readonly dashboardViews = signal<SavedView[]>([])
  readonly totalDocuments = signal<number | null>(null)
  readonly tagMap = signal<Map<number, Tag>>(new Map())
  readonly correspondentMap = signal<Map<number, Correspondent>>(new Map())
  readonly documentTypeMap = signal<Map<number, DocumentType>>(new Map())

  constructor() {
    super()

    this.savedViewService.listAll().subscribe(() => {
      this.dashboardViews.set(this.savedViewService.dashboardViews)
    })

    this.loadTaxonomyLookups()
  }

  private loadTaxonomyLookups(): void {
    if (
      this.permissionsService.currentUserCan(
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
          this.tagMap.set(
            new Map((res.results ?? []).map((item) => [item.id, item]))
          )
        })
    }

    if (
      this.permissionsService.currentUserCan(
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
          this.correspondentMap.set(
            new Map((res.results ?? []).map((item) => [item.id, item]))
          )
        })
    }

    if (
      this.permissionsService.currentUserCan(
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
          this.documentTypeMap.set(
            new Map((res.results ?? []).map((item) => [item.id, item]))
          )
        })
    }
  }

  onStatisticsChange(statistics: Statistics) {
    this.totalDocuments.set(
      typeof statistics?.documents_total === 'number'
        ? statistics.documents_total
        : null
    )
  }

  get subtitle() {
    if (this.settingsService.displayName) {
      return $localize`Hello ${this.settingsService.displayName}, welcome to ${environment.appTitle}`
    } else {
      return $localize`Welcome to ${environment.appTitle}`
    }
  }

  completeTour() {
    if (this.tourService.getStatus() !== 0) {
      this.tourService.end() // will call settingsService.completeTour()
    } else {
      this.settingsService.completeTour()
    }
  }

  onDragStart(event: CdkDragStart) {
    this.settingsService.globalDropzoneEnabled.set(false)
  }

  onDragEnd(event: CdkDragEnd) {
    this.settingsService.globalDropzoneEnabled.set(true)
  }

  onDrop(event: CdkDragDrop<SavedView[]>) {
    const dashboardViews = [...this.dashboardViews()]
    moveItemInArray(dashboardViews, event.previousIndex, event.currentIndex)
    this.dashboardViews.set(dashboardViews)

    this.settingsService
      .updateDashboardViewsSort(this.dashboardViews())
      .subscribe({
        next: () => {
          this.toastService.showSuccess($localize`Dashboard updated`)
        },
        error: (e) => {
          this.toastService.showError($localize`Error updating dashboard`, e)
        },
      })
  }
}
