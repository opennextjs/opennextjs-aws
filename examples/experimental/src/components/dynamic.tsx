import { headers } from "next/headers";

export async function DynamicComponent() {
  const _headers = await headers();
  // Simulate a delay to mimic server-side calls
  const date = await new Promise((resolve) =>
    setTimeout(() => {
      resolve(new Date().toString());
    }, 1000),
  );
  return (
    <div>
      <h1>Dynamic Component</h1>
      <p>This component should be SSR</p>
      <p>{_headers.get("referer")}</p>
    </div>
  );
}
