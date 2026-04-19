/**
 * UK SIC 2007 code → human-readable description. Curated subset of ~180
 * codes covering the sectors most likely to appear in fintech beneficiary
 * screening. Unknown codes return null from `sicLabelOrNull`.
 * Full source: https://resources.companieshouse.gov.uk/sic/
 */

const SIC_DESCRIPTIONS: Record<string, string> = {
  // Agriculture, forestry, fishing
  "01110": "Growing of cereals",
  "01500": "Mixed farming",

  // Manufacturing
  "10710": "Manufacture of bread, fresh pastry and cakes",
  "11050": "Manufacture of beer",
  "20150": "Manufacture of fertilisers and nitrogen compounds",
  "25990": "Manufacture of other fabricated metal products n.e.c.",
  "26200": "Manufacture of computers and peripheral equipment",
  "28290": "Manufacture of other general-purpose machinery n.e.c.",
  "32990": "Other manufacturing n.e.c.",

  // Construction
  "41100": "Development of building projects",
  "41201": "Construction of commercial buildings",
  "41202": "Construction of domestic buildings",
  "42110": "Construction of roads and motorways",
  "43210": "Electrical installation",
  "43220": "Plumbing, heat and air-conditioning installation",
  "43390": "Other building completion and finishing",

  // Wholesale / retail
  "45200": "Maintenance and repair of motor vehicles",
  "46190": "Agents involved in the sale of a variety of goods",
  "46900": "Non-specialised wholesale trade",
  "47110": "Retail sale in non-specialised stores with food/beverages/tobacco predominating",
  "47190": "Other retail sale in non-specialised stores",
  "47710": "Retail sale of clothing in specialised stores",
  "47910": "Retail sale via mail order houses or via Internet",

  // Transport and storage
  "49410": "Freight transport by road",
  "52290": "Other transportation support activities",
  "53202": "Licensed carriers",

  // Accommodation and food
  "55100": "Hotels and similar accommodation",
  "56101": "Licensed restaurants",
  "56102": "Unlicensed restaurants and cafes",
  "56103": "Take-away food shops and mobile food stands",
  "56301": "Licensed clubs",
  "56302": "Public houses and bars",

  // Information and communication
  "58110": "Book publishing",
  "58120": "Publishing of directories and mailing lists",
  "58130": "Publishing of newspapers",
  "58140": "Publishing of journals and periodicals",
  "58190": "Other publishing activities",
  "58210": "Publishing of computer games",
  "58290": "Other software publishing",
  "59111": "Motion picture production activities",
  "59120": "Motion picture, video and television programme post-production",
  "59200": "Sound recording and music publishing activities",
  "60100": "Radio broadcasting",
  "60200": "Television programming and broadcasting activities",
  "61100": "Wired telecommunications activities",
  "61200": "Wireless telecommunications activities",
  "61900": "Other telecommunications activities",
  "62011": "Ready-made interactive leisure and entertainment software development",
  "62012": "Business and domestic software development",
  "62020": "Information technology consultancy activities",
  "62030": "Computer facilities management activities",
  "62090": "Other information technology service activities",
  "63110": "Data processing, hosting and related activities",
  "63120": "Web portals",
  "63910": "News agency activities",
  "63990": "Other information service activities n.e.c.",

  // Financial and insurance
  "64110": "Central banking",
  "64190": "Other monetary intermediation",
  "64201": "Activities of agricultural holding companies",
  "64202": "Activities of production holding companies",
  "64203": "Activities of construction holding companies",
  "64204": "Activities of distribution holding companies",
  "64205": "Activities of financial services holding companies",
  "64209": "Activities of other holding companies n.e.c.",
  "64301": "Activities of investment trusts",
  "64302": "Activities of unit trusts",
  "64303": "Activities of venture and development capital companies",
  "64304": "Activities of open-ended investment companies",
  "64305": "Activities of property unit trusts",
  "64306": "Activities of real estate investment trusts",
  "64910": "Financial leasing",
  "64921": "Credit granting by non-deposit taking finance houses and other specialist consumer credit grantors",
  "64922": "Activities of mortgage finance companies",
  "64929": "Other credit granting n.e.c.",
  "64991": "Security dealing on own account",
  "64992": "Factoring",
  "64999": "Financial intermediation not elsewhere classified",
  "65110": "Life insurance",
  "65120": "Non-life insurance",
  "65201": "Life reinsurance",
  "65202": "Non-life reinsurance",
  "65300": "Pension funding",
  "66110": "Administration of financial markets",
  "66120": "Security and commodity contracts dealing activities",
  "66190": "Activities auxiliary to financial intermediation n.e.c.",
  "66210": "Risk and damage evaluation",
  "66220": "Activities of insurance agents and brokers",
  "66290": "Other activities auxiliary to insurance and pension funding",
  "66300": "Fund management activities",

  // Real estate
  "68100": "Buying and selling of own real estate",
  "68201": "Renting and operating of Housing Association real estate",
  "68202": "Letting and operating of conference and exhibition centres",
  "68209": "Other letting and operating of own or leased real estate",
  "68310": "Real estate agencies",
  "68320": "Management of real estate on a fee or contract basis",

  // Professional, scientific, technical
  "69101": "Barristers at law",
  "69102": "Solicitors",
  "69109": "Activities of patent and copyright agents; other legal activities n.e.c.",
  "69201": "Accounting, and auditing activities",
  "69202": "Bookkeeping activities",
  "69203": "Tax consultancy",
  "70100": "Activities of head offices",
  "70210": "Public relations and communications activities",
  "70221": "Financial management",
  "70229": "Management consultancy activities other than financial management",
  "71111": "Architectural activities",
  "71112": "Urban planning and landscape architectural activities",
  "71121": "Engineering design activities for industrial process and production",
  "71122": "Engineering related scientific and technical consulting activities",
  "71129": "Other engineering activities",
  "71200": "Technical testing and analysis",
  "72110": "Research and experimental development on biotechnology",
  "72190": "Other research and experimental development on natural sciences and engineering",
  "72200": "Research and experimental development on social sciences and humanities",
  "73110": "Advertising agencies",
  "73120": "Media representation services",
  "73200": "Market research and public opinion polling",
  "74100": "Specialised design activities",
  "74201": "Portrait photographic activities",
  "74202": "Other specialist photography",
  "74300": "Translation and interpretation activities",
  "74909": "Other professional, scientific and technical activities n.e.c.",
  "74990": "Non-trading company",

  // Administrative and support
  "77110": "Renting and leasing of cars and light motor vehicles",
  "77210": "Renting and leasing of recreational and sports goods",
  "77320": "Renting and leasing of construction and civil engineering machinery and equipment",
  "77400": "Leasing of intellectual property and similar products, except copyrighted works",
  "78100": "Activities of employment placement agencies",
  "78200": "Temporary employment agency activities",
  "78300": "Human resources provision and management of human resources functions",
  "79110": "Travel agency activities",
  "79120": "Tour operator activities",
  "80100": "Private security activities",
  "81100": "Combined facilities support activities",
  "81210": "General cleaning of buildings",
  "81290": "Other cleaning activities",
  "82110": "Combined office administrative service activities",
  "82190": "Photocopying, document preparation and other specialised office support activities",
  "82200": "Activities of call centres",
  "82910": "Activities of collection agencies and credit bureaus",
  "82990": "Other business support service activities n.e.c.",

  // Public administration
  "84110": "General public administration activities",

  // Education
  "85100": "Pre-primary education",
  "85200": "Primary education",
  "85310": "General secondary education",
  "85320": "Technical and vocational secondary education",
  "85410": "Post-secondary non-tertiary education",
  "85421": "First-degree level higher education",
  "85422": "Post-graduate level higher education",
  "85590": "Other education n.e.c.",
  "85600": "Educational support services",

  // Human health and social work
  "86101": "Hospital activities",
  "86210": "General medical practice activities",
  "86220": "Specialist medical practice activities",
  "86230": "Dental practice activities",
  "86900": "Other human health activities",
  "87100": "Residential nursing care activities",
  "87300": "Residential care activities for the elderly and disabled",
  "88910": "Child day-care activities",

  // Arts, entertainment, recreation
  "90010": "Performing arts",
  "90030": "Artistic creation",
  "90040": "Operation of arts facilities",
  "91020": "Museum activities",
  "92000": "Gambling and betting activities",
  "93110": "Operation of sports facilities",
  "93120": "Activities of sports clubs",
  "93130": "Fitness facilities",
  "93190": "Other sports activities",
  "93290": "Other amusement and recreation activities n.e.c.",

  // Other service activities
  "94110": "Activities of business and employers membership organizations",
  "94200": "Activities of trade unions",
  "94990": "Activities of other membership organizations n.e.c.",
  "95110": "Repair of computers and peripheral equipment",
  "96010": "Washing and (dry-)cleaning of textile and fur products",
  "96020": "Hairdressing and other beauty treatment",
  "96090": "Other service activities n.e.c.",

  // Dormant / misc
  "99999": "Dormant company",
};

export function sicLabelOrNull(code: string): string | null {
  return SIC_DESCRIPTIONS[code] ?? null;
}
