import { unstable_cache } from "next/cache";

async function getTime() {
  return new Date().toISOString();
}

const cachedTime = unstable_cache(getTime, ["getTime"], { revalidate: false });

export const revalidate = 10;

export default async function ISR() {
  const responseOpenNext = await fetch("https://opennext.js.org", {
    cache: "force-cache",
  });
  const dateInOpenNext = responseOpenNext.headers.get("date");
  const cachedTimeValue = await cachedTime();
  const time = getTime();
  return (
    <div>
      <h1>Date from from OpenNext</h1>
      <p data-testid="fetched-date">
        Date from from OpenNext: {dateInOpenNext}
      </p>
      <h1>Cached Time</h1>
      <p data-testid="cached-date">Cached Time: {cachedTimeValue}</p>
      <h1>Time</h1>
      <p data-testid="time">Time: {time}</p>
    </div>
  );
}
