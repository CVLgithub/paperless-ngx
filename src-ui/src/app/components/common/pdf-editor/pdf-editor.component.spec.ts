import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { DocumentService } from 'src/app/services/rest/document.service'
import { PDFEditorComponent } from './pdf-editor.component'

describe('PDFEditorComponent', () => {
  let component: PDFEditorComponent
  let fixture: ComponentFixture<PDFEditorComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PDFEditorComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: NgbActiveModal, useValue: {} },
      ],
    }).compileComponents()
    fixture = TestBed.createComponent(PDFEditorComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should return correct operations with no changes', () => {
    component.pages = [
      { page: 1, rotate: 0, splitAfter: false },
      { page: 2, rotate: 0, splitAfter: false },
      { page: 3, rotate: 0, splitAfter: false },
    ]
    const ops = component.getOperations()
    expect(ops).toEqual([
      { page: 1, rotate: 0, doc: 0 },
      { page: 2, rotate: 0, doc: 0 },
      { page: 3, rotate: 0, doc: 0 },
    ])
  })

  it('should rotate, delete and reorder pages', () => {
    component.pages = [
      { page: 1, rotate: 0, splitAfter: false, selected: false },
      { page: 2, rotate: 0, splitAfter: false, selected: false },
    ]
    component.toggleSelection(0)
    component.rotateSelected(90)
    expect(component.pages[0].rotate).toBe(90)
    component.toggleSelection(0) // deselect
    component.toggleSelection(1)
    component.deleteSelected()
    expect(component.pages.length).toBe(1)
    component.pages.push({ page: 2, rotate: 0, splitAfter: false })
    component.drop({ previousIndex: 0, currentIndex: 1 } as any)
    expect(component.pages[0].page).toBe(2)
    component.rotate(0)
    expect(component.pages[0].rotate).toBe(90)
  })

  it('should handle empty pages array', () => {
    component.pages = []
    expect(component.getOperations()).toEqual([])
  })

  it('should increment doc index after splitAfter', () => {
    component.pages = [
      { page: 1, rotate: 0, splitAfter: true },
      { page: 2, rotate: 0, splitAfter: false },
      { page: 3, rotate: 0, splitAfter: true },
      { page: 4, rotate: 0, splitAfter: false },
    ]
    const ops = component.getOperations()
    expect(ops).toEqual([
      { page: 1, rotate: 0, doc: 0 },
      { page: 2, rotate: 0, doc: 1 },
      { page: 3, rotate: 0, doc: 1 },
      { page: 4, rotate: 0, doc: 2 },
    ])
  })

  it('should include rotations in operations', () => {
    component.pages = [
      { page: 1, rotate: 90, splitAfter: false },
      { page: 2, rotate: 180, splitAfter: true },
      { page: 3, rotate: 270, splitAfter: false },
    ]
    const ops = component.getOperations()
    expect(ops).toEqual([
      { page: 1, rotate: 90, doc: 0 },
      { page: 2, rotate: 180, doc: 0 },
      { page: 3, rotate: 270, doc: 1 },
    ])
  })

  it('should handle remove operation', () => {
    component.pages = [
      { page: 1, rotate: 0, splitAfter: false, selected: false },
      { page: 2, rotate: 0, splitAfter: false, selected: true },
      { page: 3, rotate: 0, splitAfter: false, selected: false },
    ]
    component.remove(1) // remove page 2
    expect(component.pages.length).toBe(2)
    expect(component.pages[0].page).toBe(1)
    expect(component.pages[1].page).toBe(3)
  })

  it('should toggle splitAfter correctly', () => {
    component.pages = [
      { page: 1, rotate: 0, splitAfter: false },
      { page: 2, rotate: 0, splitAfter: false },
    ]
    component.toggleSplit(0)
    expect(component.pages[0].splitAfter).toBeTruthy()
    component.toggleSplit(1)
    expect(component.pages[1].splitAfter).toBeTruthy()
  })

  it('should select and deselect all pages', () => {
    component.pages = [
      { page: 1, rotate: 0, splitAfter: false, selected: false },
      { page: 2, rotate: 0, splitAfter: false, selected: false },
    ]
    component.selectAll()
    expect(component.pages.every((p) => p.selected)).toBeTruthy()
    expect(component.hasSelection()).toBeTruthy()
    component.deselectAll()
    expect(component.pages.every((p) => !p.selected)).toBeTruthy()
    expect(component.hasSelection()).toBeFalsy()
  })

  it('should handle pdf loading and page generation', () => {
    const mockPdf = {
      numPages: 3,
      getPage: (pageNum: number) => Promise.resolve({ pageNumber: pageNum }),
    }
    component.pdfLoaded(mockPdf as any)
    expect(component.totalPages).toBe(3)
    expect(component.pages.length).toBe(3)
    expect(component.pages[0].page).toBe(1)
    expect(component.pages[1].page).toBe(2)
    expect(component.pages[2].page).toBe(3)
  })

  it('should include selected version in preview source when provided', () => {
    const documentService = TestBed.inject(DocumentService)
    const previewSpy = jest
      .spyOn(documentService, 'getPreviewUrl')
      .mockReturnValue('preview-version')
    component.documentID.set(3)
    component.versionID.set(10)

    expect(component.pdfSrc).toBe('preview-version')
    expect(previewSpy).toHaveBeenCalledWith(3, false, 10)
  })

  it('should load the PDF once and destroy resources cleanly on unmount', async () => {
    const pdfjsLoader = await import('../pdf-viewer/pdfjs-loader')
    const destroySpy = jest.fn().mockResolvedValue(undefined)
    const cleanupSpy = jest.fn()
    const renderSpy = jest.fn().mockReturnValue({
      promise: Promise.resolve(),
      cancel: jest.fn(),
    })
    const getPageSpy = jest.fn().mockImplementation((pageNum: number) =>
      Promise.resolve({
        pageNumber: pageNum,
        getViewport: ({ scale }: { scale: number }) => ({
          width: 600 * scale,
          height: 800 * scale,
        }),
        render: renderSpy,
        cleanup: cleanupSpy,
      })
    )
    const mockPdf = { numPages: 3, getPage: getPageSpy }
    const getDocumentSpy = jest.fn().mockReturnValue({
      promise: Promise.resolve(mockPdf),
      destroy: destroySpy,
    })

    const loadPdfJsSpy = jest.spyOn(pdfjsLoader, 'loadPdfJs').mockResolvedValue({
      lib: {
        AnnotationMode: { DISABLE: 0 },
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: getDocumentSpy,
      },
      viewer: {},
    } as any)

    const origToDataURL = HTMLCanvasElement.prototype.toDataURL
    const origToBlob = HTMLCanvasElement.prototype.toBlob
    const origIO = globalThis.IntersectionObserver
    HTMLCanvasElement.prototype.toBlob = undefined as any
    HTMLCanvasElement.prototype.toDataURL = jest
      .fn()
      .mockReturnValue('data:image/jpeg;base64,thumb')
    globalThis.IntersectionObserver = class {
      constructor(private readonly cb: IntersectionObserverCallback) {}
      observe(target: Element) {
        const pageNum = Number((target as HTMLElement).dataset['page'])
        this.cb(
          [
            {
              isIntersecting: pageNum <= 2,
              target,
            } as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver
        )
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    try {
      const documentService = TestBed.inject(DocumentService)
      jest
        .spyOn(documentService, 'getPreviewUrl')
        .mockReturnValue('http://localhost/api/documents/19/preview/')

      component.documentID.set(19)
      fixture.detectChanges()

      // Allow async document load and sequential page render ticks to complete
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 15))
        fixture.detectChanges()
      }

      expect(getDocumentSpy).toHaveBeenCalledTimes(1)
      expect(component.totalPages).toBe(3)
      expect(component.pages.length).toBe(3)
      expect(component.pages[0].thumbnailUrl).toBe(
        'data:image/jpeg;base64,thumb'
      )
      expect(component.pages[1].thumbnailUrl).toBe(
        'data:image/jpeg;base64,thumb'
      )
      expect(component.pages[2].thumbnailUrl).toBeUndefined()
      expect(renderSpy).toHaveBeenCalledTimes(2)
      expect(renderSpy).toHaveBeenCalledWith(
        expect.objectContaining({ annotationMode: 0 })
      )
      expect(cleanupSpy).toHaveBeenCalledTimes(2)

      fixture.destroy()
      expect(destroySpy).toHaveBeenCalledTimes(1)
    } finally {
      HTMLCanvasElement.prototype.toDataURL = origToDataURL
      HTMLCanvasElement.prototype.toBlob = origToBlob
      globalThis.IntersectionObserver = origIO
      loadPdfJsSpy.mockRestore()
    }
  })
})
