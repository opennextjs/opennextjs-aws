import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const dateFn = unstable_cache(async () => new Date().toISOString(), ["date"], {
    tags: ["date"],
  });
  const date = await dateFn();
  return NextResponse.json({ date });
}
