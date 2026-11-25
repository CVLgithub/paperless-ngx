import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop'
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChild,
  ViewChildren,
  effect,
  inject,
  signal,
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import { Subscription } from 'rxjs'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import { SETTINGS_KEYS } from 'src/app/data/ui-settings'
import { DocumentService } from 'src/app/services/rest/document.service'
import { SettingsService } from 'src/app/services/settings.service'
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component'
import {
  PdfRenderMode,
  PngxPdfDocumentProxy,
} from '../pdf-viewer/pdf-viewer.types'
import { loadPdfJs } from '../pdf-viewer/pdfjs-loader'
import { PdfEditorEditMode } from './pdf-editor-edit-mode'

const THUMBNAIL_MAX_CSS_PX = 240
const THUMBNAIL_JPEG_QUALITY = 0.84

interface PageOperation {
  page: number
  rotate: number
  splitAfter: boolean
  selected?: boolean
  loaded?: boolean
  thumbnailUrl?: string
}

@Component({
  selector: 'pngx-pdf-editor',
  templateUrl: './pdf-editor.component.html',
  styleUrl: './pdf-editor.component.scss',
  imports: [DragDropModule, FormsModule, BootstrapIconComponent],
})
export class PDFEditorComponent
  extends ConfirmDialogComponent
  implements AfterViewInit, OnDestroy
{
  PdfRenderMode = PdfRenderMode
  public PdfEditorEditMode = PdfEditorEditMode

  private readonly documentService = inject(DocumentService)
  private readonly settingsService = inject(SettingsService)
  private readonly document = inject<Document>(DOCUMENT)
  private readonly cdr = inject(ChangeDetectorRef)
  activeModal: NgbActiveModal = inject(NgbActiveModal)

  @ViewChild('modalBody')
  private readonly modalBody?: ElementRef<HTMLDivElement>

  @ViewChildren('pageItem')
  private readonly pageItems?: QueryList<ElementRef<HTMLElement>>

  readonly documentID = signal<number>(undefined)
  readonly versionID = signal<number>(undefined)
  readonly isLoadingDocument = signal<boolean>(false)
  readonly loadError = signal<boolean>(false)

  pages: PageOperation[] = []
  totalPages = 0
  editMode: PdfEditorEditMode = this.settingsService.get(
    SETTINGS_KEYS.PDF_EDITOR_DEFAULT_EDIT_MODE
  )
  deleteOriginal: boolean = false
  includeMetadata: boolean = true

  private loadingTask?: PDFDocumentLoadingTask
  private pdfDoc?: PDFDocumentProxy
  private activeRenderTask?: RenderTask
  private scratchCanvas?: HTMLCanvasElement
  private intersectionObserver?: IntersectionObserver
  private pageItemsSub?: Subscription

  private readonly thumbnailCache = new Map<number, string>()
  private readonly visiblePages = new Set<number>()
  private readonly attemptedPages = new Set<number>()
  private readonly pageElements = new Map<number, HTMLElement>()
  private annotationDisableMode = 0
  private isRendering = false
  private viewInitialized = false
  private destroyed = false
  private loadId = 0
  private loadedSrc?: string

  constructor() {
    super()
    effect(() => {
      const docId = this.documentID()
      // Track versionID so switching versions triggers a fresh load
      this.versionID()
      if (!this.viewInitialized || docId === undefined || docId === null) {
        return
      }
      const src = this.pdfSrc
      if (src && src !== this.loadedSrc) {
        void this.loadDocument(src)
      }
    })
  }

  get pdfSrc(): string {
    return this.documentService.getPreviewUrl(
      this.documentID(),
      false,
      this.versionID()
    )
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true
    this.pageItemsSub = this.pageItems?.changes.subscribe(() => {
      this.observePageItems()
    })
    const docId = this.documentID()
    if (docId !== undefined && docId !== null) {
      const src = this.pdfSrc
      if (src && src !== this.loadedSrc) {
        void this.loadDocument(src)
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.loadId++
    this.pageItemsSub?.unsubscribe()
    this.teardownPdfResources()
  }

  pdfLoaded(pdf: PngxPdfDocumentProxy) {
    this.totalPages = pdf.numPages
    this.pages = Array.from({ length: this.totalPages }, (_, i) => ({
      page: i + 1,
      rotate: 0,
      splitAfter: false,
      selected: false,
      loaded: false,
    }))
    if (this.isRenderablePdfProxy(pdf)) {
      this.pdfDoc = pdf
    }
    this.cdr.markForCheck()
    if (this.viewInitialized && this.pdfDoc) {
      setTimeout(() => {
        if (!this.destroyed) {
          this.observePageItems()
        }
      }, 0)
    }
  }

  toggleSelection(i: number) {
    this.pages[i].selected = !this.pages[i].selected
  }

  rotate(i: number, counterclockwise: boolean = false) {
    this.pages[i].rotate =
      (this.pages[i].rotate + (counterclockwise ? -90 : 90) + 360) % 360
  }

  rotateSelected(dir: number) {
    for (let p of this.pages) {
      if (p.selected) {
        p.rotate = (p.rotate + dir + 360) % 360
      }
    }
  }

  remove(i: number) {
    this.pages.splice(i, 1)
  }

  toggleSplit(i: number) {
    this.pages[i].splitAfter = !this.pages[i].splitAfter
    if (this.pages[i].splitAfter) {
      // force create mode
      this.editMode = PdfEditorEditMode.Create
    }
  }

  selectAll() {
    this.pages.forEach((p) => (p.selected = true))
  }

  deselectAll() {
    this.pages.forEach((p) => (p.selected = false))
  }

  deleteSelected() {
    this.pages = this.pages.filter((p) => !p.selected)
  }

  hasSelection(): boolean {
    return this.pages.some((p) => p.selected)
  }

  hasSplit(): boolean {
    return this.pages.some((p) => p.splitAfter)
  }

  drop(event: CdkDragDrop<PageOperation[]>) {
    moveItemInArray(this.pages, event.previousIndex, event.currentIndex)
  }

  getOperations() {
    return this.pages.map((p, idx) => ({
      page: p.page,
      rotate: p.rotate,
      doc: this.computeDocIndex(idx),
    }))
  }

  private computeDocIndex(index: number): number {
    let docIndex = 0
    for (let i = 0; i <= index; i++) {
      if (this.pages[i].splitAfter && i < index) docIndex++
    }
    return docIndex
  }

  private isRenderablePdfProxy(
    pdf: PngxPdfDocumentProxy
  ): pdf is PDFDocumentProxy {
    return typeof (pdf as Partial<PDFDocumentProxy>)?.getPage === 'function'
  }

  private async loadDocument(src: string): Promise<void> {
    this.loadedSrc = src
    const currentLoadId = ++this.loadId
    this.teardownPdfResources()
    this.pages = []
    this.totalPages = 0
    this.loadError.set(false)
    this.isLoadingDocument.set(true)

    try {
      const pdfjs = await loadPdfJs()
      if (this.destroyed || currentLoadId !== this.loadId) {
        return
      }

      this.annotationDisableMode = pdfjs.lib.AnnotationMode?.DISABLE ?? 0
      pdfjs.lib.GlobalWorkerOptions.workerSrc = new URL(
        'assets/js/pdf.worker.min.mjs',
        this.document.baseURI
      ).toString()

      const loadingTask = pdfjs.lib.getDocument({
        url: src,
        withCredentials: true,
        wasmUrl: new URL('assets/wasm/', this.document.baseURI).toString(),
        iccUrl: new URL('assets/iccs/', this.document.baseURI).toString(),
        cMapUrl: new URL('assets/cmaps/', this.document.baseURI).toString(),
      })
      this.loadingTask = loadingTask

      const pdf = await loadingTask.promise
      if (this.destroyed || currentLoadId !== this.loadId) {
        void loadingTask.destroy()
        return
      }

      this.pdfDoc = pdf
      this.isLoadingDocument.set(false)
      this.pdfLoaded(pdf)
    } catch {
      if (!this.destroyed && currentLoadId === this.loadId) {
        this.isLoadingDocument.set(false)
        this.loadError.set(true)
        this.cdr.markForCheck()
      }
    }
  }

  private observePageItems(): void {
    if (this.destroyed || !this.pdfDoc || !this.pages.length) {
      return
    }

    this.pageElements.clear()
    const elements = this.pageItems?.toArray() ?? []
    if (
      typeof IntersectionObserver === 'undefined' ||
      elements.length === 0
    ) {
      for (const p of this.pages) {
        if (!this.thumbnailCache.has(p.page) && !this.attemptedPages.has(p.page)) {
          this.visiblePages.add(p.page)
        }
      }
      if (this.visiblePages.size > 0 && !this.isRendering) {
        void this.processRenderQueue(this.loadId)
      }
      return
    }

    this.intersectionObserver?.disconnect()
    this.visiblePages.clear()
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        let addedVisible = false
        for (const entry of entries) {
          const pageNum = Number(
            (entry.target as HTMLElement).dataset['page']
          )
          if (!Number.isFinite(pageNum) || pageNum <= 0) continue

          if (
            entry.isIntersecting &&
            !this.thumbnailCache.has(pageNum) &&
            !this.attemptedPages.has(pageNum)
          ) {
            this.visiblePages.add(pageNum)
            addedVisible = true
          } else {
            this.visiblePages.delete(pageNum)
          }
        }
        if (addedVisible && !this.isRendering) {
          void this.processRenderQueue(this.loadId)
        }
      },
      {
        root: this.modalBody?.nativeElement ?? null,
        rootMargin: '200px 0px',
        threshold: 0.01,
      }
    )

    for (const ref of elements) {
      const el = ref.nativeElement
      const pageNum = Number(el.dataset['page'])
      if (
        pageNum > 0 &&
        !this.thumbnailCache.has(pageNum) &&
        !this.attemptedPages.has(pageNum)
      ) {
        this.pageElements.set(pageNum, el)
        this.intersectionObserver.observe(el)
      }
    }
  }

  private pickNextVisiblePage(): number | undefined {
    for (const p of this.pages) {
      if (
        this.visiblePages.has(p.page) &&
        !this.thumbnailCache.has(p.page) &&
        !this.attemptedPages.has(p.page)
      ) {
        return p.page
      }
    }
    return undefined
  }

  private async processRenderQueue(expectedLoadId: number): Promise<void> {
    if (this.isRendering) {
      return
    }
    this.isRendering = true

    try {
      while (
        !this.destroyed &&
        expectedLoadId === this.loadId &&
        this.pdfDoc
      ) {
        const pageNum = this.pickNextVisiblePage()
        if (pageNum === undefined) {
          break
        }

        await this.renderPageThumbnail(pageNum, expectedLoadId)

        // Yield to a browser paint frame between pages so thumbnails appear
        // progressively and hover, rotation, scrolling, and modal close stay
        // immediately responsive even on large scanned PDFs.
        if (!this.destroyed && expectedLoadId === this.loadId) {
          await this.yieldToNextFrame()
        }
      }
    } finally {
      this.isRendering = false
      this.releaseScratchCanvas()
    }
  }

  private yieldToNextFrame(): Promise<void> {
    const win = this.document.defaultView
    if (!win || typeof win.requestAnimationFrame !== 'function') {
      return new Promise((resolve) => setTimeout(resolve, 0))
    }
    return new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      const fallback = setTimeout(done, 50)
      win.requestAnimationFrame(() => {
        clearTimeout(fallback)
        done()
      })
    })
  }

  private async renderPageThumbnail(
    pageNum: number,
    expectedLoadId: number
  ): Promise<void> {
    if (!this.pdfDoc || this.destroyed || expectedLoadId !== this.loadId) {
      return
    }

    let pdfPage: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined
    try {
      pdfPage = await this.pdfDoc.getPage(pageNum)
      if (this.destroyed || expectedLoadId !== this.loadId) {
        return
      }

      const baseViewport = pdfPage.getViewport({ scale: 1 })
      const dpr = Math.min(
        this.document.defaultView?.devicePixelRatio || 1,
        2
      )
      const targetMaxPx = THUMBNAIL_MAX_CSS_PX * dpr
      const scale = Math.max(
        Math.min(
          targetMaxPx / Math.max(baseViewport.width, 1),
          targetMaxPx / Math.max(baseViewport.height, 1)
        ),
        0.1
      )
      const viewport = pdfPage.getViewport({ scale })

      const canvas = this.getScratchCanvas()
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))

      const renderTask = pdfPage.render({
        canvas,
        viewport,
        intent: 'display',
        annotationMode: this.annotationDisableMode,
        background: '#ffffff',
      })
      this.activeRenderTask = renderTask
      await renderTask.promise

      if (this.destroyed || expectedLoadId !== this.loadId) {
        return
      }

      const url = await this.canvasToThumbnailUrl(canvas)
      if (!url || this.destroyed || expectedLoadId !== this.loadId) {
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
        return
      }

      this.thumbnailCache.set(pageNum, url)
      this.attemptedPages.add(pageNum)
      this.visiblePages.delete(pageNum)
      const el = this.pageElements.get(pageNum)
      if (el) {
        this.intersectionObserver?.unobserve(el)
        this.pageElements.delete(pageNum)
      }
      const pageOp = this.pages.find((p) => p.page === pageNum)
      if (pageOp) {
        pageOp.thumbnailUrl = url
        pageOp.loaded = true
      }
      this.cdr.markForCheck()
    } catch (err) {
      // Ignore expected cancellations when closing the modal mid-render
      if ((err as { name?: string })?.name === 'RenderingCancelledException') {
        return
      }
      if (!this.destroyed && expectedLoadId === this.loadId) {
        this.attemptedPages.add(pageNum)
        this.visiblePages.delete(pageNum)
        const el = this.pageElements.get(pageNum)
        if (el) {
          this.intersectionObserver?.unobserve(el)
          this.pageElements.delete(pageNum)
        }
        const pageOp = this.pages.find((p) => p.page === pageNum)
        if (pageOp) {
          pageOp.loaded = true
        }
        this.cdr.markForCheck()
      }
    } finally {
      this.activeRenderTask = undefined
      pdfPage?.cleanup()
    }
  }

  private getScratchCanvas(): HTMLCanvasElement {
    if (!this.scratchCanvas) {
      this.scratchCanvas = this.document.createElement('canvas')
    }
    return this.scratchCanvas
  }

  private releaseScratchCanvas(): void {
    if (this.scratchCanvas) {
      this.scratchCanvas.width = 0
      this.scratchCanvas.height = 0
    }
  }

  private canvasToThumbnailUrl(
    canvas: HTMLCanvasElement
  ): Promise<string | null> {
    return new Promise((resolve) => {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(
          (blob) => {
            if (blob && typeof URL?.createObjectURL === 'function') {
              resolve(URL.createObjectURL(blob))
            } else {
              resolve(canvas.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY))
            }
          },
          'image/jpeg',
          THUMBNAIL_JPEG_QUALITY
        )
      } else {
        resolve(canvas.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY))
      }
    })
  }

  private teardownPdfResources(): void {
    this.visiblePages.clear()
    this.attemptedPages.clear()
    this.pageElements.clear()
    this.intersectionObserver?.disconnect()
    this.intersectionObserver = undefined

    try {
      this.activeRenderTask?.cancel()
    } catch {
      // ignore cancellation error if already completed
    }
    this.activeRenderTask = undefined

    const task = this.loadingTask
    this.loadingTask = undefined
    this.pdfDoc = undefined
    if (task) {
      void task.destroy()
    }

    for (const url of this.thumbnailCache.values()) {
      if (url.startsWith('blob:') && typeof URL?.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url)
      }
    }
    this.thumbnailCache.clear()
    this.releaseScratchCanvas()
    this.scratchCanvas = undefined
  }
}
