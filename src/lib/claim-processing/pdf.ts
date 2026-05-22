import { inflateSync } from 'zlib';
import { PageText, FieldMethod } from './types';
import { normalizeWhitespace } from './utils';

const TEXT_PAGE_THRESHOLD = 40;
const TEXT_PACKET_THRESHOLD = 180;

const countPdfPages = (buffer: Buffer) => {
  const pdf = buffer.toString('latin1');
  return Math.max(1, (pdf.match(/\/Type\s*\/Page\b/g) || []).length);
};

const decodePdfHexText = (hex: string) => {
  try {
    return Buffer.from(hex, 'hex').toString('utf8');
  } catch {
    return '';
  }
};

const decodePdfLiteralText = (value: string) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');

const pageTextsFromCombinedText = (
  text: string,
  pageCount: number,
  confidence: number,
  method: FieldMethod = 'pdf_text'
): PageText[] => {
  const normalizedText = normalizeWhitespace(text);

  if (!normalizedText) {
    return Array.from({ length: pageCount }, (_, index) => ({
      page: index + 1,
      text: '',
      method,
      confidence: 0,
    }));
  }

  const chunkSize = Math.ceil(normalizedText.length / pageCount);

  return Array.from({ length: pageCount }, (_, index) => ({
    page: index + 1,
    text: normalizedText.slice(index * chunkSize, (index + 1) * chunkSize),
    method,
    confidence,
  }));
};

const extractPdfTextWithoutRendering = (buffer: Buffer, pageCount: number) => {
  const pdf = buffer.toString('latin1');
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const textChunks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(pdf))) {
    const rawStream = Buffer.from(match[1], 'latin1');
    let streamText = '';

    try {
      streamText = inflateSync(rawStream).toString('latin1');
    } catch {
      streamText = rawStream.toString('latin1');
    }

    for (const hexMatch of streamText.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const decoded = decodePdfHexText(hexMatch[1]);
      if (decoded.trim()) textChunks.push(decoded);
    }

    for (const literalMatch of streamText.matchAll(/\(([^()]*)\)\s*T[Jj]/g)) {
      const decoded = decodePdfLiteralText(literalMatch[1]);
      if (decoded.trim()) textChunks.push(decoded);
    }

    for (const arrayMatch of streamText.matchAll(/\[((?:\([^)]*\)|<[^>]+>|-?\d+(?:\.\d+)?|\s)+)\]\s*TJ/g)) {
      const arrayText = Array.from(arrayMatch[1].matchAll(/\(([^()]*)\)|<([0-9A-Fa-f]+)>/g))
        .map((part) => (part[1] ? decodePdfLiteralText(part[1]) : decodePdfHexText(part[2])))
        .join('');
      if (arrayText.trim()) textChunks.push(arrayText);
    }
  }

  const text = normalizeWhitespace(textChunks.join(' '));
  return {
    pageCount,
    pages: pageTextsFromCombinedText(text, pageCount, text.length >= TEXT_PACKET_THRESHOLD ? 92 : text.length > 0 ? 55 : 0),
    source: 'raw_pdf_text',
  };
};

async function extractPdfTextWithPdfParse(buffer: Buffer, pageCount: number) {
  try {
    const runtimeRequire = eval('require') as NodeRequire;
    const pdfParseModule = runtimeRequire('pdf-parse') as {
      PDFParse?: new (options: { data: Buffer }) => {
        getText: () => Promise<{
          text?: string;
          total?: number;
          pages?: Array<{ num?: number; text?: string }>;
        }>;
        destroy?: () => Promise<void>;
      };
    };

    if (!pdfParseModule.PDFParse) return null;

    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = normalizeWhitespace(result.text || '');
      const totalPages = Math.max(1, result.total || pageCount, result.pages?.length || 0);
      const pageResults = result.pages || [];
      const pages = Array.from({ length: totalPages }, (_, index) => {
        const pageNumber = index + 1;
        const pageResult = pageResults.find((page) => page.num === pageNumber) || pageResults[index];
        const pageText = normalizeWhitespace(pageResult?.text || '');

        return {
          page: pageNumber,
          text: pageText,
          method: 'pdf_text' as const,
          confidence: pageText.length >= TEXT_PAGE_THRESHOLD ? 98 : pageText.length > 0 ? 55 : 0,
        };
      });

      return {
        pageCount: totalPages,
        pages: pages.some((page) => page.text.length > 0)
          ? pages
          : pageTextsFromCombinedText(
              text,
              totalPages,
              text.length >= TEXT_PACKET_THRESHOLD ? 98 : text.length > 0 ? 55 : 0
            ),
        source: 'pdf_parse',
      };
    } finally {
      await parser.destroy?.();
    }
  } catch {
    return null;
  }
}

export async function extractPdfTextFirst(buffer: Buffer): Promise<{
  pageCount: number;
  pages: PageText[];
  source: string;
}> {
  const pageCount = countPdfPages(buffer);
  const rawExtraction = extractPdfTextWithoutRendering(buffer, pageCount);
  const rawTextLength = rawExtraction.pages.reduce((sum, page) => sum + page.text.length, 0);
  
  const parsedExtraction = await extractPdfTextWithPdfParse(buffer, pageCount);
  if (!parsedExtraction) return rawExtraction;

  const parsedTextLength = parsedExtraction.pages.reduce((sum, page) => sum + page.text.length, 0);
  if (parsedTextLength >= TEXT_PACKET_THRESHOLD) return parsedExtraction;
  return parsedTextLength > rawTextLength ? parsedExtraction : rawExtraction;
}
