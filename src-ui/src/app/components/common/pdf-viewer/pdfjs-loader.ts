import type * as PdfJsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type * as PdfJsViewer from 'pdfjs-dist/web/pdf_viewer.mjs'

export interface PdfJsModules {
  lib: typeof PdfJsLib
  viewer: typeof PdfJsViewer
}

let loadedModules: PdfJsModules | undefined
let loadingModules: Promise<PdfJsModules> | undefined

/**
 * Returns the pdf.js modules if they have already been loaded, otherwise undefined.
 */
export function getLoadedPdfJs(): PdfJsModules | undefined {
  return loadedModules
}

/**
 * Lazily loads pdf.js (kept out of the initial bundle). The modules are only
 * fetched once, subsequent calls share the same promise.
 */
export function loadPdfJs(): Promise<PdfJsModules> {
  if (!loadingModules) {
    loadingModules = (async () => {
      const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
      // pdf_viewer.mjs relies on globalThis.pdfjsLib, which pdf.mjs sets up,
      // so it has to be evaluated afterwards.
      const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs')
      loadedModules = { lib, viewer }
      return loadedModules
    })()
    // allow a retry (e.g. after a network error)
    loadingModules.catch(() => (loadingModules = undefined))
  }
  return loadingModules
}

/**
 * Warms the pdf.js chunks once the browser is idle so that the first document
 * preview does not have to wait for them. No-op where requestIdleCallback is
 * unavailable (pdf.js is then simply loaded on first use).
 */
export function prefetchPdfJsWhenIdle(timeout: number = 5000): void {
  if (loadingModules || typeof requestIdleCallback !== 'function') return
  requestIdleCallback(() => loadPdfJs().catch(() => undefined), { timeout })
}
