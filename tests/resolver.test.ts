import { describe, it, expect } from "vitest";
import { __matchesFromSearchForTest, __rankMatchesForTest } from "@/lib/resolver";

describe("resolver: Companies House search -> CompanyMatch[]", () => {
  it("maps all fields from a full search payload", () => {
    const result = __matchesFromSearchForTest([
      {
        title: "MONZO BANK LIMITED",
        company_number: "09446231",
        address_snippet: "Broadwalk House, 5 Appold Street, London",
        company_status: "active",
        company_type: "ltd",
        date_of_creation: "2015-02-06",
        description: "09446231 - Incorporated on 6 February 2015",
      },
    ]);
    expect(result).toEqual([
      {
        title: "MONZO BANK LIMITED",
        companyNumber: "09446231",
        address: "Broadwalk House, 5 Appold Street, London",
        companyStatus: "active",
        companyType: "ltd",
        incorporationDate: "2015-02-06",
        cessationDate: null,
        description: "09446231 - Incorporated on 6 February 2015",
      },
    ]);
  });

  it("caps the result list at 5 matches even if more are supplied", () => {
    const many = Array.from({ length: 8 }).map((_, i) => ({
      title: `ACME ${i} LIMITED`,
      company_number: `0000000${i}`,
    }));
    const result = __matchesFromSearchForTest(many);
    expect(result.length).toBe(5);
    expect(result[0].companyNumber).toBe("00000000");
    expect(result[4].companyNumber).toBe("00000004");
  });

  it("substitutes null for missing optional fields", () => {
    const result = __matchesFromSearchForTest([
      { title: "MINI LTD", company_number: "11111111" },
    ]);
    expect(result).toEqual([
      {
        title: "MINI LTD",
        companyNumber: "11111111",
        address: null,
        companyStatus: null,
        companyType: null,
        incorporationDate: null,
        cessationDate: null,
        description: null,
      },
    ]);
  });

  it("returns an empty array for no matches", () => {
    expect(__matchesFromSearchForTest([])).toEqual([]);
  });
});

describe("resolver: ranking logic", () => {
  it("ranks active companies above dissolved ones", () => {
    const ranked = __rankMatchesForTest(
      [
        {
          title: "REVOLUT LIMITED",
          company_number: "07207124",
          company_status: "dissolved",
          date_of_creation: "2010-03-29",
        },
        {
          title: "REVOLUT LTD",
          company_number: "08804411",
          company_status: "active",
          date_of_creation: "2013-12-06",
        },
      ],
      "revolut",
    );
    expect(ranked[0].company_number).toBe("08804411");
    expect(ranked[1].company_number).toBe("07207124");
  });

  it("prefers exact title matches over partial matches among actives", () => {
    const ranked = __rankMatchesForTest(
      [
        {
          title: "REVOLUT HOLDINGS LTD",
          company_number: "11111111",
          company_status: "active",
          date_of_creation: "2010-01-01",
        },
        {
          title: "REVOLUT LTD",
          company_number: "08804411",
          company_status: "active",
          date_of_creation: "2013-12-06",
        },
      ],
      "Revolut Ltd",
    );
    expect(ranked[0].company_number).toBe("08804411");
  });

  it("among equal-active non-exact matches, prefers older incorporations", () => {
    const ranked = __rankMatchesForTest(
      [
        {
          title: "FOO NEW LTD",
          company_number: "22222222",
          company_status: "active",
          date_of_creation: "2024-01-01",
        },
        {
          title: "FOO OLDER LTD",
          company_number: "11111111",
          company_status: "active",
          date_of_creation: "2005-01-01",
        },
      ],
      "foo",
    );
    expect(ranked[0].company_number).toBe("11111111");
  });
});
