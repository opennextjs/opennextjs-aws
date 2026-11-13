import { redirect } from "next/navigation";

import Client from "./client";

// For: serverActions.test.ts, a native form that must work without JavaScript
async function search(formData: FormData) {
  "use server";
  const query = encodeURIComponent(String(formData.get("query")));
  redirect(`/search-query?searchParams=${query}`);
}

export default function Page() {
  return (
    <div>
      <h1>Server Actions</h1>
      <Client />
      <form action={search}>
        <input name="query" aria-label="Query" />
        <button type="submit">Submit Form Action</button>
      </form>
    </div>
  );
}
