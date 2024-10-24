export default async function Page() {
  const timeInParis = await fetch(
    "https://www.timeapi.io/api/time/current/zone?timeZone=Europe%2FParis",
    {
      next: {
        tags: ["path"],
      },
    },
  );
  // This one doesn't have a tag
  const timeInLondon = await fetch(
    "https://www.timeapi.io/api/time/current/zone?timeZone=Europe%2FLondon",
  );
  const timeInParisJson = await timeInParis.json();
  const parisTime = timeInParisJson.dateTime;
  const timeInLondonJson = await timeInLondon.json();
  const londonTime = timeInLondonJson.dateTime;
  return (
    <div>
      <h1>Time in Paris</h1>
      <p>Paris: {parisTime}</p>
      <h1>Time in London</h1>
      <p>London: {londonTime}</p>
    </div>
  );
}
