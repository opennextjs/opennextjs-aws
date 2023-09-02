import { headers } from "next/headers";

export default function Headers() {
  const middlewareHeader = headers().get("request-header");
  return (
    <div>
      <h1>Headers</h1>
      <div>{middlewareHeader}</div>
    </div>
  );
}
