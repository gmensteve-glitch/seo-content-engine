// Industry packs — what the engine knows about a line of business that a site
// crawl can't tell it: which collections are the money pages, which laws and
// institutions are real and citable, what a buyer actually asks, which
// attributes matter in the catalog, and what must NEVER be claimed.
//
// One pack per industry; a business is matched by its name/domain/profile.
// Everything downstream (discovery tiers, catalog facts, the category brief,
// the writer's rules, the fact-check's authority hosts, the blog ideator's
// local angles, default pillars) reads from the pack instead of assuming
// caskets. Add a new line of business by adding a pack here.

export type IndustryKey = "caskets" | "headstones" | "general";

export interface IndustryPack {
  key: IndustryKey;
  /** "caskets" — how the category writer names the line of business. */
  label: string;
  productNoun: string; // "casket" / "headstone"
  productPlural: string; // "caskets" / "headstones"
  /** The place the product ends up and whose rules govern it. */
  venue: string; // "funeral home" / "cemetery"
  /** Head-term collection handles (exact) and a pattern for the rest. */
  hubHandles: Set<string>;
  hubPattern: RegExp;
  /** Collections that are just a colour/finish filter of a bigger page. */
  colourPattern: RegExp;
  /** The only external links a page may carry. */
  authorityLinks: { title: string; url: string }[];
  /** How the grader should name the authorities it expects to see linked. */
  authorityNames: string;
  /** The one legal/consumer-rights statement the writer may make — verbatim safe. */
  legalRule: string;
  /** What the writer must NOT claim (the common wrong version). */
  legalDontSay: string;
  /** Name of the required "rights / rules" section. */
  rulesSectionName: string;
  /** The sections every page must include, in the writer's words. */
  requiredSections: string;
  /** What the comparison table (tier 1) should compare. */
  tableHint: string;
  /** Delivery/turnaround claims the writer may make beyond STORE POLICY. */
  promiseRule: string;
  /** Extra guidance for state/regional collection pages. */
  localRules: (place: string, businessName: string) => string;
  /** Offline (no-AI) brief fallbacks. */
  offlineSections: (tier: 1 | 2 | 3, collection: string, businessName: string) => { heading: string; purpose: string }[];
  offlineQuestions: (keyword: string, place: string | null) => string[];
  /** Domain primer handed to the brief + writer as BUSINESS/INDUSTRY CONTEXT. */
  primer: string;
  /** Catalog attribute mining (facts.ts). */
  materialWords: string[];
  colourWords: string[];
  styleWords: string[];
  /** Named attribute extractors: label + regex over the catalog text; the first
   *  capture group is the value. */
  attributeExtractors: { label: string; regex: RegExp; format: (m: RegExpMatchArray) => string }[];
  /** Default blog pillars for a new business in this industry. */
  pillars: { name: string; description: string }[];
  /** Blog ideator: the LOCAL angles that win for this industry. */
  blogLocalAngles: string;
  /** Blog writer: the local-page guidance. */
  blogLocalGuidance: string;
  /** Blog writer: the operational things never to invent about THIS business. */
  blogOperationalRule: string;
}

// ── Caskets ────────────────────────────────────────────────────

const CASKET_COLOUR =
  /\b(black|white|red|blue|navy|gold|golden|silver|pink|purple|green|brown|grey|gray|copper|bronze|champagne|orange|yellow|ivory|cream|natural|light-wood|medium-wood|dark-wood)\b/;

const CASKETS: IndustryPack = {
  key: "caskets",
  label: "caskets",
  productNoun: "casket",
  productPlural: "caskets",
  venue: "funeral home",
  hubHandles: new Set([
    "all-caskets",
    "caskets",
    "metal-caskets",
    "steel-caskets",
    "wood-caskets",
    "wooden-caskets",
    "oversized-caskets",
    "cremation-urns",
    "urns",
  ]),
  hubPattern: /^(all-)?(caskets|coffins|urns|cremation-urns|metal-caskets|steel-caskets|wood-caskets|wooden-caskets|oversized-caskets)$/,
  colourPattern: CASKET_COLOUR,
  authorityLinks: [
    { title: "The FTC Funeral Rule (consumer guide)", url: "https://consumer.ftc.gov/articles/ftc-funeral-rule" },
    { title: "Complying with the Funeral Rule (FTC)", url: "https://www.ftc.gov/business-guidance/resources/complying-funeral-rule" },
    { title: "National Funeral Directors Association", url: "https://nfda.org" },
  ],
  authorityNames: "FTC / NFDA",
  legalRule:
    "FTC FUNERAL RULE (federal, real): a funeral home must accept a casket bought elsewhere and may not charge a handling fee for it. State it exactly that way, linked to the FTC; no other legal claims.",
  legalDontSay: "Never invent state statutes, fees, or named funeral homes' policies.",
  rulesSectionName: "your rights",
  requiredSections:
    'a "prices" section using the live range, a "shipping & delivery" section (from STORE POLICY), and a "your rights" section on the Funeral Rule',
  tableHint: "gauges / materials / sizes compared",
  promiseRule: '"Delivered overnight to any funeral home in the country" is the brand promise and may be stated.',
  localRules: (place, name) => `THIS IS A LOCAL PAGE FOR ${place.toUpperCase()} — the same catalog, for families there:
- Name ${place} in the H1, the first sentence of the intro, the SEO title and at least two section headings. A reader must instantly see this page is for ${place}.
- Lead with the local answer: families in ${place} can buy a casket from ${name} and have it delivered overnight to any funeral home there; under the FTC Funeral Rule the funeral home must accept it and may not charge a handling fee.
- Keep it SHORT and specific to the place. Do not repeat the hub's general buying guide — link to the hub for that.
- Never invent ${place}-specific statutes, fees, cemeteries or funeral homes. The Funeral Rule is federal and real; for anything state-specific say to confirm with the state funeral board.
- Include at least two place-named FAQs ("Do funeral homes in ${place} have to accept a casket I bought online?").`,
  offlineSections: (tier, name, biz) =>
    tier === 3
      ? [
          { heading: `${name}: what's available`, purpose: "the models and finishes available" },
          { heading: `${name} prices at ${biz}`, purpose: "live price range and value" },
        ]
      : [
          { heading: `Types of ${name.toLowerCase()}`, purpose: "sub-types and what each is for" },
          { heading: `How to choose`, purpose: "the decisions that matter: material, size, interior" },
          { heading: `${name} prices at ${biz}`, purpose: "live catalog range vs funeral-home pricing" },
          { heading: `Delivery and funeral-home acceptance`, purpose: "overnight delivery; the FTC Funeral Rule" },
          ...(tier === 1 ? [{ heading: `Sizes and options`, purpose: "widths, gauges, interiors" }] : []),
        ],
  offlineQuestions: (kw, place) => [
    place ? `Do funeral homes in ${place} have to accept a casket I bought online?` : `Does a funeral home have to accept a casket I buy online?`,
    `How much do ${kw} cost?`,
    place ? `How fast can a casket be delivered in ${place}?` : `How fast can it be delivered?`,
    `What sizes are available?`,
    `Can I choose the interior?`,
    `What's included in the price?`,
    `Is a gasketed casket necessary?`,
    `How do I place an order?`,
  ],
  primer: `INDUSTRY PRIMER — CASKETS (direct-to-family, shipped to the funeral home)
- Buyers are families arranging a funeral in days, comparing the funeral home's casket room against buying online.
- Metal caskets: 20-gauge and 18-gauge steel (lower number = thicker), stainless, copper, bronze; gasketed ("protective") vs non-gasketed. Wood: poplar, pine, oak, cherry, mahogany, walnut, veneer. Oversized widths (28"+) for larger people; standard interior ~24" wide, ~79" long.
- The FTC Funeral Rule (federal) requires funeral homes to accept a casket bought elsewhere with no handling fee. It does not cover cemeteries.
- Typical funeral-home casket pricing is far above factory-direct; frame any market figure as "funeral homes commonly list…".`,
  materialWords: [
    "stainless steel", "steel", "bronze", "copper", "solid oak", "oak", "mahogany", "cherry", "walnut", "maple", "poplar",
    "pine", "veneer", "bamboo", "willow", "seagrass", "cardboard", "cloth-covered", "fiberglass", "marble", "ceramic",
    "brass", "aluminum", "wood", "metal",
  ],
  colourWords: [
    "black", "white", "silver", "gold", "blue", "navy", "red", "pink", "purple", "green", "brown", "grey", "gray",
    "copper", "bronze", "champagne", "orange", "ivory", "natural",
  ],
  styleWords: ["gasketed", "non-gasketed", "oversized", "full couch", "half couch", "cremation"],
  attributeExtractors: [
    { label: "Steel gauges offered", regex: /\b(16|18|20|22)\s*-?\s*(?:ga|gauge)\b/g, format: (m) => `${m[1]}-gauge` },
    { label: "Widths mentioned", regex: /\b(2[4-9]|3\d|4\d|5\d)\s*(?:"|”|-?\s?inch(?:es)?)\b/g, format: (m) => `${m[1]}"` },
  ],
  pillars: [
    { name: "Immediate steps", description: "What to do in the first hours/days after a death." },
    { name: "Costs", description: "Casket, funeral, cremation and burial pricing." },
    { name: "Buying guide", description: "How to choose caskets — size, material, value." },
    { name: "Local resources", description: "City/state funeral homes, benefits, regulations." },
    { name: "Eco options", description: "Green burial, biodegradable caskets." },
  ],
  blogLocalAngles: `    1. STATE LAW / DELIVERY: "Casket Delivery & Burial Laws in {State}: What Families Need to Know" — answers "can I buy my own casket in {State}, and will a funeral home accept it?" Anchored in the FTC Funeral Rule (federal, real) plus any state specifics. High trust, very quotable.
    2. CITY FUNERAL HOMES: "Funeral Homes in {City} That Accept Caskets You Buy Online" — answers the buyer's exact commercial question for that metro.
  Also fine: "Can you buy your own casket in {City/State}?", delivery speed to a metro, local cemeteries — always with genuine local substance.`,
  blogLocalGuidance: `- The Quick answer must be a self-contained, place-named, legally specific sentence an AI can quote whole. Template: "In {State}, families can buy a casket from any retailer and have it delivered to the funeral home — under the FTC Funeral Rule, the home cannot refuse it or charge a handling/'casket handling' fee." Adapt to the exact question, but always: name the place, state the rule, name the standard.
- Cover the buyer's real local questions with a dedicated H2 each, each answered in a standalone quotable passage:
  • The law: can you buy your own casket in {State}? What does the FTC Funeral Rule guarantee nationwide, and any {State}-specific rules? (Never invent a statute — cite the FTC Funeral Rule, which is federal and real; for state specifics, stay accurate or say to verify with the state funeral board.)
  • Delivery to {City}: how caskets ship to that metro in general terms (never fabricate our exact process/timeline — keep it broad and say to confirm with us).
  • Which local funeral homes accept a casket you bought online (explain the Funeral Rule requires them to, describe how to arrange it — do NOT assert a specific named home's fees/steps as fact).
  • Local considerations: major cemeteries/metro-area norms, at a general, accurate level.
- Link to authoritative sources for the legal points (the FTC Funeral Rule page on ftc.gov is ideal and real).
- Include an FAQ with place-named questions ("Can I buy my own casket in {City}?", "Do {City} funeral homes have to accept a casket I bought online?").
- Reflect the served area accurately (we ship nationwide; we are not a physical funeral home in that city — never imply a local storefront).`,
  blogOperationalRule:
    "our shipping and delivery PROCESS, delivery timelines or turnaround, what happens \"at hour X\", how or when a casket is built/crated/handed off, handling steps, or delivery guarantees. Do NOT invent hour-by-hour or day-by-day shipping schedules, named carriers, aircraft, airport routes, transfer points, or a step-by-step \"how a casket travels from order to delivery\" process.",
};

// ── Headstones & grave markers ─────────────────────────────────

const HEADSTONE_COLOUR =
  /\b(black|grey|gray|red|pink|blue|bahama-blue|blue-pearl|emerald-pearl|mahogany|white|green|brown|imperial-black|imperial-grey|imperial-red|desert-pink|medium-grey)\b/;

const HEADSTONES: IndustryPack = {
  key: "headstones",
  label: "headstones and grave markers",
  productNoun: "headstone",
  productPlural: "headstones",
  venue: "cemetery",
  hubHandles: new Set([
    "headstones",
    "all-headstones",
    "grave-markers",
    "upright-headstones",
    "slant-headstones",
    "flat-headstones",
    "flat-markers",
    "pillow-headstones",
    "bevel-markers",
    "double-headstones",
    "companion-headstones",
    "monuments",
  ]),
  hubPattern: /^(all-)?(headstones|gravestones|grave-markers|monuments|memorials|upright-headstones|slant-headstones|flat-headstones|flat-markers|pillow-headstones|bevel-markers|double-headstones|companion-headstones|single-headstones)$/,
  colourPattern: HEADSTONE_COLOUR,
  authorityLinks: [
    { title: "VA headstones, markers and medallions (National Cemetery Administration)", url: "https://www.cem.va.gov/hmm/" },
    { title: "Veterans memorial items — eligibility and how to apply (VA.gov)", url: "https://www.va.gov/burials-memorials/memorial-items/headstones-markers-medallions/" },
    { title: "The FTC Funeral Rule (consumer guide)", url: "https://consumer.ftc.gov/articles/ftc-funeral-rule" },
    { title: "Monument Builders of North America", url: "https://monumentbuilders.org" },
  ],
  authorityNames: "VA / National Cemetery Administration, the FTC, MBNA",
  legalRule:
    "CEMETERY RULES (real, and the honest version): a family may buy a headstone from any monument dealer, and cemeteries generally accept an outside memorial that meets their written requirements (size, thickness, material, style for that section, foundation, plot number) — but each cemetery sets its own rules and usually charges its own setting/foundation fee, paid to the cemetery. State it that way. The FTC Funeral Rule protects families at FUNERAL HOMES; it does NOT govern cemeteries or monument dealers — never claim it forces a cemetery to accept a headstone. Veterans: the VA furnishes a government headstone, marker or medallion at no charge for an eligible veteran in any cemetery (setting fees at a private cemetery are the family's; spouses/dependents qualify only in national or state veterans cemeteries) — link the VA for that.",
  legalDontSay:
    "Never cite a state statute by number, never state a specific cemetery's fees or rules as fact, never say the Funeral Rule applies to cemeteries, never promise installation.",
  rulesSectionName: "cemetery requirements",
  requiredSections:
    'a "prices" section using the live range (and say clearly that cemetery installation/setting fees are separate and paid to the cemetery), a "sizes & cemetery requirements" section (what to confirm with the cemetery before ordering: allowed style for the section, size and thickness, foundation, plot number, colour or material limits), and a "shipping, timing & installation" section (from STORE POLICY: turnaround, free standard freight where the policy says so, delivery to the cemetery or a business address, who installs)',
  tableHint: "styles (flat / pillow / slant / upright) by height, footprint, base, visibility and typical use — only sizes from the catalog",
  promiseRule:
    "Turnaround, shipping and guarantee claims come ONLY from STORE POLICY / BUSINESS CONTEXT (e.g. a 60-day turnaround on in-stock granite, free standard shipping in the continental U.S. to a business address). Prices never include installation — say so once.",
  localRules: (place, name) => `THIS IS A LOCAL PAGE FOR ${place.toUpperCase()} — the same catalog, for families there:
- Name ${place} in the H1, the first sentence of the intro, the SEO title and at least two section headings.
- Lead with the local answer: families in ${place} can order a headstone from ${name} and have it shipped to their cemetery or a local business address; the cemetery's own rules on size, style and foundation apply, and its setting fee is paid to the cemetery.
- Keep it SHORT and specific to the place. Link to the hub for the general buying guide.
- Never invent ${place}-specific statutes, cemetery fees, named cemeteries' rules, or installers. For state specifics say to confirm with the cemetery office and the state's cemetery board.
- Include at least two place-named FAQs ("Can I buy a headstone online for a cemetery in ${place}?", "Who installs a headstone in ${place}?").`,
  offlineSections: (tier, name, biz) =>
    tier === 3
      ? [
          { heading: `${name}: what's available`, purpose: "the styles, sizes and granite colours available" },
          { heading: `${name} prices at ${biz}`, purpose: "live price range; installation is separate" },
        ]
      : [
          { heading: `Types of ${name.toLowerCase()}`, purpose: "flat, pillow, slant, upright, special shapes — and where each is allowed" },
          { heading: `Sizes and cemetery requirements`, purpose: "what to confirm with the cemetery before ordering" },
          { heading: `${name} prices at ${biz}`, purpose: "live catalog range vs monument-dealer pricing; setting fees separate" },
          { heading: `Design, inscription and photos`, purpose: "single vs companion, lettering, emblems, ceramic portraits" },
          { heading: `Shipping, timing and installation`, purpose: "turnaround and delivery from STORE POLICY; who installs" },
          ...(tier === 1 ? [{ heading: `Granite colours and finishes`, purpose: "the colours in the catalog; polished vs rock-pitch" }] : []),
        ],
  offlineQuestions: (kw, place) => [
    place ? `Can I buy a headstone online for a cemetery in ${place}?` : `Can I buy a headstone online instead of from the cemetery?`,
    `How much do ${kw} cost?`,
    `What size headstone does my cemetery allow?`,
    `Does the price include installation?`,
    `How long does a headstone take?`,
    `What is the difference between a flat marker, a slant and an upright?`,
    `Can I add a photo to the headstone?`,
    `Are veterans entitled to a free headstone?`,
  ],
  primer: `INDUSTRY PRIMER — HEADSTONES & GRAVE MARKERS (custom granite, sold online, shipped to the cemetery)
- Buyers: a family marking a grave weeks to months after the burial; often also comparing a cemetery's or funeral home's monument quote. They are anxious about the cemetery's rules and about ordering something permanent online.
- STYLES (low to tall): FLAT / flush markers lie level with the lawn (typ. 16"x8"x3", 20"x10"x3", 24"x12"x4", 28"x16"x4", 36"x14"x4"; companion flats wider). PILLOW / bevel markers sit on the ground with a sloped top (typ. 20"x10"x6" to 36"x12"x6"). SLANT markers are ~10" thick and ~16" tall with a slanted face, often on a base (base 24"–52"), with or without vases. UPRIGHT monuments are a ~6" thick tablet (20"–24" tall, 24"–48" wide) standing on a granite base (36"–66" wide, 12" deep), optional vases. SPECIAL SHAPES: hearts, double hearts, teardrops, angels. SINGLE vs COMPANION (two names, one stone) layouts.
- MATERIALS: granite is the standard (durable, holds polish and carving); colours in this trade include grey, black, Bahama blue, blue pearl, pink, red, mahogany, medium grey, "imperial" black/grey/red. Bronze plaques on granite exist. Marble is soft and many cemeteries restrict it. Finishes: polished faces, rock-pitch (rough) sides, "not polished" backs.
- PERSONALIZATION: names, dates, epitaph; fonts and layouts; emblems/clipart (religious, military, hobbies); ceramic photo portraits (kiln-fired, black & white or colour, oval/rectangle/heart/circle, inlaid flush); painted lettering (monument-grade paint, lithochrome); plot number engraved where the cemetery requires it; proofs/layouts before production. Carving is sand-blast (sand-carving) or laser etching.
- CEMETERY RULES drive everything: each cemetery (and each section) sets allowed styles (many lawn sections are flat-only), maximum size and thickness by plot width, foundation requirements (poured concrete or granite base for uprights and slants), who may install (often only the cemetery's own crew or an approved installer), colour/material limits, plot-number placement, and design approval. Setting/installation and foundation fees are separate and paid to the cemetery (market context: commonly a few hundred dollars). The family must confirm the rules in writing BEFORE ordering; the seller cannot guarantee acceptance.
- LAW: the FTC Funeral Rule applies to funeral homes, not cemeteries or monument dealers. Cemeteries generally accept outside memorials that meet their rules; some states regulate cemetery conduct through a cemetery board — never quote a statute. VETERANS: the VA furnishes a free government headstone/marker (granite or marble upright, flat granite/marble/bronze, or a bronze medallion for a private stone) for eligible veterans in any cemetery; private-cemetery setting fees are the family's; spouses/dependents only in national/state veterans cemeteries. Application: VA Form 40-1330 (medallion: 40-1330M).
- TIMING: custom granite typically takes weeks (industry 6–10 weeks; ceramic photos add time); ships by freight, usually to the cemetery or a business address; inspect for damage before signing. Weight: a 24"x12"x4" flat ~120 lb; a 30"x12"x6" pillow ~235 lb; uprights with base several hundred pounds.
- MARKET CONTEXT (frame as "typically"/"monument dealers commonly"): flat markers a few hundred to ~$1,500; uprights $1,000–$5,000+; most families spend $1,000–$3,000 all-in; installation $200–$800.
- BUYER QUESTIONS: what does my cemetery allow; flat vs upright; single vs companion; what to engrave / epitaph ideas; can I add a photo; how long; who installs; what does it cost and is installation included; veterans' benefits; who owns the headstone; can the cemetery move it; how to clean granite.
- NEVER: promise installation, quote a named cemetery's fees, cite a statute, claim the Funeral Rule covers cemeteries, invent turnaround or shipping terms beyond STORE POLICY, or use "tombstone" as the primary term (use headstone / grave marker / monument).`,
  materialWords: ["granite", "bronze", "marble", "ceramic", "porcelain", "limestone", "sandstone", "slate", "stainless steel"],
  colourWords: [
    "grey", "gray", "medium grey", "black", "imperial black", "imperial grey", "imperial red", "bahama blue", "blue pearl",
    "emerald pearl", "pink", "desert pink", "red", "mahogany", "blue", "white", "brown", "green",
  ],
  styleWords: ["flat", "flush", "pillow", "bevel", "slant", "serp top", "upright", "companion", "single", "double", "heart", "teardrop", "angel", "cross", "vase", "base", "polished", "rock pitch", "not polished", "ceramic photo", "portrait"],
  attributeExtractors: [
    {
      label: "Sizes in the catalog (W x D x H)",
      regex: /\b(\d{2})\s*(?:"|″|”)?\s*x\s*(\d{1,2})\s*(?:"|″|”)?\s*x\s*(\d{1,2})\s*(?:"|″|”)/gi,
      format: (m) => `${m[1]}" x ${m[2]}" x ${m[3]}"`,
    },
    {
      label: "Base widths",
      regex: /\b(\d{2})\s*(?:"|″|”)?\s*base\b/gi,
      format: (m) => `${m[1]}" base`,
    },
    {
      label: "Weights stated",
      regex: /\b(?:approx\.?\s*)?(\d{2,4})\s*lbs?\b/gi,
      format: (m) => `${m[1]} lb`,
    },
  ],
  pillars: [
    { name: "Immediate steps", description: "What to do after a burial: marking the grave, timelines, who to call." },
    { name: "Costs", description: "Headstone, marker, engraving, foundation and cemetery fee pricing." },
    { name: "Buying guide", description: "How to choose a headstone — style, size, granite colour, single vs companion." },
    { name: "Cemetery rules & installation", description: "Section rules, foundations, setting fees, approvals, who installs." },
    { name: "Design & inscriptions", description: "Epitaphs, fonts, emblems, ceramic photos, layouts." },
    { name: "Veterans & benefits", description: "VA headstones, markers, medallions, eligibility, how to apply." },
  ],
  blogLocalAngles: `    1. CEMETERY RULES BY STATE: "Buying a Headstone Online in {State}: Cemetery Rules, Fees and What to Confirm First" — answers "can I buy my own headstone in {State}, will the cemetery accept it, and what will it charge to set it?" Anchored in how cemetery regulations actually work (each cemetery's written rules; setting fees paid to the cemetery; the FTC Funeral Rule does NOT cover cemeteries) plus any real state cemetery-board specifics. High trust, very quotable.
    2. CITY CEMETERIES: "Headstone Rules at Cemeteries in {City}: Sizes, Styles and Setting Fees" — answers the buyer's exact question for that metro at a general, accurate level (never a named cemetery's fees as fact).
  Also fine: "How long does a headstone take in {State}?", veterans' headstones in {State} (VA benefit is federal), granite colours popular regionally — always with genuine local substance.`,
  blogLocalGuidance: `- The Quick answer must be a self-contained, place-named, accurate sentence an AI can quote whole. Template: "In {State}, families can buy a headstone from any monument dealer and have it delivered to the cemetery — the cemetery applies its own written rules on size, style and foundation, and charges its own setting fee. The FTC Funeral Rule covers funeral homes, not cemeteries." Adapt to the exact question, but always: name the place, state the real rule, name the real authority.
- Cover the buyer's real local questions with a dedicated H2 each, each answered in a standalone quotable passage:
  • The rules: can you buy your own headstone in {State}? What do cemeteries generally require (allowed styles per section, size/thickness, foundation, plot number, approved installers, setting fees), and any real {State} cemetery-board specifics? (Never invent a statute; for state specifics stay accurate or say to verify with the state cemetery board.)
  • Delivery to {City}: how headstones ship to that metro in general terms — freight, to the cemetery or a business address — never fabricate our exact process/timeline; say to confirm with us.
  • Installation in {City}: who sets a headstone (the cemetery's crew or an approved installer), typical fee ranges framed as "typically", and that fees are paid to the cemetery — do NOT assert a specific named cemetery's fees/steps as fact.
  • Veterans in {State}: the VA furnishes a free headstone/marker/medallion for eligible veterans in any cemetery; setting fees at private cemeteries are the family's. Link the VA.
- Link to authoritative sources: the VA's headstones and markers page (cem.va.gov/hmm) and, for the "what the Funeral Rule does not cover" point, the FTC consumer guide.
- Include an FAQ with place-named questions ("Can I buy a headstone online for a cemetery in {City}?", "Who installs a headstone in {City}?").
- Reflect the served area accurately (we ship nationwide; we are not a local monument yard or cemetery in that city — never imply a local storefront or installation crew).`,
  blogOperationalRule:
    "our production or shipping PROCESS, turnaround or delivery timelines beyond what our policy pages state, how or when a stone is quarried/cut/carved/crated/handed off, named carriers or freight routes, installation promises, or guarantees. Do NOT invent day-by-day production or shipping schedules or a step-by-step \"how a headstone travels from order to the cemetery\" process.",
};

// ── General (anything else) ────────────────────────────────────

const GENERAL: IndustryPack = {
  ...HEADSTONES,
  key: "general",
  label: "products",
  productNoun: "product",
  productPlural: "products",
  venue: "buyer",
  hubHandles: new Set(),
  hubPattern: /^(all|shop|all-products)$/,
  colourPattern: CASKET_COLOUR,
  authorityLinks: [],
  authorityNames: "recognized standards bodies",
  legalRule: "Make no legal or regulatory claims unless BUSINESS CONTEXT states them.",
  legalDontSay: "Never cite a statute, regulator, or third party's policy as fact.",
  rulesSectionName: "what to know before you buy",
  requiredSections: 'a "prices" section using the live range and a "shipping & returns" section (from STORE POLICY)',
  tableHint: "the main options in the catalog compared",
  promiseRule: "Delivery, shipping and guarantee claims come ONLY from STORE POLICY.",
  localRules: (place, name) => `THIS IS A LOCAL PAGE FOR ${place.toUpperCase()}: name ${place} in the H1, intro, SEO title and two headings; keep it short; link to the hub; never invent ${place}-specific rules, fees or businesses. ${name} ships nationwide.`,
  offlineSections: (tier, name, biz) => [
    { heading: `Types of ${name.toLowerCase()}`, purpose: "what's in the collection" },
    { heading: `${name} prices at ${biz}`, purpose: "live price range" },
    ...(tier === 3 ? [] : [{ heading: `Shipping and returns`, purpose: "from STORE POLICY" }]),
  ],
  offlineQuestions: (kw) => [`How much do ${kw} cost?`, `How long does delivery take?`, `What is the return policy?`, `How do I order?`],
  primer: "",
  styleWords: [],
  attributeExtractors: [],
  pillars: [
    { name: "Buying guide", description: "How to choose." },
    { name: "Costs", description: "What things cost." },
    { name: "How-to", description: "Using and caring for the products." },
  ],
  blogLocalAngles: `    Local pages must carry genuine local substance (real regional norms, real institutions) — never a thin "we ship to {City}" template.`,
  blogLocalGuidance: `- Name the city and state in the H1 and the Quick answer; keep every local claim general and accurate; we ship nationwide and have no local storefront.`,
  blogOperationalRule: "our fulfilment or shipping PROCESS, timelines, carriers, or guarantees beyond what our policy pages state.",
};

export const INDUSTRIES: Record<IndustryKey, IndustryPack> = { caskets: CASKETS, headstones: HEADSTONES, general: GENERAL };

/** Which line of business a store is in, from its name, domain and profile. */
export function industryFor(biz: { name?: string | null; domain?: string | null; profileMd?: string | null }): IndustryPack {
  const hay = `${biz.name ?? ""} ${biz.domain ?? ""} ${(biz.profileMd ?? "").slice(0, 1500)}`.toLowerCase();
  const score = (words: string[]) => words.reduce((n, w) => n + (hay.split(w).length - 1), 0);
  const stones = score(["headstone", "grave marker", "gravestone", "monument", "memorial", "tombstone"]);
  const boxes = score(["casket", "coffin", "urn"]);
  if (stones > boxes && stones > 0) return HEADSTONES;
  if (boxes > 0) return CASKETS;
  return GENERAL;
}
