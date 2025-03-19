export const dynamic = "force-static";

async function getTime() {
  return new Date().toISOString();
}

export async function GET() {
  const time = await getTime();
  return Response.json({ time });
}
