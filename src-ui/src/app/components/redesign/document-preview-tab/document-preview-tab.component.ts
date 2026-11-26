import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { DomSanitizer, SafeResourceUrl, Title } from '@angular/platform-browser'
import { ActivatedRoute } from '@angular/router'
import { combineLatest, of } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { DocumentService } from 'src/app/services/rest/document.service'

@Component({
  selector: 'pngx-document-preview-tab',
  templateUrl: './document-preview-tab.component.html',
  styleUrl: './document-preview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPreviewTabComponent implements OnInit {
  private readonly route = inject(ActivatedRoute)
  private readonly documentService = inject(DocumentService)
  private readonly sanitizer = inject(DomSanitizer)
  private readonly titleService = inject(Title)

  private readonly previewFrame =
    viewChild<ElementRef<HTMLIFrameElement>>('previewFrame')

  readonly rawPreviewUrl = signal<string | null>(null)
  readonly safePreviewUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.rawPreviewUrl()
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null
  })
  readonly pageTitle = signal<string>('')
  readonly invalidId = signal<boolean>(false)

  private readonly params$ = combineLatest([
    this.route.paramMap,
    this.route.queryParamMap,
  ]).pipe(
    map(([params, queryParams]) => {
      const idParam = params.get('id')
      const docId =
        idParam && /^\d+$/.test(idParam) ? Number.parseInt(idParam, 10) : NaN
      const versionParam = queryParams.get('version')
      const versionId =
        versionParam && /^\d+$/.test(versionParam)
          ? Number.parseInt(versionParam, 10)
          : null
      const original = queryParams.get('original') === 'true'
      return { docId, versionId, original }
    }),
    takeUntilDestroyed()
  )

  ngOnInit(): void {
    this.params$
      .pipe(
        switchMap(({ docId, versionId, original }) => {
          if (!Number.isFinite(docId) || docId <= 0) {
            this.invalidId.set(true)
            this.rawPreviewUrl.set(null)
            const fallback = $localize`Dokument`
            this.pageTitle.set(fallback)
            this.titleService.setTitle(fallback)
            return of(null)
          }

          this.invalidId.set(false)
          this.rawPreviewUrl.set(
            this.documentService.getPreviewUrl(docId, original, versionId)
          )

          const fallbackTitle = $localize`Dokument #${docId}`
          this.pageTitle.set(fallbackTitle)
          this.titleService.setTitle(fallbackTitle)

          return this.documentService
            .get(docId, null, 'id,title')
            .pipe(catchError(() => of(null)))
        })
      )
      .subscribe((doc) => {
        const title = doc?.title?.trim()
        if (title) {
          this.pageTitle.set(title)
          this.titleService.setTitle(title)
        }
      })
  }

  onFrameLoad(): void {
    try {
      this.previewFrame()?.nativeElement.focus()
    } catch {
      // Ignore focus errors if browser restricts iframe focus
    }
  }
}
