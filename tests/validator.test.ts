import { describe, it, expect } from "vitest";
import { validateProfile } from "@/lib/llm/validator";

function validBase(): Record<string, unknown> {
  return {
    resolvedName: "Acme Ltd",
    registrationNumber: "12345678",
    jurisdiction: "GB",
    registeredAddress: "1 High St",
    incorporationDate: "2015-02-06",
    companyStatus: "active",
    sicCodes: ["62090"],
    filingCount: 10,
    lastAccountsDate: "2024-01-01",
    directors: [],
    adverseMediaFindings: [],
  };
}

describe("validateProfile", () => {
  it("passes for a complete, well-typed profile", () => {
    const r = validateProfile(validBase());
    expect(r).toEqual({ valid: true, missingFields: [], invalidFields: [] });
  });

  it("flags missing required fields", () => {
    const input = validBase();
    delete input.registrationNumber;
    delete input.incorporationDate;
    const r = validateProfile(input);
    expect(r.valid).toBe(false);
    expect(r.missingFields).toContain("registrationNumber");
    expect(r.missingFields).toContain("incorporationDate");
  });

  it("flags non-array directors / findings / sicCodes", () => {
    const input = validBase();
    input.directors = "not an array";
    input.adverseMediaFindings = null;
    input.sicCodes = { oops: 1 };
    const r = validateProfile(input);
    expect(r.valid).toBe(false);
    expect(r.invalidFields).toContain("directors must be array");
    expect(r.invalidFields).toContain("adverseMediaFindings must be array");
    expect(r.invalidFields).toContain("sicCodes must be array");
  });

  it("rejects non-object input", () => {
    expect(validateProfile(null).valid).toBe(false);
    expect(validateProfile("hello").valid).toBe(false);
    expect(validateProfile(42).valid).toBe(false);
  });
});
