import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatFactoryRecordedAt, type FactoryCheckRecord } from './factoryChecklist';
import { factoryChecklistObservations, factoryChecklistLockRows, factoryChecklistPdfFilename } from './factoryChecklistReport';

const text = (value: string) => value.replace(/[–—]/g, '-').replace(/’/g, "'").replace(/\u00a0/g, ' ');

export function createFactoryChecklistPdf(record: FactoryCheckRecord) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const kind = record.status !== 'completed' ? 'Closure / missed-check record' : record.payload.scope === 'temperatures' ? 'Temperature checklist'
    : record.payload.scope === 'locks' ? 'Locks and lights checklist' : 'Factory checklist';
  doc.setProperties({ title: `${kind} - ${record.check_date}`, author: record.recorded_by_name, subject: `Saved checklist ${record.id}` });
  const header = () => {
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(15, 118, 110);
    doc.text(`VEJOY | ${kind}`, 12, 16);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(51, 65, 85);
    doc.text(`Checklist date: ${record.check_date}`, 12, 24);
    doc.text(`Recorded at: ${formatFactoryRecordedAt(record.recorded_at)}`, 12, 30);
    doc.text(text(`Recorded by: ${record.recorded_by_name || 'Name unavailable'}`), 12, 36, { maxWidth: 186 });
    doc.setFontSize(8).text(`Record: ${record.id}`, 12, 43, { maxWidth: 186 });
  };
  header();
  let y = 54;
  const table = (title: string, headers: string[], rows: string[][], widths: number[], alertRows: number[] = []) => {
    if (y > 250) { doc.addPage(); header(); y = 54; }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(51, 65, 85);
    doc.text(title, 12, y);
    autoTable(doc, {
      startY: y + 5, head: [headers], body: rows.map(row => row.map(text)),
      margin: { top: 60, bottom: 18, left: 12, right: 12 }, theme: 'striped', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [15, 118, 110] },
      columnStyles: Object.fromEntries(widths.map((width, index) => [index, { cellWidth: width }])),
      willDrawPage: data => {
        if (data.pageNumber > 1) { header(); doc.setFont('helvetica', 'bold').setFontSize(11).text(`${title} (continued)`, 12, 54); }
      },
      didParseCell: data => {
        if (data.section === 'body' && alertRows.includes(data.row.index)) {
          data.cell.styles.fillColor = [255, 241, 242]; data.cell.styles.textColor = [159, 18, 57];
        }
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  };
  const locks = factoryChecklistLockRows(record);
  if (locks.length) table('Locks and lights', ['Check point', 'Recorded status'], locks, [70, 116]);
  const observations = factoryChecklistObservations(record);
  if (observations.length) table('Temperatures - this submission only', ['Location', 'Recorded observation', 'Observed at / by', 'Milk lot'], observations.map(row => [
    row.label, [row.value, row.result, row.target].filter(Boolean).join('\n'),
    [row.observedAt, row.recordedBy, row.readingId ? `Reading: ${row.readingId}` : ''].filter(Boolean).join('\n'), row.milkLotCode || '-',
  ]), [39, 49, 71, 27], observations.flatMap((row, index) => row.excursion ? [index] : []));
  if (record.status === 'not_completed') table('Not inspected', ['Recorded reason'], [[record.payload.missedReason || 'Reason not recorded']], [186]);
  if (record.payload.notes?.trim()) table('Recorded notes', ['Notes'], [[record.payload.notes]], [186]);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(100, 116, 139);
    doc.text('Saved submission only | All times SAST | Read-only copy', 12, 287);
    doc.text(`Page ${page} of ${pages}`, 198, 287, { align: 'right' });
  }
  return doc;
}

export async function downloadFactoryChecklistPdf(record: FactoryCheckRecord) {
  await createFactoryChecklistPdf(record).save(factoryChecklistPdfFilename(record), { returnPromise: true });
}
