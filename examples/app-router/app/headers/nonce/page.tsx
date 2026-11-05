import { headers } from "next/headers";

export default async function Page() {
  const headersList = await headers();
  return (
    <div>
      <h1>Nonce</h1>
      <p data-testid="middleware-header">
        {headersList.get("response-header")}
      </p>
      <p data-testid="next-config-header">{headersList.get("e2e-headers")}</p>
    </div>
  );
}
