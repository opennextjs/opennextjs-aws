export default async function Page() {
  const timeInParis = await fetch(
    "http://worldtimeapi.org/api/timezone/Europe/Paris",
    {
      next: {
        tags: ["path"],
      },
    },
  );
  // This one doesn't have a tag
  const timeInLondon = await fetch(
    "http://worldtimeapi.org/api/timezone/Europe/London",
  );
  const timeInParisJson = await timeInParis.json();
  const parisTime = timeInParisJson.datetime;
  const timeInLondonJson = await timeInLondon.json();
  const londonTime = timeInLondonJson.datetime;
  return (
    <div>
      <h1>Time in Paris</h1>
      <p>{parisTime}</p>
      <h1>Time in London</h1>
      <p>{londonTime}</p>
    </div>
  );
}
