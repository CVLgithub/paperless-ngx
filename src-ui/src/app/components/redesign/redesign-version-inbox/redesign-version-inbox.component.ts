import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core'
import { RouterModule } from '@angular/router'
import { NgbDropdown, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { CustomDatePipe } from 'src/app/pipes/custom-date.pipe'
import { DocumentTitlePipe } from 'src/app/pipes/document-title.pipe'
import {
  VersionInboxItem,
  VersionInboxService,
} from 'src/app/services/version-inbox.service'

@Component({
  selector: 'pngx-redesign-version-inbox',
  templateUrl: './redesign-version-inbox.component.html',
  styleUrls: ['./redesign-version-inbox.component.scss'],
  imports: [
    BootstrapIconComponent,
    CustomDatePipe,
    DocumentTitlePipe,
    NgbDropdownModule,
    RouterModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RedesignVersionInboxComponent implements OnInit {
  readonly versionInbox = inject(VersionInboxService)

  readonly isOpen = signal(false)

  readonly unreadBadgeText = computed(() => {
    const count = this.versionInbox.unreadCount()
    if (count <= 0) return ''
    return count > 99 ? '99+' : String(count)
  })

  readonly triggerAriaLabel = computed(() => {
    const count = this.versionInbox.unreadCount()
    if (count <= 0) {
      return $localize`Versions-Inbox`
    }
    return count === 1
      ? $localize`Versions-Inbox (1 ungelesen)`
      : $localize`Versions-Inbox (${count} ungelesen)`
  })

  ngOnInit(): void {
    this.versionInbox.ensureLoaded()
  }

  onOpenChange(open: boolean): void {
    this.isOpen.set(open)
    if (open) {
      this.versionInbox.refresh()
    }
  }

  onRefresh(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.versionInbox.refresh()
  }

  onMarkAllAsRead(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.versionInbox.markAllAsRead()
  }

  onMarkItemAsRead(item: VersionInboxItem, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.versionInbox.markAsRead(item.documentId, item.latestVersionId)
  }

  onOpenItem(item: VersionInboxItem, dropdown: NgbDropdown): void {
    this.versionInbox.markAsRead(item.documentId, item.latestVersionId)
    dropdown.close()
  }

  getVersionAriaLabel(item: VersionInboxItem): string {
    const base =
      item.versionCount === 1
        ? $localize`1 Version`
        : $localize`${item.versionCount} Versionen`
    return item.latestVersionLabel
      ? `${base}: ${item.latestVersionLabel}`
      : base
  }
}
