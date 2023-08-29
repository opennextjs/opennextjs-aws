import { wait } from "@open-next/utils";

export const revalidate = 0;
export default async function SSR() {
  await wait(2000);
  const time = new Date().toISOString();
  return (
    <div>
      <h1>SSR {time}</h1>
    </div>
  );
}
