import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export async function createSignedPdf(
  originalPdf: Blob,
  details: { title: string; signerName: string; email: string; documentId: string },
) {
  const pdf = await PDFDocument.load(await originalPdf.arrayBuffer())
  const page = pdf.addPage()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { width, height } = page.getSize()
  const margin = 54
  page.drawText('DOCUMENT SIGNATURE', {
    x: margin,
    y: height - 74,
    size: 11,
    font: bold,
    color: rgb(0.16, 0.35, 0.32),
  })
  page.drawText(details.title, {
    x: margin,
    y: height - 112,
    size: 19,
    font: bold,
    color: rgb(0.12, 0.16, 0.2),
    maxWidth: width - margin * 2,
  })
  page.drawText('I have reviewed this document and agree to sign it electronically.', {
    x: margin,
    y: height - 154,
    size: 11,
    font,
    color: rgb(0.32, 0.37, 0.4),
    maxWidth: width - margin * 2,
  })
  page.drawText('Signed electronically by', {
    x: margin,
    y: height - 224,
    size: 10,
    font,
    color: rgb(0.4, 0.45, 0.48),
  })
  page.drawText(details.signerName, {
    x: margin,
    y: height - 264,
    size: 24,
    font: bold,
    color: rgb(0.13, 0.31, 0.28),
    maxWidth: width - margin * 2,
  })
  page.drawLine({
    start: { x: margin, y: height - 278 },
    end: { x: Math.min(margin + 290, width - margin), y: height - 278 },
    thickness: 1,
    color: rgb(0.76, 0.8, 0.79),
  })
  page.drawText(`Account: ${details.email}`, {
    x: margin,
    y: height - 304,
    size: 9,
    font,
    color: rgb(0.4, 0.45, 0.48),
  })
  page.drawText(`Date signed: ${new Date().toISOString()}`, {
    x: margin,
    y: height - 321,
    size: 9,
    font,
    color: rgb(0.4, 0.45, 0.48),
  })
  page.drawText(`Document ID: ${details.documentId}`, {
    x: margin,
    y: height - 338,
    size: 9,
    font,
    color: rgb(0.4, 0.45, 0.48),
  })
  return pdf.save()
}
