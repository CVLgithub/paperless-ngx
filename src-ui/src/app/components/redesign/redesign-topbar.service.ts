import { Injectable, TemplateRef, signal } from '@angular/core'
import { Subject } from 'rxjs'

export type RedesignTopbarMode = 'default' | 'document-list' | 'document-detail'

export interface RedesignListTopbarConfig {
  displayMode: 'grid' | 'list'
  selectionMode: boolean
  canUpload: boolean
  onSetDisplayMode: (mode: 'grid' | 'list') => void
  onToggleSelectionMode: () => void
}

export interface RedesignDetailTopbarConfig {
  breadcrumbParent: string
  breadcrumbTitle: string
  hasPrevious: boolean
  hasNext: boolean
  inspectorOpen: boolean
  canEdit: boolean
  isDirty: boolean
  isSaving: boolean
  previewUrl: string | null
  canDelete: boolean
  canShare: boolean
  onBackToList: () => void
  onPrevious: () => void
  onNext: () => void
  onSave: () => void
  onSaveAndNext?: () => void
  onDiscard: () => void
  onDownload: () => void
  onShare: () => void
  onDelete: () => void
  onToggleInspector: () => void
  moreActionsTemplate?: TemplateRef<any>
}

@Injectable({
  providedIn: 'root',
})
export class RedesignTopbarService {
  readonly mode = signal<RedesignTopbarMode>('default')
  readonly listConfig = signal<RedesignListTopbarConfig | null>(null)
  readonly detailConfig = signal<RedesignDetailTopbarConfig | null>(null)

  private readonly uploadRequestSubject = new Subject<void>()
  readonly uploadRequested$ = this.uploadRequestSubject.asObservable()

  setListConfig(config: RedesignListTopbarConfig): void {
    this.detailConfig.set(null)
    this.listConfig.set(config)
    this.mode.set('document-list')
  }

  setDetailConfig(config: RedesignDetailTopbarConfig): void {
    this.listConfig.set(null)
    this.detailConfig.set(config)
    this.mode.set('document-detail')
  }

  reset(): void {
    this.listConfig.set(null)
    this.detailConfig.set(null)
    this.mode.set('default')
  }

  requestUpload(): void {
    this.uploadRequestSubject.next()
  }
}
