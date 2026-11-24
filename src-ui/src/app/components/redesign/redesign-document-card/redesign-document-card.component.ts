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
import { Document } from 'src/app/data/document'
import { DocumentType } from 'src/app/data/document-type'
import { Tag } from 'src/app/data/tag'
import { CustomDatePipe } from 'src/app/pipes/custom-date.pipe'
import { DocumentTitlePipe } from 'src/app/pipes/document-title.pipe'
import { DocumentService } from 'src/app/services/rest/document.service'

export type ThumbLoadState = 'loading' | 'loaded' | 'error'

const MAX_TAG_DOTS = 5

@Component({
  selector: 'pngx-redesign-document-card',
  templateUrl: './redesign-document-card.component.html',
  styleUrls: ['./redesign-document-card.component.scss'],
  imports: [BootstrapIconComponent, CustomDatePipe, DocumentTitlePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RedesignDocumentCardComponent {
  private readonly documentService = inject(DocumentService)

  readonly document = input.required<Document>()
  readonly selected = input(false)
  readonly selectionMode = input(false)
  readonly tagMap = input<Map<number, Tag>>(new Map())
  readonly documentTypeMap = input<Map<number, DocumentType>>(new Map())
  /** Above-the-fold card: load the thumbnail eagerly with high fetch priority. */
  readonly priority = input(false)

  readonly cardClick = output<MouseEvent>()
  readonly toggleSelect = output<MouseEvent>()

  readonly thumbUrl = computed(() =>
    this.documentService.getThumbUrl(this.document().id)
  )

  readonly previewUrl = computed(() =>
    this.documentService.getPreviewUrl(this.document().id)
  )

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
        if (result.length === MAX_TAG_DOTS) break
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

  onCardClick(event: MouseEvent): void {
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
    this.cardClick.emit(event)
  }

  onCheckClick(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.toggleSelect.emit(event)
  }
}
