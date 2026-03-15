import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  // Revalidate with expire:10 to mark the tag as stale immediately and set expiry to 10 seconds later
  revalidateTag("revalidate-stale", { expire: 10});

  return new Response("ok");
}
