// Near-duplicate detection for blog topics. An exact-title check misses the
// common case ("How Much Does an Upright Headstone Cost? Tablet and Base Sizes…"
// vs "How Much Does an Upright Granite Headstone Cost? Tablet Sizes, Bases…"),
// so topics are compared by their content words. A topic for a different place
// is never a duplicate: "Buying a Headstone Online in Ohio" and "… in Texas" are
// two pages on purpose.

const STOP = new Set(
  (
    "a an and are as at be by can do does for from how i in is it its me my of on or our than that the their " +
    "them they this to vs versus what when where which who whom why will with you your much many really " +
    "actually guide complete explained know need needs should things thing first before after about into " +
    "every each per most more best top 2024 2025 2026 2027 updated realistic"
  ).split(" "),
);

const STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida",
  "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska",
  "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas",
  "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "puerto rico",
];

const CITIES = [
  "los angeles", "chicago", "houston", "phoenix", "philadelphia", "san antonio", "san diego", "dallas",
  "austin", "san jose", "jacksonville", "fort worth", "columbus", "charlotte", "indianapolis", "san francisco",
  "seattle", "denver", "nashville", "oklahoma city", "boston", "el paso", "portland", "las vegas", "detroit",
  "memphis", "louisville", "baltimore", "milwaukee", "albuquerque", "tucson", "fresno", "sacramento",
  "kansas city", "mesa", "atlanta", "omaha", "colorado springs", "raleigh", "miami", "long beach",
  "virginia beach", "oakland", "minneapolis", "tulsa", "tampa", "arlington", "new orleans", "cleveland",
  "pittsburgh", "cincinnati", "st louis", "orlando", "buffalo", "richmond", "salt lake city", "honolulu",
  "brooklyn", "queens", "bronx", "long island", "dmv", "dc", "d c", "twin cities", "bay area", "tampa bay",
  "inland empire", "charleston", "greenville", "birmingham", "boise", "spokane", "des moines", "anchorage",
];

const PLACES = [...STATES, ...CITIES].sort((a, b) => b.length - a.length);

function norm(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** The places a title names ("north carolina", "charlotte"), longest match first. */
export function placesIn(title: string): Set<string> {
  let t = norm(title);
  const out = new Set<string>();
  for (const p of PLACES) {
    if (t.includes(` ${p} `)) {
      out.add(p);
      t = t.split(` ${p} `).join(" "); // "west virginia" must not also count as "virginia"
    }
  }
  return out;
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("es") && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Content words of a title, place names removed, lightly stemmed. */
export function topicWords(title: string): Set<string> {
  let t = norm(title.replace(/colour/gi, "color"));
  for (const p of PLACES) t = t.split(` ${p} `).join(" ");
  const words = t
    .split(" ")
    .filter((w) => w && !STOP.has(w)) // before stemming: "does" must not survive as "doe"
    .map(stem)
    .filter((w) => w.length > 1 && !STOP.has(w));
  return new Set(words);
}

const memo = new Map<string, { places: Set<string>; words: Set<string> }>();
function features(title: string): { places: Set<string>; words: Set<string> } {
  let f = memo.get(title);
  if (!f) {
    if (memo.size > 5000) memo.clear();
    f = { places: placesIn(title), words: topicWords(title) };
    memo.set(title, f);
  }
  return f;
}

/** Similarity of two topics (0–1); 0 when they target different places. */
export function topicSimilarity(a: string, b: string): number {
  const { places: pa, words: wa } = features(a);
  const { places: pb, words: wb } = features(b);
  if (pa.size !== pb.size || [...pa].some((p) => !pb.has(p))) return 0;
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  // Jaccard only. A "short title contained in a long one" rule looked tempting but
  // swallowed every specific idea under a broad live post ("how much does a
  // headstone cost" ate "upright headstone cost: tablet and base sizes…").
  return inter / (wa.size + wb.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.6;

/** The first existing title this one duplicates, or null. */
export function findDuplicate(title: string, existing: Iterable<string>): string | null {
  for (const e of existing) {
    if (topicSimilarity(title, e) >= DUPLICATE_THRESHOLD) return e;
  }
  return null;
}
