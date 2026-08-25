import { FullyCachedComponentWithTag } from "@/components/cached";
import { Suspense } from "react";

export function generateStaticParams() {
  return [];
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main>
      <p data-testid="on-demand-page">On-demand page: {id}</p>
      <Suspense fallback={<p>Loading...</p>}>
        <FullyCachedComponentWithTag />
      </Suspense>
    </main>
  );
}
