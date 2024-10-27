export default async function Page() {
  const responseSST = await fetch("https://sst.dev", {
    next: {
      tags: ["path"],
    },
  });
  // This one doesn't have a tag
  const responseOpenNext = await fetch("https://opennext.js.org");
  const reqIdSst = responseSST.headers.get("x-amz-cf-id");
  const dateInOpenNext = responseOpenNext.headers.get("date");
  return (
    <div>
      <h1>Request id from SST</h1>
      <p>RequestID: {reqIdSst}</p>
      <h1>Date from from OpenNext</h1>
      <p>Date: {dateInOpenNext}</p>
    </div>
  );
}
