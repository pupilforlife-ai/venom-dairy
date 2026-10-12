export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export interface ExcelColumn {
  key: string;
  header: string;
  width?: number;
  numberFormat?: string;
}

export interface ExcelSheet {
  name: string;
  title: string;
  columns: ExcelColumn[];
  rows: Array<Record<string, ExcelCellValue>>;
  metadata?: Array<[string, ExcelCellValue]>;
}

export interface ExcelWorkbookExport {
  filename: string;
  sheets: ExcelSheet[];
}

const invalidSheetNameCharacters = /[\\/?*:[\]]/g;

function safeSheetName(name: string) {
  return name.replace(invalidSheetNameCharacters, '-').slice(0, 31) || 'Sheet';
}

export function buildExcelFileSheets(specification: ExcelWorkbookExport) {
  return specification.sheets.map((sheetDefinition) => {
    const lastColumn = Math.max(1, sheetDefinition.columns.length);
    const titleRow = [
      {
        value: sheetDefinition.title,
        type: String,
        columnSpan: lastColumn,
        fontSize: 16,
        fontWeight: 'bold' as const,
        textColor: '#FFFFFF',
        backgroundColor: '#0F766E',
        height: 25,
        alignVertical: 'center' as const,
      },
      ...Array(Math.max(0, lastColumn - 1)).fill(null),
    ];
    const metadataRows = (sheetDefinition.metadata || []).map(([label, value]) => [
      { value: label, type: String, fontWeight: 'bold' as const, textColor: '#475569' },
      value instanceof Date
        ? { value, type: Date, format: 'dd mmm yyyy hh:mm' }
        : { value: value ?? '', type: typeof value === 'number' ? Number : typeof value === 'boolean' ? Boolean : String },
      ...Array(Math.max(0, lastColumn - 2)).fill(null),
    ]);
    const headerRow = sheetDefinition.columns.map(column => ({
      value: column.header,
      type: String,
      fontWeight: 'bold' as const,
      textColor: '#FFFFFF',
      backgroundColor: '#334155',
      wrap: true,
      height: 28,
      alignVertical: 'center' as const,
    }));
    const dataRows = sheetDefinition.rows.map((row, rowIndex) => sheetDefinition.columns.map(column => {
      const value = row[column.key];
      if (value === null || value === undefined) return null;
      return {
        value,
        type: value instanceof Date ? Date : typeof value === 'number' ? Number : typeof value === 'boolean' ? Boolean : String,
        format: value instanceof Date
          ? (column.numberFormat || 'dd mmm yyyy hh:mm')
          : typeof value === 'number'
            ? column.numberFormat
            : undefined,
        wrap: true,
        alignVertical: 'top' as const,
        backgroundColor: rowIndex % 2 === 1 ? '#F8FAFC' : undefined,
      };
    }));
    const data = [titleRow, ...metadataRows, Array(lastColumn).fill(null), headerRow, ...dataRows];
    return {
      data,
      sheet: safeSheetName(sheetDefinition.name),
      columns: sheetDefinition.columns.map(column => ({ width: column.width || Math.max(12, Math.min(32, column.header.length + 3)) })),
      stickyRowsCount: metadataRows.length + 3,
      showGridLines: false,
    };
  });
}

export async function exportExcelWorkbook(specification: ExcelWorkbookExport) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const sheets = buildExcelFileSheets(specification);
  const filename = specification.filename.endsWith('.xlsx') ? specification.filename : `${specification.filename}.xlsx`;
  await writeXlsxFile(sheets).toFile(filename);
}

export function excelDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}

export function exportDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
