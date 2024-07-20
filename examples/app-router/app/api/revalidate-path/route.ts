import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  revalidatePath("/revalidate-path");

  return new Response("ok");
}
