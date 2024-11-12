import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const dateFn = unstable_cache(() => new Date().toISOString(), ["date"], {
    tags: ["date"],
  });
  const date = await dateFn();
  console.log("date", date);
  return NextResponse.json({ date: date });
}
