export const revalidate = 5;
export const dynamic = "force-static";

/**
 * Generate a cached App Route response.
 *
 * @returns The generation timestamp as JSON.
 */
export function GET() {
  return Response.json({ timestamp: Date.now() });
}
