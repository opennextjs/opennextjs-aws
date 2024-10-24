import { headers } from "next/headers";

export default async function Headers() {
  const middlewareHeader = (await headers()).get("request-header");
  return (
    <div>
      <h1>Headers</h1>
      <div>{middlewareHeader}</div>
    </div>
  );
}
