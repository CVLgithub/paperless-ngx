import { Component, EventEmitter, Input, Output, inject } from '@angular/core'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { Correspondent } from 'src/app/data/correspondent'
import { Document } from 'src/app/data/document'
import { DocumentType } from 'src/app/data/document-type'
import { Tag } from 'src/app/data/tag'
import { CustomDatePipe } from 'src/app/pipes/custom-date.pipe'
import { DocumentTitlePipe } from 'src/app/pipes/document-title.pipe'
import { DocumentService } from 'src/app/services/rest/document.service'

@Component({
  selector: 'pngx-redesign-document-list-row',
  templateUrl: './redesign-document-list-row.component.html',
  styleUrls: ['./redesign-document-list-row.component.scss'],
  imports: [BootstrapIconComponent, CustomDatePipe, DocumentTitlePipe],
})
export class RedesignDocumentListRowComponent {
  private readonly documentService = inject(DocumentService)

  @Input({ required: true }) document!: Document
  @Input() selected = false
  @Input() selectionMode = false
  @Input() tagMap: Map<number, Tag> = new Map()
  @Input() correspondentMap: Map<number, Correspondent> = new Map()
  @Input() documentTypeMap: Map<number, DocumentType> = new Map()

  @Output() rowClick = new EventEmitter<MouseEvent>()
  @Output() toggleSelect = new EventEmitter<MouseEvent>()

  get thumbUrl(): string {
    return this.documentService.getThumbUrl(this.document.id)
  }

  get previewUrl(): string {
    return this.documentService.getPreviewUrl(this.document.id)
  }

  get correspondentName(): string {
    if (!this.document.correspondent) return ''
    return this.correspondentMap.get(this.document.correspondent)?.name ?? ''
  }

  get documentTypeName(): string {
    if (!this.document.document_type) return ''
    return this.documentTypeMap.get(this.document.document_type)?.name ?? ''
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
    return result.slice(0, 4)
  }

  onRowClick(event: MouseEvent): void {
    if (this.selectionMode || event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault()
      this.toggleSelect.emit(event)
      return
    }
    this.rowClick.emit(event)
  }

  onCheckClick(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.toggleSelect.emit(event)
  }
}
