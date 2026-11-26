import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Title } from '@angular/platform-browser'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { BehaviorSubject, of, throwError } from 'rxjs'
import { DocumentService } from 'src/app/services/rest/document.service'
import { DocumentPreviewTabComponent } from './document-preview-tab.component'

describe('DocumentPreviewTabComponent', () => {
  let fixture: ComponentFixture<DocumentPreviewTabComponent>
  let component: DocumentPreviewTabComponent
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>
  let queryParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>
  let documentService: {
    get: jest.Mock
    getPreviewUrl: jest.Mock
  }
  let titleService: Title

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: '19' }))
    queryParamMap$ = new BehaviorSubject(convertToParamMap({}))
    documentService = {
      get: jest.fn().mockReturnValue(of({ id: 19, title: 'Mitschrift 3' })),
      getPreviewUrl: jest.fn(
        (id: number, original = false, versionID: number | null = null) => {
          const qs = new URLSearchParams()
          if (original) qs.set('original', 'true')
          if (versionID) qs.set('version', versionID.toString())
          const suffix = qs.toString() ? `?${qs.toString()}` : ''
          return `/api/documents/${id}/preview/${suffix}`
        }
      ),
    }

    await TestBed.configureTestingModule({
      imports: [DocumentPreviewTabComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            queryParamMap: queryParamMap$.asObservable(),
          },
        },
        { provide: DocumentService, useValue: documentService },
      ],
    }).compileComponents()

    titleService = TestBed.inject(Title)
    fixture = TestBed.createComponent(DocumentPreviewTabComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('sets the browser tab title to the Paperless document title and embeds the native preview URL', () => {
    expect(documentService.getPreviewUrl).toHaveBeenCalledWith(19, false, null)
    expect(documentService.get).toHaveBeenCalledWith(19, null, 'id,title')
    expect(titleService.getTitle()).toBe('Mitschrift 3')
    expect(component.pageTitle()).toBe('Mitschrift 3')

    const iframe: HTMLIFrameElement =
      fixture.nativeElement.querySelector('iframe.rd-preview-tab__frame')
    expect(iframe).not.toBeNull()
    expect(iframe.getAttribute('title')).toBe('Mitschrift 3')
  })

  it('forwards version and original query parameters to getPreviewUrl', () => {
    queryParamMap$.next(
      convertToParamMap({ version: '42', original: 'true' })
    )
    fixture.detectChanges()

    expect(documentService.getPreviewUrl).toHaveBeenLastCalledWith(19, true, 42)
  })

  it('falls back to a document ID title when loading metadata fails', () => {
    documentService.get.mockReturnValueOnce(
      throwError(() => new Error('network'))
    )
    paramMap$.next(convertToParamMap({ id: '77' }))
    fixture.detectChanges()

    expect(titleService.getTitle()).toBe('Dokument #77')
    expect(component.invalidId()).toBe(false)
    expect(
      fixture.nativeElement.querySelector('iframe.rd-preview-tab__frame')
    ).not.toBeNull()
  })

  it('renders an error state for an invalid document ID', () => {
    paramMap$.next(convertToParamMap({ id: 'abc' }))
    fixture.detectChanges()

    expect(component.invalidId()).toBe(true)
    expect(
      fixture.nativeElement.querySelector('iframe.rd-preview-tab__frame')
    ).toBeNull()
    expect(
      fixture.nativeElement.querySelector('.rd-preview-tab__error')
    ).not.toBeNull()
  })
})
