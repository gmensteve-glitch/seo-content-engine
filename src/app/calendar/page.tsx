// The content calendar was removed — pieces go straight from Ready to Shopify.
// Kept as a redirect so any old bookmark/link lands on the Ready list.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  redirect("/ready");
}
