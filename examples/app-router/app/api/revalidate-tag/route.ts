import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  revalidateTag("revalidate", { expire: 0 });

  return new Response("ok");
}
