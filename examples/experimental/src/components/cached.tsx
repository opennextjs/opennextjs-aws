import { unstable_cacheLife, unstable_cacheTag } from "next/cache";

export async function FullyCachedComponent() {
  "use cache";
  return (
    <div>
      <p data-testid="fully-cached">{Date.now()}</p>
    </div>
  );
}

export async function FullyCachedComponentWithTag() {
  "use cache";
  unstable_cacheTag("fullyTagged");
  return (
    <div>
      <p data-testid="fully-cached-with-tag">{Date.now()}</p>
    </div>
  );
}

export async function ISRComponent() {
  "use cache";
  unstable_cacheLife({
    stale: 1,
    revalidate: 5,
  });
  return (
    <div>
      <p data-testid="isr">{Date.now()}</p>
    </div>
  );
}
