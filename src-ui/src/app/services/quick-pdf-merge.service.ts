import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { DocumentService } from './rest/document.service'
import { ToastService } from './toast.service'

const PLACEHOLDER_HTML = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>PDF wird erstellt …</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #141416; color: #f5f5f7; }
    }
    .box {
      text-align: center;
      padding: 24px 32px;
      border-radius: 16px;
    }
    .spinner {
      width: 28px;
      height: 28px;
      margin: 0 auto 14px;
      border-radius: 50%;
      border: 3px solid rgba(128, 128, 128, 0.25);
      border-top-color: #0a84ff;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { margin: 0; font-size: 14px; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <p>Dokumente werden im Browser zusammengeführt …</p>
  </div>
</body>
</html>`

@Injectable({
  providedIn: 'root',
})
export class QuickPdfMergeService {
  private readonly http = inject(HttpClient)
  private readonly documentService = inject(DocumentService)
  private readonly toastService = inject(ToastService)

  openPlaceholderTab(): Window | null {
    const tab = window.open('', '_blank')
    if (tab && !tab.closed) {
      try {
        tab.document.open()
        tab.document.write(PLACEHOLDER_HTML)
        tab.document.close()
      } catch {
        // Ignore cross-origin or restricted tab document errors
      }
    }
    return tab
  }

  async mergeDocumentsToPdfBytes(documentIds: number[]): Promise<Uint8Array> {
    if (documentIds.length === 0) {
      throw new Error('Keine Dokumente ausgewählt.')
    }

    const buffers = await Promise.all(
      documentIds.map((id) => {
        const previewUrl = this.buildCleanPreviewUrl(id)
        return firstValueFrom(
          this.http.get(previewUrl, { responseType: 'arraybuffer' })
        )
      })
    )

    const { PDFDocument } = await import('pdf-lib')
    const mergedPdf = await PDFDocument.create()

    for (const buffer of buffers) {
      const sourcePdf = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
      })
      const copiedPages = await mergedPdf.copyPages(
        sourcePdf,
        sourcePdf.getPageIndices()
      )
      for (const page of copiedPages) {
        mergedPdf.addPage(page)
      }
    }

    return mergedPdf.save()
  }

  async mergeAndOpenInNewTab(
    documentIds: number[],
    existingTab?: Window | null
  ): Promise<string | null> {
    const targetTab =
      existingTab !== undefined ? existingTab : this.openPlaceholderTab()

    try {
      const mergedBytes = await this.mergeDocumentsToPdfBytes(documentIds)
      const blob = new Blob([new Uint8Array(mergedBytes)], {
        type: 'application/pdf',
      })
      const blobUrl = URL.createObjectURL(blob)

      if (targetTab && !targetTab.closed) {
        targetTab.location.replace(blobUrl)
        targetTab.focus()
      } else {
        const opened = window.open(blobUrl, '_blank')
        if (!opened) {
          this.toastService.show({
            content: $localize`PDF wurde zusammengeführt. Dein Browser hat den neuen Tab blockiert.`,
            delay: 10000,
            actionName: $localize`PDF öffnen`,
            action: () => {
              window.open(blobUrl, '_blank')
            },
          })
        }
      }

      return blobUrl
    } catch (error) {
      if (targetTab && !targetTab.closed) {
        targetTab.close()
      }
      this.toastService.showError(
        $localize`Die Dokumente konnten nicht als PDF zusammengeführt werden.`,
        error
      )
      return null
    }
  }

  private buildCleanPreviewUrl(documentId: number): string {
    const url = new URL(
      this.documentService.getPreviewUrl(documentId),
      window.location.origin
    )
    url.hash = ''
    return url.toString()
  }
}
