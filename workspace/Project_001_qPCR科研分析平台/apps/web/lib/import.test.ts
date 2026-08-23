import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseCtText, parseCtWorkbookBundle } from "./import";

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function columnName(index: number): string {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function worksheet(rows: Array<Array<string | number>>): string {
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
    const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
    return typeof cell === "number"
      ? `<c r="${reference}"><v>${cell}</v></c>`
      : `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function roundTripWorkbook(): ArrayBuffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ct_Data" sheetId="1" r:id="rId1"/><sheet name="QC_Decisions" sheetId="2" r:id="rId2"/></sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;
  const bytes = zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRelationships),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/worksheets/sheet1.xml": strToU8(worksheet([
      ["well_id", "sample_id", "biological_replicate", "technical_replicate", "group", "gene", "role", "ct", "status", "plate_id", "batch"],
      ["A1", "C1", "bio-1", "tech-1", "control", "GENE1", "target", 24.2, "excluded", "plate-1", "batch-a"]
    ])),
    "xl/worksheets/sheet2.xml": strToU8(worksheet([
      ["well_id", "decision", "reason", "operator", "decided_at"],
      ["A1", "excluded", "Melt curve review", "user-1", "2026-08-23T10:00:00.000Z"]
    ]))
  });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("parseCtText", () => {
  it("imports tabular Ct values and preserves replicate identity", () => {
    const wells = parseCtText(
      "well_id\tsample_id\tbiological_replicate\ttechnical_replicate\tgroup\tgene\trole\tct\n" +
        "A1\tC1\tC1\t1\tcontrol\tGAPDH\treference\t25.0\n" +
        "A2\tC1\tC1\t1\tcontrol\tGENE1\ttarget\t30.0"
    );
    expect(wells).toHaveLength(2);
    expect(wells[1]).toMatchObject({ wellId: "A2", sampleId: "C1", ct: 30 });
  });

  it("marks Undetermined without inventing a Ct", () => {
    const wells = parseCtText(
      "well_id,sample_id,biological_replicate,technical_replicate,group,gene,role,ct\n" +
        "A1,C1,C1,1,control,GAPDH,reference,Undetermined"
    );
    expect(wells[0]).toMatchObject({ ct: null, status: "undetermined" });
  });

  it("round-trips wells, replicate metadata and audited QC decisions through XLSX", async () => {
    const bundle = await parseCtWorkbookBundle(roundTripWorkbook());

    expect(bundle.wells[0]).toMatchObject({
      wellId: "A1",
      biologicalReplicateId: "bio-1",
      technicalReplicateId: "tech-1",
      status: "excluded",
      plateId: "plate-1",
      batch: "batch-a"
    });
    expect(bundle.qcDecisions).toEqual([{
      wellId: "A1",
      decision: "excluded",
      reason: "Melt curve review",
      operator: "user-1",
      decidedAt: "2026-08-23T10:00:00.000Z"
    }]);
  });
});
