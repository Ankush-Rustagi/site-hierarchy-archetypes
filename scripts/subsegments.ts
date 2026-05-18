/**
 * Per-industry sub-segment classification.
 *
 * Each industry has its own sub-segment vocabulary, defined inline below.
 * Sub-segments are decided by regex over the SFDC account name. The
 * classifier is deterministic and dependency-free, so it runs in CI.
 *
 * Whatever doesn't match a named segment falls into a per-industry
 * `other_<tier>` bucket where `<tier>` is the bookings tier of the
 * customer (smb / commercial / midmarket / enterprise / strategic).
 * That gives every catch-all customer a meaningful home rather than a
 * single opaque "Other" bucket.
 *
 * Lifecycle:
 *   1. Try the industry's named-segment regex ladder. First match wins.
 *   2. If nothing matches, return `other_<tier>` based on bookings.
 */

export type SubSegment = {
  id: string;
  label: string;
  description: string;
};

export type IndustrySubSegmenter = {
  industry: string;
  segments: SubSegment[];
  /**
   * Returns the SubSegment.id this customer belongs to. The result is
   * always non-null because of the bookings-tier fallback.
   */
  classify: (input: { name: string; bookings: number }) => string;
};

// Bookings tiers - same boundaries used across industries.
export type BookingsTier = "smb" | "commercial" | "midmarket" | "enterprise" | "strategic";
export function bookingsTier(b: number): BookingsTier {
  if (b < 25_000) return "smb";
  if (b < 100_000) return "commercial";
  if (b < 500_000) return "midmarket";
  if (b < 5_000_000) return "enterprise";
  return "strategic";
}

// Standard tier segments appended to every industry's segment list.
function tierSegments(industry: string): SubSegment[] {
  return [
    { id: `other_strategic`, label: `Other ${industry} (Strategic, $5M+)`,        description: `Customers in ${industry} with $5M+ lifetime bookings that don't match a named sub-segment. Usually large brand names with no industry-specific keyword.` },
    { id: `other_enterprise`, label: `Other ${industry} (Enterprise, $500k-$5M)`, description: `Customers in ${industry} with $500k-$5M lifetime bookings that don't match a named sub-segment.` },
    { id: `other_midmarket`, label: `Other ${industry} (Mid-Market, $100k-$500k)`, description: `Customers in ${industry} with $100k-$500k lifetime bookings that don't match a named sub-segment.` },
    { id: `other_commercial`, label: `Other ${industry} (Commercial, $25k-$100k)`, description: `Customers in ${industry} with $25k-$100k lifetime bookings that don't match a named sub-segment.` },
    { id: `other_smb`, label: `Other ${industry} (SMB, <$25k)`,                   description: `Customers in ${industry} with <$25k lifetime bookings that don't match a named sub-segment.` },
  ];
}

function nameTest(name: string, pat: RegExp): boolean {
  return pat.test(name);
}

function fallback(industry: string, bookings: number): string {
  return `other_${bookingsTier(bookings)}`;
}

// ---------------------------------------------------------------------------
// Per-industry segmenters
// ---------------------------------------------------------------------------

const k12: IndustrySubSegmenter = {
  industry: "K-12",
  segments: [
    { id: "district", label: "School districts", description: "Multi-school public districts. Sites are usually one root per school, then floors / wings / classrooms inside." },
    { id: "charter_network", label: "Charter networks & academies", description: "Charter operators and academies running one to many campuses. Often share branding and a flat naming scheme." },
    { id: "standalone_hs", label: "Standalone high schools & specialty", description: "Single-school customers (private high schools, magnets, specialty programs)." },
    { id: "faith_based", label: "Faith-based schools", description: "Religious / parochial schools. Catholic, Christian, Lutheran, Hebrew, Islamic." },
    ...tierSegments("K-12"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(School District|Schools|Public Schools|ISD|Unified|Consolidated|USD|County Schools|Township)\b/i)) return "district";
    if (nameTest(name, /\b(Charter|Academy|Preparatory|Prep School)\b/i)) return "charter_network";
    if (
      nameTest(name, /\b(Catholic|Christian|Lutheran|Hebrew|Jewish|Islamic|Baptist|Methodist|Diocese|Parochial|Franciscan|Episcopal|Anglican|Presbyterian|Holy|Mennonite|Calvary|Trinity|Adventist|Jesuit|Saviour|Savior)\b/i) ||
      nameTest(name, /^(?:St\.?|Saint|Notre Dame|Our Lady|San |Santa )\s/i)
    ) return "faith_based";
    if (nameTest(name, /\b(High School|Middle School|Elementary|Day School|Country Day|Boarding School|School\b)/i)) return "standalone_hs";
    return fallback("K-12", bookings);
  },
};

const higherEd: IndustrySubSegmenter = {
  industry: "Higher Ed",
  segments: [
    { id: "research_uni", label: "Universities & research institutions", description: "Four-year and research universities. Tend to have building letters, campus quadrants, and floor numbering." },
    { id: "community_college", label: "Community & junior colleges", description: "Two-year colleges and junior colleges. Smaller campuses, often single-site or two-site." },
    { id: "liberal_arts", label: "Liberal arts & professional colleges", description: "Four-year non-research colleges, including specialty / professional schools." },
    { id: "polytechnic", label: "Polytechnics & institutes", description: "Trade-and-tech focused: polytechnics, institutes, conservatories." },
    ...tierSegments("Higher Ed"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Community College|Junior College|Jr\.?\s*College|Tribal College|CC\b)/i)) return "community_college";
    if (nameTest(name, /\b(University|State College)\b/i)) return "research_uni";
    if (nameTest(name, /\b(Polytechnic|Institute|Conservatory)\b/i)) return "polytechnic";
    if (nameTest(name, /\bCollege\b/i)) return "liberal_arts";
    return fallback("Higher Ed", bookings);
  },
};

const tradeSchools: IndustrySubSegmenter = {
  industry: "Trade Schools & Other Ed",
  segments: [
    { id: "trade_school", label: "Trade & vocational schools", description: "Career-and-technical schools, beauty / barber / culinary academies, automotive tech schools." },
    { id: "specialty_ed", label: "Specialty education", description: "Boarding schools, alternative schools, special-needs schools, language schools, test prep." },
    ...tierSegments("Trade Schools & Other Ed"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Trade|Vocational|Vo[-\s]Tech|Technical Institute|Beauty|Culinary|Barber|Automotive|Welding|Mechanic)\b/i)) return "trade_school";
    if (nameTest(name, /\b(Boarding|Alternative|Special|Montessori|Language|Test Prep|Tutoring)\b/i)) return "specialty_ed";
    return fallback("Trade Schools & Other Ed", bookings);
  },
};

const government: IndustrySubSegmenter = {
  industry: "Government",
  segments: [
    { id: "federal", label: "Federal agencies", description: "Federal departments, federal courts, military, federal prisons." },
    { id: "state", label: "State agencies", description: "State governments, departments, agencies. Customer names often start with state code then '-State-'." },
    { id: "county", label: "County governments", description: "County administration, services, and elected offices. Customer names often start with state code then '-County-'." },
    { id: "municipal", label: "Municipal governments", description: "City and town governments. Customer names typically encode 'XX-Municipality-CityName'." },
    { id: "public_safety", label: "Police, fire & EMS", description: "Independent police departments, fire districts, sheriff's offices, and EMS where not rolled into a parent municipality." },
    { id: "housing_authority", label: "Public housing authorities", description: "City and county housing authorities, public housing operators, HUD-funded housing." },
    { id: "transit_airport", label: "Transit, airports & ports", description: "Transit commissions, port authorities, regional airports, public transportation agencies." },
    { id: "tribal", label: "Tribal nations", description: "Federally recognized tribes and their governmental operations." },
    { id: "education_admin", label: "Education administration", description: "County offices of education, library districts, school administration agencies." },
    { id: "special_district", label: "Special districts", description: "Water, parks, health, fire, and other special-purpose districts not covered by city/county." },
    ...tierSegments("Government"),
  ],
  classify: ({ name, bookings }) => {
    // Most specific patterns first.
    if (nameTest(name, /\b(Housing Authority|Public Housing|Housing Trust|Housing Commission|Redevelopment.*Housing)\b/i)) return "housing_authority";
    if (nameTest(name, /\b(Airport|Port Authority|Port of |Transit (Authority|Commission|System|District)|Transportation Commission|Metropolitan Transit|Regional Transit|Transit Agency|Aviation Authority)\b/i)) return "transit_airport";
    if (nameTest(name, /\b(County Office of Education|Office of Education|Library District|Library System|Educational Service|Cooperative Educational Service|Regional School|Regional Educational)\b/i)) return "education_admin";
    if (nameTest(name, /-Federal-|^Federal\b|\b(Department of|Bureau of|National Park|US\s+Government|U\.S\.|FBI|DEA|TSA|ATF|Federal Agency|Federal Reserve|Air Force|Army|Navy|Marines|Coast Guard|Veterans Affairs|VA Medical)\b/i)) return "federal";
    if (nameTest(name, /^[A-Z]{2}-State-|^State of |\bState Agency\b|\b(State of|State Department|Legislative Assembly|Legislature|Governor|Secretary of State|Attorney General)\b/i)) return "state";
    if (nameTest(name, /^[A-Z]{2}-County-|\b(County|Parish|Borough)\s+(Of|Government|Administration|Council|Commission|Sheriff|Coroner|Clerk|Recorder|Assessor|Treasurer)\b/i)) return "county";
    if (nameTest(name, /^[A-Z]{2}-Municipality-|\b(City of|Town of|Village of|Township of|Borough of)\b/i)) return "municipal";
    if (nameTest(name, /\b(Police|Sheriff|Fire District|Fire (Department|Rescue|Authority)|Marshal|EMS|Constable|Sheriff's Office)\b/i)) return "public_safety";
    if (nameTest(name, /\b(Nation|Tribe|Tribal|Band of |Indian Reservation|Pueblo|Indigenous)\b/i)) return "tribal";
    if (nameTest(name, /\b(Park District|Parks (District|Department)|Water District|Health District|Sanitation District|Mosquito|Conservation District|Special District)\b/i)) return "special_district";
    return fallback("Government", bookings);
  },
};

const healthcare: IndustrySubSegmenter = {
  industry: "Healthcare",
  segments: [
    { id: "hospital_system", label: "Hospitals & health systems", description: "General and regional hospitals plus multi-site health systems." },
    { id: "clinic_network", label: "Clinic networks & medical groups", description: "Multi-clinic outpatient operators, medical groups, primary-care networks." },
    { id: "specialty_provider", label: "Specialty providers", description: "Dental, vision, behavioral health, dialysis, blood banks, addiction treatment, veterinary." },
    { id: "pharmacy", label: "Pharmacies", description: "Retail pharmacy chains and compounding pharmacies." },
    { id: "senior_living", label: "Senior living & home health", description: "Assisted living, nursing homes, hospice, home health, retirement communities." },
    { id: "payer_insurer", label: "Payers & insurers", description: "Health insurers, payer networks, managed care." },
    ...tierSegments("Healthcare"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(UnitedHealth|Aetna|Cigna|Humana|Anthem|BlueCross|Blue Cross|Kaiser Permanente|Managed Care|Health Plan|Health Insurance|Payer)\b/i)) return "payer_insurer";
    if (nameTest(name, /\b(Pharmacy|Pharmacies|Drug Store|RX\b)/i)) return "pharmacy";
    // Specialty providers BEFORE the broad hospital_system pattern, so
    // "Behavioral Health", "Mental Health", "Eye Care" etc. don't get
    // swallowed by the generic "X Health" regex.
    if (nameTest(name, /\b(Dental|Dentistry|Vision|Eye Care|Orthopedic|Cardiology|Oncology|Dermatology|Behavioral|Mental Health|Recovery|Addiction|Blood Bank|Vitalant|OneBlood|Dialysis|Imaging|Surgery Center|Surgical|Veterinary|Vet\b|Animal (Hospital|Clinic|Medical))\b/i)) return "specialty_provider";
    if (nameTest(name, /\b(Senior Living|Assisted Living|Nursing|Hospice|Home Health|Retirement|Skilled Nursing|Memory Care|Senior Care|Living\s+(Communities|Group)|Continuing Care|Life Plan Community|Village (of |Communities|Care)|HumanGood|Revera|Masonicare)\b/i)) return "senior_living";
    if (
      nameTest(name, /\b(Hospital|Hospitals|Medical Center|Regional Health|Health System|Memorial Health|Medicine\b|University Health|Health Care System|Health Network)\b/i) ||
      nameTest(name, /\bHealth$/i) ||
      // Generic "X Health" pattern (safe because Behavioral / Mental
      // Health were caught above).
      nameTest(name, /\b[A-Z][a-zA-Z]+ Health\b/)
    ) return "hospital_system";
    if (nameTest(name, /\b(Clinic|Clinics|Medical Group|Health Center|Family Health|Primary Care|Urgent Care|Healthcare|Health Services|Health Partners|Physicians?\b)/i)) return "clinic_network";
    return fallback("Healthcare", bookings);
  },
};

const retail: IndustrySubSegmenter = {
  industry: "Retail",
  segments: [
    { id: "auto_dealer", label: "Auto dealerships & service", description: "Auto dealerships, RV/boat dealers, automotive service chains." },
    { id: "grocery_food", label: "Grocery, food & beverage retail", description: "Supermarkets, convenience stores, liquor / cannabis retail, specialty food, restaurants." },
    { id: "apparel_fashion", label: "Apparel & fashion", description: "Clothing brands, athletic wear, luxury, boutiques." },
    { id: "home_furnishings", label: "Home & furnishings", description: "Furniture, mattresses, home decor, home improvement, building materials retail." },
    { id: "specialty_retail", label: "Specialty retail", description: "Sporting goods, jewelry, pet, beauty, electronics, hobby." },
    { id: "department_store", label: "Department stores & off-price", description: "Department stores, off-price chains, mass merchants." },
    ...tierSegments("Retail"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Toyota|Honda|Ford|Chevy|Chevrolet|Nissan|BMW|Mercedes|Lexus|Hyundai|Auto|Motors|Automotive|Cars\b|Dealership|Dealerships|Powersports|RV\b|Marine\b|Tire\b|Lube|Fast Lube)\b/i)) return "auto_dealer";
    if (nameTest(name, /\b(Grocer|Supermarket|Market\b|Markets\b|Wine|Spirits|Liquor|Beer|Cannabis|Dispensary|Tobacco|Smoker|Food|Foods|Deli|Bakery|Coffee|Donut|Pizza|Restaurant|Smokehouse|Fireworks|Eats?\b)/i)) return "grocery_food";
    if (nameTest(name, /\b(Apparel|Clothing|Fashion|Boutique|Outfitter|Hugo Boss|H&M|Stitch Fix|Vuori|Reformation|Snipes|Skims|Kookai|Bella \+ Canvas|JD Sports|Harry Rosen|Lagardere|Mecca|Heinemann|Kith|JB Hi-Fi|Sneaker|Footwear|Jeans|Activewear)\b/i)) return "apparel_fashion";
    if (nameTest(name, /\b(Furniture|Mattress|Home Decor|Home Improvement|Lumber|Hardware|Paint|Building Materials|Bedding|Havertys|Mathis|Living Spaces|Tepperman|Pottery|West Elm|Crate|Williams[-\s]Sonoma|Sleep)\b/i)) return "home_furnishings";
    if (nameTest(name, /\b(Pharmacy|Pharmacies|Bikes|Bicycle|Outdoors|Sporting|Sports\b|Jewelry|Pool|Pet\b|Pets\b|Salon|Spa|Optical|Eye Care|GNC|Vitamin|Nutrition|Cosmetic|Cosmetics|Beauty|Camera|Music|Guitar|Toys|Hobby|Books|Books-A-Million|Stationery|Office Supply)\b/i)) return "specialty_retail";
    if (nameTest(name, /\b(Burlington|Stores Inc|Department Store|Off[-\s]?Price|Discount|Mall|Outlet|Plaza\b|Target\b|Walmart|Kohl|Macy|Nordstrom)\b/i)) return "department_store";
    return fallback("Retail", bookings);
  },
};

const realEstate: IndustrySubSegmenter = {
  industry: "Real Estate",
  segments: [
    { id: "multi_family", label: "Multi-family housing", description: "Apartments, residential communities, housing developments, HOAs, condos." },
    { id: "self_storage", label: "Self-storage & rental", description: "Self-storage operators, equipment rental, vehicle rental, fleet rental." },
    { id: "commercial_property", label: "Commercial property mgmt", description: "Commercial real estate, mixed-use, office buildings, industrial parks." },
    { id: "property_services", label: "Property services & operators", description: "Property management companies, realty operators, REITs." },
    { id: "developer_builder", label: "Developers & builders", description: "Real estate developers, homebuilders, large-scale community developers." },
    { id: "marina_recreation", label: "Marinas & recreation", description: "Marinas, RV resorts, vacation rental communities, recreation-focused property." },
    ...tierSegments("Real Estate"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Self Storage|Self[-\s]Storage|Storage Inc|Storage LLC|Extra Space|Public Storage|U-?Haul|Rent A Car|Rental|Rentals|Fleet)\b/i)) return "self_storage";
    if (nameTest(name, /\b(Marina|Marinas|RV Resort|RV Park|Vacation Rental|Resort Communities|Recreation)\b/i)) return "marina_recreation";
    if (nameTest(name, /\b(Developer|Development|Developments|Homebuilder|Home Builders?|NVR|Pulte|Lennar|Toll Brothers|D\.R\. Horton|St\.? Joe Company)\b/i)) return "developer_builder";
    if (nameTest(name, /\b(Residential|Apartments?\b|Communities|Housing\b|Homes\b|Tower\b|Condo|Condominium|Mobile Home|HOA|Estates|Villas|Residence|REIT|Resi\b|Lifestyle Communities|Sun Communities|Walton Communities|Havenpark)\b/i)) return "multi_family";
    if (nameTest(name, /\b(Commercial|Office Park|Mixed[-\s]?Use|Industrial Park)\b/i)) return "commercial_property";
    if (nameTest(name, /\b(Property|Management|Realty|Real Estate|Asset Management|Properties|Equity LLC|Holdings\b)/i)) return "property_services";
    return fallback("Real Estate", bookings);
  },
};

const financialServices: IndustrySubSegmenter = {
  industry: "Financial Services",
  segments: [
    { id: "bank", label: "Banks", description: "Commercial banks, community banks, savings institutions, bank holding companies." },
    { id: "credit_union", label: "Credit unions", description: "Federal and state credit unions, including those identified by acronym." },
    { id: "insurance", label: "Insurance carriers & brokers", description: "Insurance companies, mutual insurance, brokerages, reinsurance." },
    { id: "asset_management", label: "Asset & wealth management", description: "Investment management, private equity, hedge funds, family offices." },
    { id: "mortgage_lending", label: "Mortgage & consumer lending", description: "Mortgage originators, consumer lenders, pawn, fintech lenders." },
    { id: "specialty_finance", label: "Specialty finance", description: "Farm Credit, agricultural lending, building societies, specialty cooperatives." },
    ...tierSegments("Financial Services"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Credit Union|FCU\b|FCCU\b|FCU|CU\b|SECU\b|PSECU|Federal Credit|State Credit|Members Credit)\b/i)) return "credit_union";
    if (nameTest(name, /\b(Mortgage|PennyMac|Better Mortgage|Loan|Lending|Pawn|Consumer Finance|Fintech)\b/i)) return "mortgage_lending";
    if (nameTest(name, /\b(Farm Credit|Land Bank|Agricultural Credit|Building Society|Cooperative Bank)\b/i)) return "specialty_finance";
    if (nameTest(name, /\b(Bank\b|Banco|Bankshares|Bancorp|Savings\b|National Association|N\.A\.|FSB\b|Trust Company|Bancshares)\b/i)) return "bank";
    if (nameTest(name, /\b(Insurance|Insurer|Mutual|Reinsurance|Underwriters|Brokerage|Insurance Group|Assurance)\b/i)) return "insurance";
    if (nameTest(name, /\b(Capital\b|Asset Management|Wealth Management|Investment|Investments|Fund\b|Funds\b|Equity\b|Advisors|Hedge|Family Office|Private Equity)\b/i)) return "asset_management";
    return fallback("Financial Services", bookings);
  },
};

const nonprofitCivic: IndustrySubSegmenter = {
  industry: "Nonprofit & Civic",
  segments: [
    { id: "religious", label: "Religious organizations", description: "Churches, cathedrals, missions, parishes, dioceses, synagogues, mosques." },
    { id: "social_services", label: "Social services & community", description: "Family services, community action, housing programs, food banks, shelters." },
    { id: "youth_education", label: "Youth & education-adjacent nonprofits", description: "Girl Scouts, Boy Scouts, after-school, mentoring, youth programs." },
    { id: "foundation", label: "Foundations & trusts", description: "Charitable foundations, grant-making trusts, endowments." },
    { id: "advocacy_civic", label: "Advocacy & civic", description: "Membership associations, professional societies, civic associations, councils." },
    { id: "health_nonprofit", label: "Health & blood services nonprofits", description: "Nonprofit hospitals, blood banks, planned parenthood, treatment centers." },
    { id: "animal_welfare", label: "Animal welfare & guide services", description: "Animal rescue, guide-dog organizations, animal medical nonprofits, humane societies." },
    { id: "legal_aid", label: "Legal aid & disability services", description: "Legal aid organizations, disability advocacy, ARC chapters, autism services." },
    { id: "labor_union", label: "Labor unions & professional associations", description: "Labor unions, trade unions, public-employee unions." },
    ...tierSegments("Nonprofit & Civic"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Church|Cathedral|Mission|Parish|Diocese|Synagogue|Mosque|Temple\b|Ministry|Ministries|Christian|Catholic|Presbyterian|Baptist|Lutheran|Methodist|Jewish|Hebrew|Islamic|LifeChurch|SGI-USA|Religious|Ovation Communities)\b/i)) return "religious";
    if (nameTest(name, /\bUnion\b|\bSEIU\b|\bTeamsters\b|\bAFSCME\b|\bAFL[-\s]CIO\b|\bIBEW\b/i)) return "labor_union";
    if (nameTest(name, /\b(Animal (Medical|Hospital|Welfare)|Humane Society|Guide Dogs?\b|SPCA\b|Pet Rescue|Wildlife)\b/i)) return "animal_welfare";
    if (nameTest(name, /\b(Legal Aid|Disability|Autism|Arc of |The Arc\b|Special Needs|Cerebral Palsy|Blind\b)/i)) return "legal_aid";
    if (
      nameTest(name, /\b(Health|Hospital|Hospice|Bloodbank|Blood Bank|OneBlood|Planned Parenthood|Treatment Center|Recovery Center|Health Board|Medical Center)\b/i) &&
      !nameTest(name, /\b(Inc\.?|LLC|Corp|Corporation)\b/i)
    ) return "health_nonprofit";
    if (nameTest(name, /\b(OneBlood|Vitalant|Planned Parenthood|Children's Village|Eden Autism|Pinnacle Treatment|Concord Dallas|Shoreline Dallas|Recovery)\b/i)) return "health_nonprofit";
    if (nameTest(name, /\b(Foundation|Trust|Endowment|Grant|Charity|Charitable)\b/i)) return "foundation";
    if (nameTest(name, /\b(Boys & Girls|Boys And Girls|Girl Scouts|Boy Scouts|YMCA|YWCA|Kids|Youth|Mentor|After[-\s]?School|Big Brothers|Big Sisters|Childcare|Child Development)\b/i)) return "youth_education";
    if (nameTest(name, /\b(Association|Society|Council|Coalition|Pilots|League|Federation|Alliance|Chamber|Bar Association|Professional)\b/i)) return "advocacy_civic";
    if (nameTest(name, /\b(Community|Family Services|Action|Habitat|Goodwill|Salvation|United Way|Housing|Shelter|Food Bank|Pantry|Loaves|Mobile Loaves|Rising Ground|BronxWorks|CMHS|ReDiscover|Bridges|Concord|Helping Hands)\b/i)) return "social_services";
    return fallback("Nonprofit & Civic", bookings);
  },
};

const professionalServices: IndustrySubSegmenter = {
  industry: "Professional Services",
  segments: [
    { id: "legal_accounting", label: "Legal & accounting", description: "Law firms, accounting firms, tax services, financial advisory." },
    { id: "consulting", label: "Consulting & advisory", description: "Management consulting, strategic advisory, specialty consulting." },
    { id: "marketing_creative", label: "Marketing, agency & creative", description: "Marketing agencies, creative shops, PR firms." },
    { id: "engineering_arch", label: "Engineering & architecture", description: "Engineering firms, architecture, design, A/E/C professional services." },
    { id: "veterinary_animal", label: "Veterinary & animal services", description: "Veterinary groups, animal care, pet services." },
    { id: "staffing_hr", label: "Staffing & HR services", description: "Staffing firms, recruiting, HR services, payroll." },
    { id: "automotive_services", label: "Automotive services", description: "Car washes, oil change chains, auto-related professional services." },
    { id: "rd_testing", label: "R&D, testing & inspection", description: "Testing labs, certification companies, scientific R&D services." },
    ...tierSegments("Professional Services"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Law\b|Law Firm|LLP\b|P\.C\.|Attorneys|Legal\b|Accounting|CPA\b|Tax\b|H&R Block|Audit|Litigation)\b/i)) return "legal_accounting";
    if (nameTest(name, /\b(Veterinary|Veterinarian|Vet Group|Vet Care|Pet Care|Animal\b)/i)) return "veterinary_animal";
    if (nameTest(name, /\b(Car Wash|Lube\b|Lubrication|Valvoline|Oil Change|Quick Lube|Detail Shop)\b/i)) return "automotive_services";
    if (nameTest(name, /\b(Staffing|Recruiting|Recruitment|HR Services|Payroll|Randstad|Adecco|Robert Half|Workforce|Manpower)\b/i)) return "staffing_hr";
    if (nameTest(name, /\b(SGS\b|Testing\b|Inspection|Laboratory|Laboratories|Calibration|Certification|R&D|Research and Development|Bio\b|Biosciences|Diagnostics)\b/i)) return "rd_testing";
    if (nameTest(name, /\b(Engineering|Architects|Architecture|Design Group|A&E\b|Civil|Structural|Surveying)\b/i)) return "engineering_arch";
    if (nameTest(name, /\b(Consulting|Strategy|Advisory|Consultants)\b/i)) return "consulting";
    if (nameTest(name, /\b(Marketing|Creative|Agency|Advertising|Media\b|Communications|Brand|PR\b|Public Relations)\b/i)) return "marketing_creative";
    return fallback("Professional Services", bookings);
  },
};

const manufacturing: IndustrySubSegmenter = {
  industry: "Manufacturing",
  segments: [
    { id: "food_beverage", label: "Food & beverage manufacturing", description: "Food production, beverages, dairy, meatpacking, processing." },
    { id: "chemical_pharma", label: "Chemical, pharma & life sciences", description: "Chemicals, plastics, pharmaceuticals, biotech, life sciences manufacturing." },
    { id: "industrial_equipment", label: "Industrial & equipment manufacturing", description: "Metal fabrication, industrial parts, pumps, machinery, plumbing, equipment manufacturers." },
    { id: "automotive_manufacturing", label: "Automotive & transportation manufacturing", description: "Automakers, parts suppliers, commercial vehicle and equipment makers." },
    { id: "building_materials", label: "Building materials & construction products", description: "Cement, aggregates, ready mix, roofing, doors, building products, insulation." },
    { id: "consumer_products", label: "Consumer & specialty products", description: "Consumer goods, electronics, apparel, packaging, household products." },
    { id: "industrial_giant", label: "Industrial conglomerates", description: "Large diversified industrial conglomerates with no single product focus." },
    ...tierSegments("Manufacturing"),
  ],
  classify: ({ name, bookings }) => {
    // Order matters. Specific product categories first; the generic
    // "Industries / Manufacturing / Mfg" catch-all is last.
    if (nameTest(name, /\b(Foods\b|Food\b|Beverage|Beer|Wine\b|Spirits|Coffee|Dairy|Milk|Bakery|Meat\b|Seafood|Produce|Brewing|Distill|Cannabis|Tobacco|Smithfield|Fairlife|Manildra|Fresh Mark|Mash|Milling)\b/i)) return "food_beverage";
    if (nameTest(name, /\b(Chemical|Chemicals|Plastics|Polymer|Pharmaceutical|Pharma|Biotech|Therapeutics|Labs|Sciences\b|Specialty Materials|Coatings|Paints|Haleon|Octapharma|Masimo|Beckman Coulter|Colorcon|Trelleborg|Entegris|Cerro Wire)\b/i)) return "chemical_pharma";
    if (nameTest(name, /\b(Cement|Ready Mix|Ready[-\s]Mix|Aggregates|Castparts|Concrete|Stone\b|Brick\b|Block\b|Roofing|Doors\b|Door Manufacturer|Windows\b|Insulation|Building Products|Building Materials|Drywall|Lumber|Cedar|Steel\b|Oldcastle|CRH|Manville|Smyrna|Tilcon|Ash Grove|Lafarge|Eagle Materials|Home Builders?|Champion Home)\b/i)) return "building_materials";
    if (nameTest(name, /\b(Automotive|Auto Parts|Automaker|Caterpillar|Nissan|Toyota|Ford|GM\b|Magna|Tier 1|Powertrain|Vehicle|Truck Manufacturer|Heavy Equipment|Kubota|FreightCar|Hendrickson|Magna International|Dakkota|Martinrea)\b/i)) return "automotive_manufacturing";
    if (nameTest(name, /\b(Consumer\b|Electronics|Furniture|Apparel|Mauser|Packaging|Packaging Solutions|Wistron|Wiwynn|Household|Canada Goose|Skims)\b/i)) return "consumer_products";
    if (nameTest(name, /\b(AMETEK|Vertiv|EnerSys|PPG|Industries\b|Industrial|Equipment\b|Machinery|Pump\b|Pumps\b|Plumbing|Stamping|Fabrication|Metals\b|Aluminum|Foundry|Tool\b|Tools\b|Manufacturing|Mfg|Castings|Bearings)\b/i)) return "industrial_equipment";
    return fallback("Manufacturing", bookings);
  },
};

const construction: IndustrySubSegmenter = {
  industry: "Construction",
  segments: [
    { id: "general_contractor", label: "General contractors", description: "General contractors, construction managers, builders." },
    { id: "specialty_trades", label: "Specialty trades", description: "Mechanical, electrical, plumbing, HVAC, roofing, demolition." },
    { id: "infrastructure", label: "Infrastructure & heavy civil", description: "Heavy-civil contractors, roads, bridges, energy infrastructure." },
    { id: "remodeling_residential", label: "Residential & remodeling", description: "Home builders, remodelers, residential additions, home services." },
    { id: "aggregates_materials", label: "Aggregates & materials suppliers", description: "Construction materials suppliers, sand & gravel, paving materials, lumber suppliers." },
    { id: "industrial_engineering", label: "Industrial engineering & EPC", description: "Engineering-procurement-construction firms, large-scale industrial builders." },
    ...tierSegments("Construction"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Black And Veatch|Black & Veatch|Halliburton|Quanta Services|Kiewit|Bechtel|Fluor|Granite Construction|MasTec|EMCOR|EPC\b|Industrial Construction)\b/i)) return "industrial_engineering";
    if (nameTest(name, /\b(Sand & Gravel|Sand and Gravel|Aggregates|Tilcon|Knife River|Oldcastle|CRH|Lumber|Cement Supply|Materials Supplier|Materials Company|Foundation Building Materials|Mountain Supply)\b/i)) return "aggregates_materials";
    if (nameTest(name, /\b(Electric|Electrical|Plumbing|Mechanical|HVAC|Roofing|Demolition|Foundation|Concrete|Masonry|Drywall|Insulation|Glass|Air Conditioning|Goettl)\b/i)) return "specialty_trades";
    if (nameTest(name, /\b(Heavy Civil|Highway|Bridge|Infrastructure|Paving|Road\b|Roadway|Pipeline)\b/i)) return "infrastructure";
    if (nameTest(name, /\b(Home\b|Homes\b|Residential|Remodel|Remodeling|Pulte|Toll Brothers|NVR|Champion Home|Home Builders?\b|DaBella|Bath Fitter)\b/i)) return "remodeling_residential";
    if (nameTest(name, /\b(Construction|Contractors|Constructors|Builders|Building Group|Builds|HITT|Mission Group|Bowen Engineering)\b/i)) return "general_contractor";
    return fallback("Construction", bookings);
  },
};

const utilities: IndustrySubSegmenter = {
  industry: "Utilities",
  segments: [
    { id: "renewable", label: "Renewable energy", description: "Solar, wind, clean energy, biofuels." },
    { id: "electric", label: "Electric utilities & cooperatives", description: "Electric utilities, rural electric co-ops, power generation." },
    { id: "gas_oil_distribution", label: "Gas & oil distribution", description: "Natural gas, propane, fuel distribution." },
    { id: "water_waste", label: "Water & waste management", description: "Water utilities, wastewater, hazardous waste, environmental services." },
    ...tierSegments("Utilities"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Solar|Wind|Renewable|Clean Energy|Biofuel|Geothermal)\b/i)) return "renewable";
    if (nameTest(name, /\b(Electric|Power\b|Energy\b|Cooperative|Membership Corporation|Co[-\s]?Op|EMC\b)/i)) return "electric";
    if (nameTest(name, /\b(Gas\b|Propane|Fuel\b|Oil\b|Petroleum|Natural Resources)\b/i)) return "gas_oil_distribution";
    if (nameTest(name, /\b(Water\b|Waste\b|Sewer|Environmental|Refuse|Sanitation|Recycling|GFL|Clean Harbors)\b/i)) return "water_waste";
    return fallback("Utilities", bookings);
  },
};

const energyMining: IndustrySubSegmenter = {
  industry: "Energy & Mining",
  segments: [
    { id: "oil_gas", label: "Oil & gas", description: "Upstream / midstream / downstream oil and gas operations." },
    { id: "mining", label: "Mining", description: "Coal, metals, aggregates, quarries." },
    { id: "energy_services", label: "Energy services & technology", description: "Energy services, oilfield services, energy management technology." },
    ...tierSegments("Energy & Mining"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Oilfield Services|Energy Services|Energy Technology|Hyroad|Aethon|Innovex)\b/i)) return "energy_services";
    if (nameTest(name, /\b(Oil\b|Gas\b|Petroleum|Drilling|Refinery|Refining|Midstream|Upstream)\b/i)) return "oil_gas";
    if (nameTest(name, /\b(Mining|Mine\b|Coal|Quarry|Aggregate|Metals|Ore\b|Limestone|Gravel|Sand)\b/i)) return "mining";
    return fallback("Energy & Mining", bookings);
  },
};

const transportationLogistics: IndustrySubSegmenter = {
  industry: "Transportation & Logistics",
  segments: [
    { id: "trucking_carrier", label: "Trucking & carriers", description: "Truckload, less-than-truckload, specialty trucking, motor carriers." },
    { id: "logistics_3pl", label: "3PL, supply chain & logistics", description: "Third-party logistics, freight forwarders, supply-chain operators, cold storage." },
    { id: "intermodal_terminal", label: "Intermodal, ports & terminals", description: "Intermodal yards, ports, terminals, barge lines, dock operations." },
    { id: "aviation", label: "Aviation & airlines", description: "Airlines, business aviation, aircraft services." },
    { id: "transit_rail", label: "Transit & rail", description: "Public transit, rail freight, school transportation, road authorities." },
    { id: "vehicle_rental_dealer", label: "Vehicle rental & truck dealers", description: "Vehicle rental, truck dealerships, fleet leasing." },
    ...tierSegments("Transportation & Logistics"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Truck Country|Truck Center|Dobbs Truck|Hertz|Vehicle Rental|Truck Dealers?\b|Truck Leasing|Fleet Leasing|Penske|Ryder|Hertz Global)\b/i)) return "vehicle_rental_dealer";
    if (nameTest(name, /\b(Airlines|Aviation|Aircraft|Helicopter|Airport)\b/i)) return "aviation";
    if (nameTest(name, /\b(Transit|Rail\b|Railroad|Railway|MTA\b|Metro\b|Northland|NRMA|Road and Motorists|National Roads)\b/i)) return "transit_rail";
    if (nameTest(name, /\b(Intermodal|Terminal|Terminals|Port\b|Dock|Marine|Barge|Shipping|Maritime|CSX|Mainfreight|Wabtec|Mondiale)\b/i)) return "intermodal_terminal";
    if (nameTest(name, /\b(Logistics|3PL|Supply Chain|Fulfillment|Freight|Cold Storage|NFI Industries|Agile Cold|Romark|Rinchem|Cryoport|McLane)\b/i)) return "logistics_3pl";
    if (nameTest(name, /\b(Transport|Transportation|Trucking|Carrier|Cartage|Hauling|Express\b|Werner Enterprises|Ruan\b|Lines\b|Tropical Shipping|Honor Foods)\b/i)) return "trucking_carrier";
    return fallback("Transportation & Logistics", bookings);
  },
};

const wholesale: IndustrySubSegmenter = {
  industry: "Wholesale",
  segments: [
    { id: "food_distribution", label: "Food & beverage distribution", description: "Food service distribution, produce, dairy, beverages, snacks." },
    { id: "industrial_distribution", label: "Industrial & equipment distribution", description: "Wholesale industrial supply, equipment, parts, MRO." },
    { id: "building_supply", label: "Building materials & supply", description: "Plumbing supply, electrical supply, HVAC, building materials distribution." },
    { id: "specialty_wholesale", label: "Specialty wholesale", description: "Specialty distribution: medical, beauty, automotive aftermarket." },
    { id: "packaging_distribution", label: "Packaging & paper distribution", description: "Packaging distributors, paper, janitorial supply." },
    { id: "ag_commodities", label: "Agricultural commodities", description: "Grain trading, agricultural commodities, ag inputs." },
    ...tierSegments("Wholesale"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Berlin Packaging|Shorr Packaging|Packaging Distribut|Paper Distribut|Janitorial|Imperial Dade|BradyPLUS|Industrial Cleaning)\b/i)) return "packaging_distribution";
    if (nameTest(name, /\b(Grain|Agricultural|Bunge|Scoular|Driscoll|Sylvite|Ag Inputs|Seed|Fertilizer|Cargill|ADM\b)/i)) return "ag_commodities";
    if (nameTest(name, /\b(Food|Foods|Produce|Dairy|Beverage|Beverages|Brewing|Beer|Wine|Spirits|Coffee|Snack|Winebow|House of Spices|Bush Brothers)\b/i)) return "food_distribution";
    if (nameTest(name, /\b(Plumbing Supply|Electrical Supply|HVAC Supply|Building Materials|Pipe & Supply|Tile\b|Hardware Wholesale|Lumber Wholesale|Reece|Mountainland Supply|Foundation Building)\b/i)) return "building_supply";
    if (nameTest(name, /\b(Industrial|Equipment|Parts\b|Supply\b|Distribution|Distributing|Wholesale|MRO|Industrial Supply)\b/i)) return "industrial_distribution";
    if (nameTest(name, /\b(Medical Supply|Beauty Supply|Automotive Parts|Auto Parts Wholesale|Outdoor Wholesale|Sporting Wholesale|Vape|Specialty Distrib)\b/i)) return "specialty_wholesale";
    return fallback("Wholesale", bookings);
  },
};

// Sub-segmenters for the cards that previously had none defined.
const artsEntertainment: IndustrySubSegmenter = {
  industry: "Arts & Entertainment",
  segments: [
    { id: "casino_gaming", label: "Casinos & gaming", description: "Casinos, gaming operators, lottery, sports betting." },
    { id: "museums_cultural", label: "Museums & cultural", description: "Museums, galleries, cultural institutions, performing arts." },
    { id: "stadium_venue", label: "Stadiums & live venues", description: "Sports stadiums, arenas, concert venues, entertainment complexes." },
    { id: "fitness_recreation", label: "Fitness, gyms & recreation", description: "Gyms, fitness chains, recreation centers, family entertainment." },
    { id: "themed_attraction", label: "Theme parks & attractions", description: "Theme parks, water parks, amusement, zoos, aquariums." },
    { id: "media_production", label: "Media & production", description: "Film/TV studios, content production, media networks." },
    ...tierSegments("Arts & Entertainment"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Casino|Gaming|Lottery|Betting|Sportsbook|Tribe Gaming)\b/i)) return "casino_gaming";
    if (nameTest(name, /\b(Theme Park|Water Park|Amusement|Zoo|Aquarium|Attractions)\b/i)) return "themed_attraction";
    if (nameTest(name, /\b(Stadium|Arena|Coliseum|Field House|Concert Venue|Performing Arts|Music Hall|Amphitheater)\b/i)) return "stadium_venue";
    if (nameTest(name, /\b(Museum|Gallery|Cultural|Symphony|Opera|Ballet|Art Institute|Botanical|Library)\b/i)) return "museums_cultural";
    if (nameTest(name, /\b(Gym\b|Fitness|Health Club|Yoga|Pilates|CrossFit|Recreation Center|Rec Center|YMCA Fitness|Family Entertainment|Bowling|Skating|Arcade)\b/i)) return "fitness_recreation";
    if (nameTest(name, /\b(Studio|Studios|Production|Productions|Media\b|Films?\b|Entertainment Group|Records\b|Broadcasting|Network)\b/i)) return "media_production";
    return fallback("Arts & Entertainment", bookings);
  },
};

const hospitality: IndustrySubSegmenter = {
  industry: "Hospitality",
  segments: [
    { id: "hotel_resort", label: "Hotels & resorts", description: "Hotel chains, resorts, hospitality groups." },
    { id: "restaurant_chain", label: "Restaurant chains", description: "Multi-unit restaurants, fast casual, QSR, full service." },
    { id: "bar_club", label: "Bars, clubs & nightlife", description: "Bars, clubs, lounges, nightlife venues." },
    { id: "catering_events", label: "Catering & events", description: "Catering operators, event services, banquet operations." },
    ...tierSegments("Hospitality"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Hotel|Hotels|Resort|Inn\b|Inns\b|Lodge|Suites|Hospitality Group|Marriott|Hyatt|Hilton|Wyndham|Choice Hotels|IHG)\b/i)) return "hotel_resort";
    if (nameTest(name, /\b(Bar\b|Bars\b|Club\b|Clubs\b|Lounge|Nightlife|Tavern|Pub\b)/i)) return "bar_club";
    if (nameTest(name, /\b(Catering|Banquet|Events Group|Event Services)\b/i)) return "catering_events";
    if (nameTest(name, /\b(Restaurant|Restaurants|Pizza|Burger|Burgers|Coffee|Cafe|Café|Bakery|Steakhouse|Brewing|Brewery|Pizzeria|Cantina|Bistro|Fast Food|Grill|Quick Service)\b/i)) return "restaurant_chain";
    return fallback("Hospitality", bookings);
  },
};

const adminSupport: IndustrySubSegmenter = {
  industry: "Admin & Support",
  segments: [
    { id: "facilities_services", label: "Facilities & janitorial services", description: "Facilities management, janitorial, building services, security services." },
    { id: "security_services", label: "Security & alarm services", description: "Security guards, alarm monitoring, private security." },
    { id: "waste_environmental", label: "Waste & environmental services", description: "Waste hauling, environmental remediation, hazardous materials." },
    { id: "personal_consumer", label: "Personal & consumer services", description: "Repair shops, dry cleaning, photo services, personal services." },
    ...tierSegments("Admin & Support"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Facilities|Janitorial|Cleaning Services|Building Services|Maintenance Services)\b/i)) return "facilities_services";
    if (nameTest(name, /\b(Security Services|Alarm Monitoring|Private Security|Guard Services|Security Group)\b/i)) return "security_services";
    if (nameTest(name, /\b(Waste\b|Recycling|Environmental Services|Remediation|Hazardous|Disposal)\b/i)) return "waste_environmental";
    if (nameTest(name, /\b(Repair|Dry Cleaning|Photo|Laundry|Funeral|Personal Services|Tailor)\b/i)) return "personal_consumer";
    return fallback("Admin & Support", bookings);
  },
};

const techInformation: IndustrySubSegmenter = {
  industry: "Tech & Information",
  segments: [
    { id: "software_saas", label: "Software & SaaS", description: "Software companies, SaaS platforms, cloud services." },
    { id: "telecom", label: "Telecommunications", description: "Telecom carriers, ISPs, wireless, fiber, cable." },
    { id: "data_center", label: "Data centers & hosting", description: "Data center operators, colocation, managed hosting, cloud infrastructure." },
    { id: "media_publishing", label: "Media & publishing", description: "Publishing, news media, content platforms." },
    { id: "hardware_devices", label: "Hardware & devices", description: "Hardware manufacturers (where SFDC tagged them as Tech rather than Manufacturing)." },
    ...tierSegments("Tech & Information"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Telecom|Telecommunications|Wireless|Cellular|Fiber Optic|ISP\b|Internet Service|Cable Communications|Verizon|AT&T|Comcast|Charter|Spectrum)\b/i)) return "telecom";
    if (nameTest(name, /\b(Data Center|Data Centers|Colocation|Hosting|Cloud Infrastructure|Cloud Services|Coresite)\b/i)) return "data_center";
    if (nameTest(name, /\b(Publishing|Publisher|Newspaper|News Media|Magazine|Editorial|Books|Media Group)\b/i)) return "media_publishing";
    if (nameTest(name, /\b(Software|SaaS|Cloud Platform|App\b|Apps\b|Application Services|Technologies\b|Tech\b|Inc\.? Software|Platform)\b/i)) return "software_saas";
    if (nameTest(name, /\b(Hardware|Devices|Electronics|Equipment\b|Components|Semiconductor|Chips)\b/i)) return "hardware_devices";
    return fallback("Tech & Information", bookings);
  },
};

// For customers whose SFDC industry is empty. No named regex, just
// bookings-tier fallback so the card still has consistent structure.
const unknownOther: IndustrySubSegmenter = {
  industry: "Unknown / Other",
  segments: [
    ...tierSegments("Unknown / Other"),
  ],
  classify: ({ bookings }) => fallback("Unknown / Other", bookings),
};

const agriculture: IndustrySubSegmenter = {
  industry: "Agriculture",
  segments: [
    { id: "crop_production", label: "Crop production & farming", description: "Row crops, orchards, vineyards, specialty crop farming." },
    { id: "livestock_dairy", label: "Livestock & dairy", description: "Cattle, poultry, dairy, livestock operations." },
    { id: "forestry_fishing", label: "Forestry, fishing & hunting", description: "Logging, forestry, commercial fishing, hunting operations." },
    { id: "ag_services", label: "Agricultural services", description: "Ag services, irrigation, soil testing, farm management." },
    ...tierSegments("Agriculture"),
  ],
  classify: ({ name, bookings }) => {
    if (nameTest(name, /\b(Forestry|Logging|Lumber Co|Timber|Fishing|Hunting|Seafood Catch)\b/i)) return "forestry_fishing";
    if (nameTest(name, /\b(Cattle|Beef|Poultry|Dairy|Livestock|Hog\b|Pork|Cattle Co|Ranch)\b/i)) return "livestock_dairy";
    if (nameTest(name, /\b(Farms?\b|Farming|Orchard|Vineyard|Crop|Grain\b|Produce Farm|Greenhouse)\b/i)) return "crop_production";
    if (nameTest(name, /\b(Irrigation|Soil|Crop Services|Farm Management|Ag Services)\b/i)) return "ag_services";
    return fallback("Agriculture", bookings);
  },
};

// ---------------------------------------------------------------------------
// Registry + lookups
// ---------------------------------------------------------------------------

export const SUB_SEGMENTERS: IndustrySubSegmenter[] = [
  k12,
  higherEd,
  tradeSchools,
  government,
  healthcare,
  retail,
  realEstate,
  financialServices,
  nonprofitCivic,
  professionalServices,
  manufacturing,
  construction,
  utilities,
  energyMining,
  transportationLogistics,
  wholesale,
  artsEntertainment,
  hospitality,
  adminSupport,
  techInformation,
  agriculture,
  unknownOther,
];

const BY_INDUSTRY = new Map<string, IndustrySubSegmenter>();
for (const s of SUB_SEGMENTERS) BY_INDUSTRY.set(s.industry, s);

export function classifySubSegment(industry: string, input: { name: string; bookings: number }): string | null {
  const s = BY_INDUSTRY.get(industry);
  if (!s) return null;
  return s.classify(input);
}

export function segmentsFor(industry: string): SubSegment[] {
  return BY_INDUSTRY.get(industry)?.segments ?? [];
}
