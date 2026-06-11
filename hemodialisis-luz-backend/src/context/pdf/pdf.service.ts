import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as PdfPrinter from 'pdfmake/src/printer';
import * as path from 'path';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

interface PdfMetaInfo {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
}

@Injectable()
export class PdfService {
  private readonly fonts: TFontDictionary = {
    Roboto: {
      normal: this.resolveFontPath('Roboto-Regular.ttf'),
      bold: this.resolveFontPath('Roboto-Bold.ttf'),
      italics: this.resolveFontPath('Roboto-Italic.ttf'),
      bolditalics: this.resolveFontPath('Roboto-BoldItalic.ttf'),
    },
  };

  private resolveFontPath(fileName: string): string {
    const candidates = [
      path.resolve(process.cwd(), 'dist/assets/fonts', fileName),
      path.resolve(process.cwd(), 'src/assets/fonts', fileName),
    ];

    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    if (existing) {
      return existing;
    }

    return candidates[0];
  }

  async generatePdf(
    getDefinition: () => TDocumentDefinitions,
    meta?: PdfMetaInfo,
  ): Promise<Buffer> {
    const docDefinition = getDefinition();
    const printer = new PdfPrinter(this.fonts);
    if (meta) {
      docDefinition.info = {
        ...meta,
      };
    }

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      pdfDoc.on('data', (chunk) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', (err) => reject(err));
      pdfDoc.end();
    });
  }
}
