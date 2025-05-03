import { cookies } from "next/headers";

export default async function Page() {
  const foo = (await cookies()).get("foo")?.value;

  return <div data-testid="foo">{foo}</div>;
}
