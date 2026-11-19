import { Suspense } from "react";

async function lookup(arg: string) {
  "use cache";
  return { arg, filledAt: Date.now() };
}

async function Result({
  searchParams,
}: {
  searchParams: Promise<{ arg?: string }>;
}) {
  const { arg } = await searchParams;
  const result = await lookup(String(arg));
  return <pre data-testid="lookup">{JSON.stringify(result)}</pre>;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ arg?: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Result searchParams={searchParams} />
    </Suspense>
  );
}
