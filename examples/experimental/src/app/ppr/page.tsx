import { DynamicComponent } from "@/components/dynamic";
import { StaticComponent } from "@/components/static";
import { Suspense } from "react";

export const experimental_ppr = true;

export default function PPRPage() {
  return (
    <div>
      <StaticComponent />
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicComponent />
      </Suspense>
    </div>
  );
}
