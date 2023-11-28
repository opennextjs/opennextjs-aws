import { headers } from "next/headers";

export default function SearchQuery({
  searchParams: propsSearchParams,
}: {
  searchParams: Record<string, string | string[]>;
}) {
  const mwSearchParams = headers().get("search-params");
  const multiValueParams = propsSearchParams["multi"];
  const multiValueArray = Array.isArray(multiValueParams)
    ? multiValueParams
    : [multiValueParams];
  return (
    <>
      <h1>Search Query</h1>
      <div>Search Params via Props: {propsSearchParams.searchParams}</div>
      <div>Search Params via Middleware: {mwSearchParams}</div>
      {multiValueParams && (
        <>
          <div>Multi-value Params (key: multi): {multiValueArray.length}</div>
          {multiValueArray.map((value) => (
            <div>{value}</div>
          ))}
        </>
      )}
    </>
  );
}
