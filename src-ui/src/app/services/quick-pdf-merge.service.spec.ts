import { HttpClient } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { PDFDocument } from 'pdf-lib'
import { of, throwError } from 'rxjs'
import { QuickPdfMergeService } from './quick-pdf-merge.service'
import { DocumentService } from './rest/document.service'
import { ToastService } from './toast.service'

async function createSamplePdfBytes(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([200, 300])
  }
  const bytes = await doc.save()
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  )
}

describe('QuickPdfMergeService', () => {
  let service: QuickPdfMergeService
  let http: { get: jest.Mock }
  let documentService: { getPreviewUrl: jest.Mock }
  let toastService: { show: jest.Mock; showError: jest.Mock }

  beforeEach(() => {
    http = {
      get: jest.fn(),
    }
    documentService = {
      getPreviewUrl: jest.fn(
        (id: number) => `http://localhost/api/documents/${id}/preview/#search="foo"`
      ),
    }
    toastService = {
      show: jest.fn(),
      showError: jest.fn(),
    }

    TestBed.configureTestingModule({
      providers: [
        QuickPdfMergeService,
        { provide: HttpClient, useValue: http },
        { provide: DocumentService, useValue: documentService },
        { provide: ToastService, useValue: toastService },
      ],
    })

    service = TestBed.inject(QuickPdfMergeService)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('merges PDFs in the requested order and strips URL hashes', async () => {
    const pdf1 = await createSamplePdfBytes(1)
    const pdf2 = await createSamplePdfBytes(2)

    http.get
      .mockReturnValueOnce(of(pdf1))
      .mockReturnValueOnce(of(pdf2))

    const mergedBytes = await service.mergeDocumentsToPdfBytes([11, 22])

    expect(http.get).toHaveBeenNthCalledWith(
      1,
      'http://localhost/api/documents/11/preview/',
      { responseType: 'arraybuffer' }
    )
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'http://localhost/api/documents/22/preview/',
      { responseType: 'arraybuffer' }
    )

    const parsed = await PDFDocument.load(mergedBytes)
    expect(parsed.getPageCount()).toBe(3)
  })

  it('navigates an existing placeholder tab to the merged PDF blob URL', async () => {
    const pdf1 = await createSamplePdfBytes(1)
    const pdf2 = await createSamplePdfBytes(1)
    http.get.mockReturnValueOnce(of(pdf1)).mockReturnValueOnce(of(pdf2))

    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:merged-pdf-url')

    const fakeTab = {
      closed: false,
      location: { replace: jest.fn() },
      focus: jest.fn(),
      close: jest.fn(),
    } as unknown as Window

    const blobUrl = await service.mergeAndOpenInNewTab([3, 4], fakeTab)

    expect(blobUrl).toBe('blob:merged-pdf-url')
    expect(fakeTab.location.replace).toHaveBeenCalledWith('blob:merged-pdf-url')
    expect(fakeTab.focus).toHaveBeenCalled()
    expect(toastService.showError).not.toHaveBeenCalled()
  })

  it('closes placeholder tab and shows error toast when fetching fails', async () => {
    http.get.mockReturnValue(throwError(() => new Error('HTTP 500')))

    const fakeTab = {
      closed: false,
      location: { replace: jest.fn() },
      focus: jest.fn(),
      close: jest.fn(),
    } as unknown as Window

    const result = await service.mergeAndOpenInNewTab([7, 8], fakeTab)

    expect(result).toBeNull()
    expect(fakeTab.close).toHaveBeenCalled()
    expect(toastService.showError).toHaveBeenCalled()
  })
})
