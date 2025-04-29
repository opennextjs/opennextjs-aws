import { setTimeout } from "node:timers/promises";
import { headers } from "next/headers";

export async function DynamicComponent() {
  const _headers = await headers();
  // Simulate a delay to mimic server-side calls
  await setTimeout(1000, new Date().toString());
  return (
    <div>
      <h1>Dynamic Component</h1>
      <p>This component should be SSR</p>
      <p>{_headers.get("referer")}</p>
    </div>
  );
}
