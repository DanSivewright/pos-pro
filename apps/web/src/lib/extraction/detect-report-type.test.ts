import { describe, expect, it } from "vitest";
import { detectReportType } from "./detect-report-type";

describe("detectReportType", () => {
  it("recognises a Store Cashup report from its header", () => {
    expect(
      detectReportType("Store Cashup Report ServeUp | Roman's Pizza")
    ).toBe("cashup");
  });

  it("returns null for text it does not recognise", () => {
    expect(detectReportType("Some unrelated document")).toBeNull();
  });
});
