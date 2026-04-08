import { unstable_cache } from "next/cache";

const getCachedTime = unstable_cache(
  async () => new Date().toISOString(),
  ["stale-revalidate-time"],
  {
    tags: ["revalidate-stale"],
    // Long revalidate time so the cache only expires via revalidateTag
    revalidate: 3600,
  },
);

export default async function StaleRevalidateTag() {
  const cachedTime = await getCachedTime();
  return (
    <div>
      <p data-testid="cached-time">Cached time: {cachedTime}</p>
    </div>
  );
}
