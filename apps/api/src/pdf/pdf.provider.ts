import type { Provider } from '@nestjs/common';
import { LambdaPdfRenderer } from './lambda-pdf-renderer';
import { LocalChromiumPdfRenderer } from './local-chromium-pdf-renderer';
import { PdfRenderer } from './pdf-renderer';

/**
 * Same convention as every other port here: an explicit `PDF_RENDERER` wins, and the
 * local driver is the default whenever we are not in production.
 */
export function selectPdfRenderer(): typeof LocalChromiumPdfRenderer | typeof LambdaPdfRenderer {
  const configured = process.env.PDF_RENDERER;
  if (configured === 'lambda') return LambdaPdfRenderer;
  if (configured === 'local-chromium') return LocalChromiumPdfRenderer;

  return process.env.NODE_ENV === 'production' ? LambdaPdfRenderer : LocalChromiumPdfRenderer;
}

export const pdfRendererProvider: Provider = {
  provide: PdfRenderer,
  useClass: selectPdfRenderer(),
};
