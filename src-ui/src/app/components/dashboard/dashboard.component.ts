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
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { SavedView } from 'src/app/data/saved-view'
import { IfPermissionsDirective } from 'src/app/directives/if-permissions.directive'
import { SavedViewService } from 'src/app/services/rest/saved-view.service'
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
  private tourService = inject(TourService)
  private toastService = inject(ToastService)

  readonly dashboardViews = signal<SavedView[]>([])
  readonly totalDocuments = signal<number | null>(null)

  constructor() {
    super()

    this.savedViewService.listAll().subscribe(() => {
      this.dashboardViews.set(this.savedViewService.dashboardViews)
    })
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
