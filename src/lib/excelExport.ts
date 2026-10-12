export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export interface ExcelColumn {
  key: string;
  header: string;
  width?: number;
  numberFormat?: string;
}

export interface ExcelSection {
  title: string;
  columns: ExcelColumn[];
  rows: Array<Record<string, ExcelCellValue>>;
}

export interface ExcelSheet {
  name: string;
  title: string;
  columns: ExcelColumn[];
  rows: Array<Record<string, ExcelCellValue>>;
  metadata?: Array<[string, ExcelCellValue]>;
  tableTitle?: string;
  sections?: ExcelSection[];
}

export interface ExcelWorkbookExport {
  filename: string;
  sheets: ExcelSheet[];
}

const invalidSheetNameCharacters = /[\\/?*:[\]]/g;

function safeSheetName(name: string) {
  return name.replace(invalidSheetNameCharacters, '-').slice(0, 31) || 'Sheet';
}

function excelColumnName(columnNumber: number) {
  let value = columnNumber;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result || 'A';
}

export const excelAutoFilterFeature = {
  files: {
    transform: {
      'xl/worksheets/sheet{id}.xml': {
        transform(content: string, sheetOptions: { autoFilterRef?: string }) {
          if (!sheetOptions.autoFilterRef || content.includes('<autoFilter')) return content;
          return content.replace('</sheetData>', `</sheetData><autoFilter ref="${sheetOptions.autoFilterRef}"/>`);
        },
      },
    },
  },
};

export function buildExcelFileSheets(specification: ExcelWorkbookExport) {
  return specification.sheets.map((sheetDefinition) => {
    const allColumnSets = [sheetDefinition.columns, ...(sheetDefinition.sections || []).map(section => section.columns)];
    const lastColumn = Math.max(1, ...allColumnSets.map(columns => columns.length));
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
    const tableRows = (columns: ExcelColumn[], rows: Array<Record<string, ExcelCellValue>>, tableTitle?: string) => {
      const sectionTitleRow = tableTitle
        ? [[
            {
              value: tableTitle,
              type: String,
              columnSpan: lastColumn,
              fontSize: 12,
              fontWeight: 'bold' as const,
              textColor: '#0F172A',
              backgroundColor: '#CCFBF1',
              height: 22,
              alignVertical: 'center' as const,
            },
            ...Array(Math.max(0, lastColumn - 1)).fill(null),
          ]]
        : [];
      const headerRow = [
        ...columns.map(column => ({
          value: column.header,
          type: String,
          fontWeight: 'bold' as const,
          textColor: '#FFFFFF',
          backgroundColor: '#334155',
          wrap: true,
          height: 28,
          alignVertical: 'center' as const,
        })),
        ...Array(Math.max(0, lastColumn - columns.length)).fill(null),
      ];
      const dataRows = rows.map((row, rowIndex) => [
        ...columns.map(column => {
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
        }),
        ...Array(Math.max(0, lastColumn - columns.length)).fill(null),
      ]);
      return [...sectionTitleRow, headerRow, ...dataRows];
    };
    const primaryTable = tableRows(sheetDefinition.columns, sheetDefinition.rows, sheetDefinition.tableTitle);
    const sectionTables = (sheetDefinition.sections || []).flatMap(section => [
      Array(lastColumn).fill(null),
      ...tableRows(section.columns, section.rows, section.title),
    ]);
    const data = [titleRow, ...metadataRows, Array(lastColumn).fill(null), ...primaryTable, ...sectionTables];
    const columns = Array.from({ length: lastColumn }, (_, index) => {
      const widths = allColumnSets.map(columnSet => columnSet[index]?.width || 0);
      const headerLengths = allColumnSets.map(columnSet => columnSet[index]?.header.length || 0);
      return { width: Math.max(12, ...widths, Math.min(32, Math.max(0, ...headerLengths) + 3)) };
    });
    const primaryHeaderRow = metadataRows.length + (sheetDefinition.tableTitle ? 4 : 3);
    const autoFilterRef = `A${primaryHeaderRow}:${excelColumnName(sheetDefinition.columns.length)}${primaryHeaderRow + sheetDefinition.rows.length}`;
    return {
      data,
      sheet: safeSheetName(sheetDefinition.name),
      columns,
      stickyRowsCount: metadataRows.length + 3,
      showGridLines: false,
      autoFilterRef,
    };
  });
}

export async function exportExcelWorkbook(specification: ExcelWorkbookExport) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const sheets = buildExcelFileSheets(specification);
  const filename = specification.filename.endsWith('.xlsx') ? specification.filename : `${specification.filename}.xlsx`;
  const writeWorkbook = writeXlsxFile as unknown as (
    workbookSheets: ReturnType<typeof buildExcelFileSheets>,
    options: { features: unknown[] },
  ) => { toFile: (fileName: string) => Promise<void> };
  await writeWorkbook(sheets, { features: [excelAutoFilterFeature] }).toFile(filename);
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
