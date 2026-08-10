// Seed the database with the same sample businesses the dashboard used to read
// from src/lib/mock/seed.ts, so a live DB renders the UI identically.
//
// Idempotent: clears the seeded businesses (cascades to all their rows) and
// recreates them. Run with `npx prisma db seed` or `node prisma/seed.mjs`.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TC = "trustedcaskets";
const OC = "overnightcaskets";
const DEMO = "demo";

async function main() {
  // Wipe seeded businesses (onDelete: Cascade clears every child row).
  await prisma.business.deleteMany({ where: { id: { in: [TC, OC, DEMO] } } });

  // ── Trusted Caskets — the active, fully-populated business ──────────────
  const tc = await prisma.business.create({
    data: {
      id: TC,
      name: "Trusted Caskets",
      domain: "trustedcaskets.com",
      cmsPlatform: "SHOPIFY",
      status: "ACTIVE",
      qualityThreshold: 85,
      linksPerPage: 4,
      cadencePerWeek: 5,
    },
  });

  // Pillars
  const pillars = {};
  for (const [key, name, description] of [
    ["immediate", "Immediate steps", "What to do in the first hours and days."],
    ["costs", "Costs", "Pricing, comparisons, what things really cost."],
    ["buying", "Buying guide", "How to choose caskets and services."],
    ["local", "Local resources", "City- and state-level guidance."],
    ["eco", "Eco options", "Green burial and sustainable choices."],
  ]) {
    pillars[key] = await prisma.pillar.create({
      data: { businessId: tc.id, name, description },
    });
  }

  // Idea box — PROPOSED, auto-scored (shows in Ideas + top 3 in the board)
  const proposedIdeas = [
    ["First 48 hours after a death", 96, "immediate", "2,400/mo, very high intent, low competition — grieving families search this first."],
    ["Cremation vs burial cost", 94, "costs", "High volume comparison; we can win with a material-by-material cost table nobody else has."],
    ["How to choose a casket: size, material, price", 92, "buying", "Directly transactional; ties to product pages."],
    ["Veteran burial benefits, state by state", 89, "local", "Programmatic geo potential; underserved."],
    ["What is a green burial?", 85, "eco", "Growing trend; strong AEO/citation potential."],
  ];
  for (const [title, score, pillarKey, rationale] of proposedIdeas) {
    await prisma.idea.create({
      data: {
        businessId: tc.id,
        pillarId: pillars[pillarKey].id,
        title,
        score,
        rationale,
        status: "PROPOSED",
      },
    });
  }

  // Pending briefs — the one human gate (Briefs page + board "briefs" column)
  await createBrief(tc.id, pillars.local.id, {
    ideaTitle: "Funeral homes in Austin, TX — a family's guide",
    targetKeyword: "funeral homes austin tx",
    contentType: "GEO",
    angle:
      "Be the trusted local resource: vetted funeral homes (4.4★+), first steps, and costs — not a sales pitch.",
    wordTarget: 1600,
    questions: [
      "How much does a funeral cost in Austin?",
      "What are the best-rated funeral homes near me?",
      "What paperwork is needed when someone dies in Texas?",
    ],
    requiredSchema: ["FAQPage", "LocalBusiness", "HowTo"],
  });
  await createBrief(tc.id, pillars.eco.id, {
    ideaTitle: "Green burial: what it costs and where it's allowed",
    targetKeyword: "green burial cost",
    contentType: "BLOG",
    angle:
      "The only guide that breaks cost down by option AND maps state-by-state legality.",
    wordTarget: 1800,
    questions: [
      "Is green burial cheaper than traditional?",
      "Which states allow home/green burial?",
      "Do you need a casket for a green burial?",
    ],
    requiredSchema: ["FAQPage", "Article"],
  });

  // In-progress drafts (board "in progress" column)
  await createDraft(tc.id, pillars.buying.id, {
    title: "Casket sizes guide",
    targetKeyword: "casket sizes",
    draftStatus: "RESEARCHING",
  });
  const prepaid = await createDraft(tc.id, pillars.costs.id, {
    title: "Prepaid funeral plans",
    targetKeyword: "prepaid funeral plans",
    draftStatus: "GRADING",
  });
  // A failing/in-progress grade (below threshold) → keeps it in the loop.
  await prisma.grade.create({
    data: {
      draftId: prepaid.draftId,
      overall: 88,
      passed: false,
      version: 1,
      dimensions: {
        intentMatch: { score: 13, max: 15, note: "Good, tighten the intro answer." },
        depth: { score: 13, max: 15, note: "Add the fine-print risks competitors skip." },
        eeat: { score: 12, max: 15, note: "Needs a real cost example or expert quote." },
        aeo: { score: 14, max: 15, note: "Schema valid; add one more FAQ." },
        originality: { score: 8, max: 10, note: "Fresh angle, trim hedging." },
        linking: { score: 9, max: 10, note: "One more backward link." },
        readability: { score: 9, max: 10, note: "Clear structure." },
        conversion: { score: 10, max: 10, note: "Soft CTA present." },
      },
      feedback: "Below 90: strengthen E-E-A-T with a concrete prepaid-plan cost range.",
    },
  });

  // Scheduled drafts (PASSED, awaiting publish) — board "scheduled" column
  const tenQ = await createDraft(tc.id, pillars.buying.id, {
    title: "10 questions to ask a funeral director",
    targetKeyword: "questions to ask a funeral director",
    draftStatus: "PASSED",
  });
  // The passing scorecard shown on the Quality page (latest passed grade).
  await prisma.grade.create({
    data: {
      draftId: tenQ.draftId,
      overall: 93,
      passed: true,
      version: 2,
      dimensions: {
        intentMatch: { score: 14, max: 15, note: "Directly answers the query in the intro." },
        depth: { score: 13, max: 15, note: "Covers 2 subtopics rivals miss." },
        eeat: { score: 12, max: 15, note: "Add one real cost figure or a director quote to reach full marks." },
        aeo: { score: 15, max: 15, note: "FAQ + HowTo schema valid; passages in citable range." },
        originality: { score: 9, max: 10, note: "Fresh framing, no slop tells." },
        linking: { score: 10, max: 10, note: "4 relevant links, forward + backward." },
        readability: { score: 10, max: 10, note: "Clear headings, short paragraphs." },
        conversion: { score: 10, max: 10, note: "Soft CTA at top and bottom." },
      },
      feedback:
        "Strong. To hit 96: add a first-hand detail under E-E-A-T (a real price range or a quote from a funeral director).",
    },
  });
  await createDraft(tc.id, pillars.local.id, {
    title: "Veteran burial benefits by state",
    targetKeyword: "veteran burial benefits",
    draftStatus: "PASSED",
  });
  await createDraft(tc.id, pillars.immediate.id, {
    title: "What to do when someone dies at home",
    targetKeyword: "what to do when someone dies at home",
    draftStatus: "PASSED",
  });

  // Live pages + 28-day performance (Performance page + board "live" column)
  await createLivePage(tc.id, pillars.costs.id, {
    title: "Casket price guide",
    url: "/blogs/guides/casket-price-guide",
    position: 11,
    ctr: 1.4,
    clicks: 240,
    impressions: 17140,
  });
  await createLivePage(tc.id, pillars.buying.id, {
    title: "Metal vs wood caskets",
    url: "/blogs/guides/metal-vs-wood-caskets",
    position: 6,
    ctr: 0.6,
    clicks: 90,
    impressions: 15000,
  });
  await createLivePage(tc.id, pillars.costs.id, {
    title: "Cheapest states to be buried in",
    url: "/blogs/guides/cheapest-states-burial",
    position: 4,
    ctr: 3.1,
    clicks: 410,
    impressions: 13230,
  });
  await createLivePage(tc.id, pillars.immediate.id, {
    title: "What to do when someone dies",
    url: "/blogs/guides/what-to-do-when-someone-dies",
    position: 8,
    ctr: 2.2,
    clicks: 180,
    impressions: 8180,
  });

  // Connectors (Connectors page). Firecrawl is a global env key, not a row.
  for (const [type, status] of [
    ["GSC", "CONNECTED"],
    ["DATAFORSEO", "CONNECTED"],
    ["GA4", "DISCONNECTED"],
    ["GOOGLE_MAPS", "DISCONNECTED"],
    ["SHOPIFY", "CONNECTED"],
  ]) {
    await prisma.connector.create({
      data: {
        businessId: tc.id,
        type,
        status,
        configEnc: "seed-placeholder", // real tokens are AES-GCM encrypted at runtime
        lastSyncAt: status === "CONNECTED" ? new Date() : null,
      },
    });
  }

  // ── Overnight Caskets — onboarding, nothing connected yet ────────────────
  const oc = await prisma.business.create({
    data: {
      id: OC,
      name: "Overnight Caskets",
      domain: "overnightcaskets.com",
      cmsPlatform: "SHOPIFY",
      status: "ONBOARDING",
    },
  });
  for (const type of ["GSC", "DATAFORSEO", "SHOPIFY"]) {
    await prisma.connector.create({
      data: { businessId: oc.id, type, status: "DISCONNECTED", configEnc: "seed-placeholder" },
    });
  }

  // ── Demo Co — paused, minimal (only appears in the switcher) ─────────────
  await prisma.business.create({
    data: {
      id: DEMO,
      name: "Demo Co",
      domain: "example.com",
      cmsPlatform: "WORDPRESS",
      status: "PAUSED",
    },
  });

  console.log("Seeded:", { trustedcaskets: TC, overnightcaskets: OC, demo: DEMO });
}

/** Idea (BRIEFED) → Brief (PENDING_APPROVAL). */
async function createBrief(businessId, pillarId, b) {
  const idea = await prisma.idea.create({
    data: { businessId, pillarId, title: b.ideaTitle, status: "BRIEFED" },
  });
  await prisma.brief.create({
    data: {
      businessId,
      ideaId: idea.id,
      targetKeyword: b.targetKeyword,
      angle: b.angle,
      wordTarget: b.wordTarget,
      questions: b.questions,
      requiredSchema: b.requiredSchema,
      contentType: b.contentType,
      status: "PENDING_APPROVAL",
    },
  });
}

/** Idea (BRIEFED) → Brief (APPROVED) → Draft. Returns { ideaId, briefId, draftId }. */
async function createDraft(businessId, pillarId, d) {
  const idea = await prisma.idea.create({
    data: { businessId, pillarId, title: d.title, status: "BRIEFED" },
  });
  const brief = await prisma.brief.create({
    data: {
      businessId,
      ideaId: idea.id,
      targetKeyword: d.targetKeyword,
      wordTarget: 1600,
      requiredSchema: [],
      contentType: "BLOG",
      status: "APPROVED",
    },
  });
  const draft = await prisma.draft.create({
    data: {
      businessId,
      briefId: brief.id,
      title: d.title,
      bodyMd: `# ${d.title}\n\n(draft body)`,
      version: 1,
      status: d.draftStatus,
    },
  });
  return { ideaId: idea.id, briefId: brief.id, draftId: draft.id };
}

/** Full chain → published Page with a PagePerformance row. */
async function createLivePage(businessId, pillarId, p) {
  const { draftId } = await createDraft(businessId, pillarId, {
    title: p.title,
    targetKeyword: p.title.toLowerCase(),
    draftStatus: "PUBLISHED",
  });
  const page = await prisma.page.create({
    data: {
      businessId,
      draftId,
      url: p.url,
      cmsId: `shopify_${Math.abs(hash(p.url))}`,
      contentType: "BLOG",
      publishedAt: new Date(),
    },
  });
  await prisma.pagePerformance.create({
    data: {
      pageId: page.id,
      date: new Date(),
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: p.ctr,
      position: p.position,
    },
  });
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
