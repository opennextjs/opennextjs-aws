import { FullyCachedComponent, ISRComponent } from "@/components/cached";
import { Suspense } from "react";

export default async function Page() {
  // Not working for now, need a patch in next to disable full revalidation during ISR revalidation
  return (
    <div>
      <h1>Cache</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <FullyCachedComponent />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <ISRComponent />
      </Suspense>
    </div>
  );
}
