import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { ColdChainReport } from './coldChainReport';
import { formatFactoryRecordedAt } from './factoryChecklist';

// Built-in PDF fonts support degree signs, but not arbitrary Unicode punctuation.
const text = (value: string) => value.replace(/[–—]/g, '-').replace(/’/g, "'").replace(/\u00a0/g, ' ');

export function createColdChainPdf(report: ColdChainReport) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `Cold Chain Observations ${report.from} to ${report.to}`, author: report.generatedBy, subject: 'Read-only observation report' });
  const header = () => {
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(15, 118, 110);
    doc.text('VEJOY | Cold Chain Observations', 12, 15);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(51, 65, 85);
    doc.text(`${report.from} to ${report.to} | All times SAST (UTC+02:00)`, 12, 22);
    doc.text(text(`Snapshot: ${formatFactoryRecordedAt(report.generatedAt)} | By: ${report.generatedBy}`), 12, 28, { maxWidth: 270 });
  };
  header();
  doc.setFont('helvetica', 'bold').setFontSize(12);
  doc.text(`${report.observationCount} recorded observations | ${report.excursions} excursions`, 12, 39);
  let y = 50;
  for (const table of report.tables) {
    if (y > 154) { doc.addPage(); header(); y = 40; }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(51, 65, 85);
    doc.text(table.title, 12, y);
    autoTable(doc, {
      startY: y + 5, head: [table.headers.map(text)],
      body: table.rows.length ? table.rows.map(row => row.map(text)) : [[{ content: 'No records for this period.', colSpan: table.headers.length }]],
      margin: { top: 47, left: 12, right: 12, bottom: 16 }, theme: 'striped', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(table.widths.map((width, index) => [index, { cellWidth: width }])),
      willDrawPage: data => {
        if (data.pageNumber > 1) {
          header();
          doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(51, 65, 85);
          doc.text(`${table.title} (continued)`, 12, 40);
        }
      },
      didParseCell: data => {
        if (data.section === 'body' && table.alertRows.includes(data.row.index)) {
          data.cell.styles.fillColor = [255, 241, 242];
          data.cell.styles.textColor = [159, 18, 57];
        }
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 13;
  }
  if (y > 140) { doc.addPage(); header(); y = 40; }
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(51, 65, 85);
  doc.text('Report interpretation', 12, y);
  autoTable(doc, {
    startY: y + 5, body: report.warnings.map(warning => [text(warning)]),
    margin: { top: 40, left: 12, right: 12, bottom: 16 }, theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    willDrawPage: data => { if (data.pageNumber > 1) header(); },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(100, 116, 139);
    doc.text('Read-only snapshot | Missing observations are not inferred', 12, 202);
    doc.text(`Page ${page} of ${pages}`, 285, 202, { align: 'right' });
  }
  return doc;
}

export async function downloadColdChainPdf(report: ColdChainReport) {
  const doc = createColdChainPdf(report);
  await doc.save(`vejoy-cold-chain-${report.from}-to-${report.to}.pdf`, { returnPromise: true });
}
