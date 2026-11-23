import { Component, EventEmitter, Input, Output, inject } from '@angular/core'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { Document } from 'src/app/data/document'
import { Tag } from 'src/app/data/tag'
import { CustomDatePipe } from 'src/app/pipes/custom-date.pipe'
import { DocumentTitlePipe } from 'src/app/pipes/document-title.pipe'
import { DocumentService } from 'src/app/services/rest/document.service'

@Component({
  selector: 'pngx-redesign-document-card',
  templateUrl: './redesign-document-card.component.html',
  styleUrls: ['./redesign-document-card.component.scss'],
  imports: [BootstrapIconComponent, CustomDatePipe, DocumentTitlePipe],
})
export class RedesignDocumentCardComponent {
  private readonly documentService = inject(DocumentService)

  @Input({ required: true }) document!: Document
  @Input() selected = false
  @Input() selectionMode = false
  @Input() tagMap: Map<number, Tag> = new Map()

  @Output() cardClick = new EventEmitter<MouseEvent>()
  @Output() toggleSelect = new EventEmitter<MouseEvent>()

  get thumbUrl(): string {
    return this.documentService.getThumbUrl(this.document.id)
  }

  get resolvedTags(): Tag[] {
    if (!this.document?.tags?.length) return []
    const result: Tag[] = []
    for (const id of this.document.tags) {
      const tag = this.tagMap.get(id)
      if (tag && !tag.is_inbox_tag) {
        result.push(tag)
      }
    }
    return result.slice(0, 5)
  }

  onCardClick(event: MouseEvent): void {
    if (this.selectionMode || event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault()
      this.toggleSelect.emit(event)
      return
    }
    this.cardClick.emit(event)
  }

  onCheckClick(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.toggleSelect.emit(event)
  }
}
