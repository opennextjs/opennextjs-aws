import { revalidateTag } from "next/cache";

export function GET() {
  revalidateTag("fullyTagged", { expire: 0 });
  return new Response("DONE");
}
