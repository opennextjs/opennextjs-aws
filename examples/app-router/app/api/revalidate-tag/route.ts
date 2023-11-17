import { revalidateTag } from "next/cache";

export async function GET() {
  revalidateTag("revalidate");

  return new Response("ok");
}
