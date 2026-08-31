import { normalizeImportedWells, qcDecisionSchema, type CtWell, type QcDecision } from "@qpcr/contracts";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";

function normalizeHeaders(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value])
  );
}

export function parseCtText(text: string): CtWell[] {
  if (!text.trim()) throw new Error("Ct table is empty");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
    dynamicTyping: false
  });
  if (parsed.errors.length > 0) {
    throw new Error(`Could not parse Ct table: ${parsed.errors[0]?.message ?? "invalid data"}`);
  }
  const rows = parsed.data;
  if (rows.length === 0) throw new Error("Ct table has no data rows");
  return normalizeImportedWells(rows.map(normalizeHeaders));
}

function sheetRows(sheet: Array<Array<unknown>>): Array<Record<string, unknown>> {
  const [headerRow, ...dataRows] = sheet;
  if (!headerRow || dataRows.length === 0) throw new Error("Ct workbook has no data rows");
  const headers = headerRow.map((cell) => String(cell ?? "").trim().toLowerCase());
  return dataRows
    .filter((row) => row.some((cell) => cell !== null && cell !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export interface CtWorkbookBundle {
  wells: CtWell[];
  qcDecisions: QcDecision[];
}

export async function parseCtWorkbookBundle(buffer: ArrayBuffer): Promise<CtWorkbookBundle> {
  const sheets = await readXlsxFile(buffer);
  const ctSheet = sheets.find((sheet) => /^(ct[_ ]?data|raw[_ ]?wells)$/i.test(sheet.sheet)) ?? sheets[0];
  if (!ctSheet) throw new Error("Ct workbook has no sheets");
  const wells = normalizeImportedWells(sheetRows(ctSheet.data).map(normalizeHeaders));
  const qcSheet = sheets.find((sheet) => /^qc[_ ]?decisions$/i.test(sheet.sheet));
  const qcDecisions = qcSheet ? sheetRows(qcSheet.data).map((raw) => {
    const row = normalizeHeaders(raw);
    const decidedAt = row.decided_at instanceof Date
      ? row.decided_at.toISOString()
      : String(row.decided_at ?? "");
    return qcDecisionSchema.parse({
      wellId: row.well_id,
      decision: String(row.decision ?? "").toLowerCase(),
      reason: row.reason,
      operator: row.operator,
      decidedAt
    });
  }) : [];
  return { wells, qcDecisions };
}

export async function parseCtWorkbook(buffer: ArrayBuffer): Promise<CtWell[]> {
  return (await parseCtWorkbookBundle(buffer)).wells;
}
