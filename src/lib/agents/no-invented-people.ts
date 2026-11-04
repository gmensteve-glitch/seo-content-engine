// No invented people in a blog, ever: no pen names or personas, no "About the
// Author" sections, no made-up staff names, no invented quotes or customer
// stories. The writer is told so; this file is the deterministic backstop.
//
// - stripAuthorSections removes author/reviewer sections and byline lines
//   outright (a byline is chosen by the operator from the store's real Shopify
//   authors at copy time, never written into the body).
// - inventedPeopleFlags finds lines that LOOK like an invented quote or story,
//   for the operator to check in the copy package. It only flags; deciding
//   whether a quote is real needs a person.

const AUTHOR_HEADING =
  /^(#{1,6})\s+(?:\*\*)?(?:about\s+(?:the|our|this)\s+(?:author|writer|reviewer|expert)s?|meet\s+(?:the|our)\s+(?:author|writer|expert|team)|author\s+bio|about\s+me|written\s+by|reviewed\s+by|fact[- ]checked\s+by|our\s+(?:expert|author)s?)\b/i;

const BYLINE =
  /^\s*[*_]*\s*(?:by|written\s+by|reviewed\s+by|fact[- ]checked\s+by|medically\s+reviewed\s+by|author)\s*[:\-–—]?\s+[A-Z][^\n]{0,100}$/i;

/** Remove "About the Author"-style sections and byline lines. */
export function stripAuthorSections(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let skipLevel = 0; // >0 while inside an author section of that heading level
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^(#{1,6})\s/);
    if (skipLevel) {
      if (heading && heading[1].length <= skipLevel) skipLevel = 0;
      else continue;
    }
    const author = line.match(AUTHOR_HEADING);
    if (author) {
      skipLevel = author[1].length;
      continue;
    }
    // Byline lines: anywhere a line is only "By Jane Doe" / "*Reviewed by …*".
    if (BYLINE.test(line.trim()) && line.trim().split(/\s+/).length <= 14) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const FLAGS: { re: RegExp; why: string }[] = [
  { re: /["“][^"”]{12,}["”]\s*,?\s*(?:says|said|explains|explained|recalls|recalled|told us|adds|notes)\b/i, why: "a quote attributed to someone" },
  { re: /(?:says|said|explains|recalls|told us)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/, why: "a quote attributed to a named person" },
  { re: /(?:^|\s)[—–-]\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s*,\s*[A-Za-z ]{3,40}$/, why: "a quote signed with a name and title" },
  { re: /\b(?:one|a)\s+(?:family|customer|client|widow|widower|daughter|son|mother|father)\s+(?:we|I)\s+(?:worked|helped|spoke)\b/i, why: "a customer story" },
  { re: /\b(?:one|a|another)\s+(?:of our\s+)?(?:customers?|clients?|families)\s+(?:told|wrote|shared|said|recently)\b/i, why: "a customer story" },
  { re: /\b(?:Mr|Mrs|Ms|Dr)\.\s+[A-Z][a-z]+/, why: "a named individual" },
  { re: /\b(?:I|I've|I have)\s+(?:helped|worked with|spent|seen)\b/, why: "a first-person persona" },
  { re: /\bin my (?:\d+|many|years|decades)\b/i, why: "a first-person persona" },
  { re: /\bour (?:founder|owner|team member|staff member|specialist|designer|engraver)\s+[A-Z][a-z]+/, why: "a named staff member" },
];

/** Lines that may contain an invented person, quote or story (for a human to check). */
export function inventedPeopleFlags(md: string, max = 8): { line: string; why: string }[] {
  const out: { line: string; why: string }[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("```")) continue;
    for (const f of FLAGS) {
      if (f.re.test(line)) {
        out.push({ line: line.length > 220 ? `${line.slice(0, 217)}…` : line, why: f.why });
        break;
      }
    }
    if (out.length >= max) break;
  }
  return out;
}
