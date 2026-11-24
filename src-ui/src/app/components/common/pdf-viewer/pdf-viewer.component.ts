import {
  AfterViewInit,
  Component,
  DOCUMENT,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'
// Only types are imported statically, pdf.js itself is loaded lazily (see pdfjs-loader.ts)
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import type {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFSinglePageViewer,
  PDFViewer,
} from 'pdfjs-dist/web/pdf_viewer.mjs'
import {
  PdfRenderMode,
  PdfZoomLevel,
  PdfZoomScale,
  PngxPdfDocumentProxy,
} from './pdf-viewer.types'
import { getLoadedPdfJs, loadPdfJs, PdfJsModules } from './pdfjs-loader'

@Component({
  selector: 'pngx-pdf-viewer',
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss',
})
export class PngxPdfViewerComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  private readonly document = inject<Document>(DOCUMENT)

  @Input() src!: string
  @Input() sourceRevision = 0
  @Input() password?: string
  @Input() page?: number
  @Output() pageChange = new EventEmitter<number>()
  @Input() rotation?: number
  @Input() renderMode: PdfRenderMode = PdfRenderMode.All
  @Input() selectable = true
  @Input() searchQuery = ''
  @Input() zoom: PdfZoomLevel = PdfZoomLevel.One
  @Input() zoomScale: PdfZoomScale = PdfZoomScale.PageWidth

  @Output() afterLoadComplete = new EventEmitter<PngxPdfDocumentProxy>()
  @Output() rendered = new EventEmitter<void>()
  @Output() loadError = new EventEmitter<unknown>()

  @ViewChild('container', { static: true })
  private readonly container!: ElementRef<HTMLDivElement>

  @ViewChild('viewer', { static: true })
  private readonly viewer!: ElementRef<HTMLDivElement>

  private hasLoaded = false
  private loadingTask?: PDFDocumentLoadingTask
  private resizeObserver?: ResizeObserver
  private pdf?: PDFDocumentProxy
  private pdfViewer?: PDFViewer | PDFSinglePageViewer
  private hasRenderedPage = false
  private lastFindQuery = ''
  private lastViewerPage?: number
  private loadId = 0
  private destroyed = false

  private pdfjs?: PdfJsModules
  private eventBus?: EventBus
  private linkService?: PDFLinkService
  private findController?: PDFFindController

  constructor() {
    // pdf.js may already be loaded by a previous viewer instance
    const pdfjs = getLoadedPdfJs()
    if (pdfjs) {
      this.setupPdfJs(pdfjs)
    }
  }

  private setupPdfJs(pdfjs: PdfJsModules): void {
    if (this.pdfjs) {
      return
    }
    this.pdfjs = pdfjs
    const { EventBus, LinkTarget, PDFFindController, PDFLinkService } =
      pdfjs.viewer
    this.eventBus = new EventBus()
    this.linkService = new PDFLinkService({
      eventBus: this.eventBus,
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: 'noopener noreferrer nofollow',
    })
    this.findController = new PDFFindController({
      eventBus: this.eventBus,
      linkService: this.linkService,
      updateMatchesCountOnProgress: false,
    })
  }

  private async ensurePdfJs(): Promise<PdfJsModules> {
    if (!this.pdfjs) {
      this.setupPdfJs(await loadPdfJs())
    }
    return this.pdfjs!
  }

  private readonly onPageRendered = () => {
    this.hasRenderedPage = true
    this.dispatchFindIfReady()
    this.rendered.emit()
  }
  private readonly onPagesInit = () => this.applyViewerState()
  private readonly onPageChanging = (evt: { pageNumber: number }) => {
    // Avoid [(page)] two-way binding re-triggers navigation
    this.lastViewerPage = evt.pageNumber
    this.pageChange.emit(evt.pageNumber)
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['src'] || changes['sourceRevision'] || changes['password']) {
      this.resetViewerState()
      if (this.src) {
        this.loadDocument()
      }
      return
    }

    if (changes['zoomScale']) {
      this.setupResizeObserver()
    }

    if (changes['selectable'] || changes['renderMode']) {
      this.initViewer()
    }

    if (
      changes['page'] ||
      changes['zoom'] ||
      changes['zoomScale'] ||
      changes['rotation']
    ) {
      // Prevent loop with page / scale application see https://github.com/paperless-ngx/paperless-ngx/issues/13404
      this.applyViewerState(
        !!(changes['zoom'] || changes['zoomScale'] || changes['rotation'])
      )
    }

    if (changes['searchQuery']) {
      this.dispatchFindIfReady()
    }
  }

  ngAfterViewInit(): void {
    this.setupResizeObserver()
    if (this.pdfjs) {
      this.afterPdfJsReady()
      return
    }
    this.ensurePdfJs().then(
      () => {
        if (!this.destroyed) {
          this.afterPdfJsReady()
        }
      },
      (err) => {
        // if a document load is pending, loadDocument() reports the error
        if (!this.destroyed && !this.hasLoaded) {
          this.loadError.emit(err)
        }
      }
    )
  }

  private afterPdfJsReady(): void {
    this.initViewer()
    if (!this.hasLoaded) {
      this.loadDocument()
      return
    }
    if (this.pdf) {
      this.applyViewerState()
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.eventBus?.off('pagerendered', this.onPageRendered)
    this.eventBus?.off('pagesinit', this.onPagesInit)
    this.eventBus?.off('pagechanging', this.onPageChanging)
    this.resizeObserver?.disconnect()
    this.loadingTask?.destroy()
    this.pdfViewer?.cleanup()
    this.pdfViewer = undefined
  }

  private resetViewerState(): void {
    this.hasLoaded = false
    this.hasRenderedPage = false
    this.lastFindQuery = ''
    this.lastViewerPage = undefined
    this.loadingTask?.destroy()
    this.loadingTask = undefined
    this.pdf = undefined
    this.linkService?.setDocument(null)
    if (this.pdfViewer) {
      this.pdfViewer.setDocument(null)
      this.pdfViewer.currentPageNumber = 1
    }
  }

  private async loadDocument(): Promise<void> {
    if (this.hasLoaded) {
      return
    }

    this.hasLoaded = true
    this.hasRenderedPage = false
    this.lastFindQuery = ''
    this.loadingTask?.destroy()

    const loadId = ++this.loadId
    let pdfjs = this.pdfjs
    if (!pdfjs) {
      try {
        pdfjs = await this.ensurePdfJs()
      } catch (err) {
        if (!this.destroyed && loadId === this.loadId) {
          this.loadError.emit(err)
        }
        return
      }
      // bail out if destroyed or the source changed while loading pdf.js
      if (this.destroyed || loadId !== this.loadId || !this.hasLoaded) {
        return
      }
    }

    pdfjs.lib.GlobalWorkerOptions.workerSrc = new URL(
      'assets/js/pdf.worker.min.mjs',
      this.document.baseURI
    ).toString()
    const initOptions = {
      url: this.src,
      password: this.password,
      withCredentials: true,
      wasmUrl: new URL('assets/wasm/', this.document.baseURI).toString(),
      iccUrl: new URL('assets/iccs/', this.document.baseURI).toString(),
      cMapUrl: new URL('assets/cmaps/', this.document.baseURI).toString(),
    }
    this.loadingTask = pdfjs.lib.getDocument(initOptions)
    try {
      const pdf = await this.loadingTask.promise
      this.pdf = pdf
      this.linkService!.setDocument(pdf)
      this.findController!.onIsPageVisible = () => true
      this.pdfViewer?.setDocument(pdf)
      this.applyViewerState()
      this.afterLoadComplete.emit(pdf)
    } catch (err) {
      this.loadError.emit(err)
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = new ResizeObserver(() => {
      this.applyScale()
    })
    this.resizeObserver.observe(this.container.nativeElement)
  }

  private initViewer(): void {
    if (!this.pdfjs) {
      // will be initialized once pdf.js has been loaded, see ngAfterViewInit
      return
    }
    const { PDFSinglePageViewer, PDFViewer } = this.pdfjs.viewer
    const eventBus = this.eventBus!
    this.viewer.nativeElement.innerHTML = ''
    this.pdfViewer?.cleanup()
    this.hasRenderedPage = false
    this.lastFindQuery = ''

    const textLayerMode = this.selectable === false ? 0 : 1
    const options = {
      container: this.container.nativeElement,
      viewer: this.viewer.nativeElement,
      eventBus,
      linkService: this.linkService,
      findController: this.findController,
      textLayerMode,
      annotationMode: this.pdfjs.lib.AnnotationMode.ENABLE,
      enableSelectionRendering: false,
      removePageBorders: true,
    }

    this.pdfViewer =
      this.renderMode === PdfRenderMode.Single
        ? new PDFSinglePageViewer(options)
        : new PDFViewer(options)
    this.linkService!.setViewer(this.pdfViewer)

    eventBus.off('pagerendered', this.onPageRendered)
    eventBus.off('pagesinit', this.onPagesInit)
    eventBus.off('pagechanging', this.onPageChanging)
    eventBus.on('pagerendered', this.onPageRendered)
    eventBus.on('pagesinit', this.onPagesInit)
    eventBus.on('pagechanging', this.onPageChanging)

    if (this.pdf) {
      this.pdfViewer.setDocument(this.pdf)
      this.applyViewerState()
    }
  }

  private applyViewerState(applyScale = true): void {
    if (!this.pdfViewer) {
      return
    }
    const hasPages = this.pdfViewer.pagesCount > 0
    if (typeof this.rotation === 'number' && hasPages) {
      this.pdfViewer.pagesRotation = this.rotation
    }
    if (
      typeof this.page === 'number' &&
      hasPages &&
      this.page !== this.lastViewerPage
    ) {
      const nextPage = Math.min(
        Math.max(Math.trunc(this.page), 1),
        this.pdfViewer.pagesCount
      )
      if (nextPage !== this.pdfViewer.currentPageNumber) {
        this.pdfViewer.currentPageNumber = nextPage
      }
    }
    if (this.page === this.lastViewerPage) {
      this.lastViewerPage = undefined
    }
    if (hasPages && applyScale) {
      this.applyScale()
    }
    this.dispatchFindIfReady()
  }

  private applyScale(): void {
    if (!this.pdfViewer) {
      return
    }
    if (this.pdfViewer.pagesCount === 0) {
      return
    }
    const zoomFactor = Number(this.zoom) || 1
    this.pdfViewer.currentScaleValue = this.zoomScale
    if (zoomFactor !== 1) {
      this.pdfViewer.currentScale = this.pdfViewer.currentScale * zoomFactor
    }
  }

  private dispatchFindIfReady(): void {
    if (!this.hasRenderedPage) {
      return
    }
    const query = this.searchQuery?.trim()
    if (query === this.lastFindQuery) {
      return
    }
    this.lastFindQuery = query
    this.eventBus?.dispatch('find', {
      query,
      caseSensitive: false,
      highlightAll: query?.length > 0,
      phraseSearch: true,
    })
  }
}
