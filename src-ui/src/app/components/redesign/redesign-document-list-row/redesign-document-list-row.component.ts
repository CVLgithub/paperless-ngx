import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { Correspondent } from 'src/app/data/correspondent'
import { Document } from 'src/app/data/document'
import { DocumentType } from 'src/app/data/document-type'
import { Tag } from 'src/app/data/tag'
import { CustomDatePipe } from 'src/app/pipes/custom-date.pipe'
import { DocumentTitlePipe } from 'src/app/pipes/document-title.pipe'
import { DocumentService } from 'src/app/services/rest/document.service'
import { ThumbLoadState } from '../redesign-document-card/redesign-document-card.component'

const MAX_TAG_PILLS = 4

@Component({
  selector: 'pngx-redesign-document-list-row',
  templateUrl: './redesign-document-list-row.component.html',
  styleUrls: ['./redesign-document-list-row.component.scss'],
  imports: [BootstrapIconComponent, CustomDatePipe, DocumentTitlePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RedesignDocumentListRowComponent {
  private readonly documentService = inject(DocumentService)

  readonly document = input.required<Document>()
  readonly selected = input(false)
  readonly selectionMode = input(false)
  readonly tagMap = input<Map<number, Tag>>(new Map())
  readonly correspondentMap = input<Map<number, Correspondent>>(new Map())
  readonly documentTypeMap = input<Map<number, DocumentType>>(new Map())
  /** Above-the-fold row: load the thumbnail eagerly with high fetch priority. */
  readonly priority = input(false)

  readonly rowClick = output<MouseEvent>()
  readonly toggleSelect = output<MouseEvent>()

  readonly thumbUrl = computed(() =>
    this.documentService.getThumbUrl(this.document().id)
  )

  readonly previewUrl = computed(() =>
    this.documentService.getPreviewUrl(this.document().id)
  )

  readonly correspondentName = computed(() => {
    const correspondentId = this.document().correspondent
    if (!correspondentId) return ''
    return this.correspondentMap().get(correspondentId)?.name ?? ''
  })

  readonly documentTypeName = computed(() => {
    const typeId = this.document().document_type
    if (!typeId) return ''
    return this.documentTypeMap().get(typeId)?.name ?? ''
  })

  readonly resolvedTags = computed<Tag[]>(() => {
    const tagIds = this.document().tags
    if (!tagIds?.length) return []
    const tagMap = this.tagMap()
    const result: Tag[] = []
    for (const id of tagIds) {
      const tag = tagMap.get(id)
      if (tag && !tag.is_inbox_tag) {
        result.push(tag)
        if (result.length === MAX_TAG_PILLS) break
      }
    }
    return result
  })

  /** Resets to 'loading' whenever the thumbnail URL actually changes. */
  readonly thumbState = linkedSignal<string, ThumbLoadState>({
    source: this.thumbUrl,
    computation: () => 'loading',
  })

  onThumbLoad(): void {
    this.thumbState.set('loaded')
  }

  onThumbError(): void {
    this.thumbState.set('error')
  }

  onRowClick(event: MouseEvent): void {
    if (
      this.selectionMode() ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
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
