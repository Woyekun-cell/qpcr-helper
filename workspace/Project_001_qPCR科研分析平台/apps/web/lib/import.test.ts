import { describe, expect, it } from "vitest";
import { parseCtText } from "./import";

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
});
