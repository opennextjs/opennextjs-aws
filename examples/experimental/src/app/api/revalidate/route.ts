import { revalidateTag } from "next/cache";

export function GET() {
  revalidateTag("fullyTagged");
  return new Response("DONE");
}
