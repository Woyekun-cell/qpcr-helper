import { normalizeImportedWells, type CtWell } from "@qpcr/contracts";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";

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

export async function parseCtWorkbook(buffer: ArrayBuffer): Promise<CtWell[]> {
  const sheet = await readSheet(buffer);
  const [headerRow, ...dataRows] = sheet;
  if (!headerRow || dataRows.length === 0) throw new Error("Ct workbook has no data rows");
  const headers = headerRow.map((cell) => String(cell ?? "").trim().toLowerCase());
  const rows = dataRows
    .filter((row) => row.some((cell) => cell !== null && cell !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  return normalizeImportedWells(rows.map(normalizeHeaders));
}
