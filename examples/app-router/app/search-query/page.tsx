import { headers } from "next/headers";

export default function SearchQuery({
  searchParams: propsSearchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const mwSearchParams = headers().get("search-params");
  return (
    <>
      <h1>Search Query</h1>
      <div>Search Params via Props: {propsSearchParams.searchParams}</div>
      <div>Search Params via Middleware: {mwSearchParams}</div>
    </>
  );
}
