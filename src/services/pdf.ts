import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

import { createDocumentFromPdf, splitIntoParagraphs } from '../lib/document'

GlobalWorkerOptions.workerSrc = workerSrc

export async function importPdfFile(file: File) {
  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: buffer }).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => {
        if (!('str' in item)) {
          return ''
        }

        return item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ')
      })
      .join('')
      .replace(/\s+\n/g, '\n')

    const paragraphs = splitIntoParagraphs(text, pageNumber)
    pages.push(paragraphs)
  }

  return createDocumentFromPdf(file.name, `file://${file.name}`, pages)
}
