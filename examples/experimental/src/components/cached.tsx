import { unstable_cacheTag, unstable_cacheLife } from "next/cache";

export async function FullyCachedComponent() {
  "use cache";
  unstable_cacheTag("fullyTagged");
  return (
    <div>
      <p data-testid="fullyCached">{Date.now()}</p>
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
