async function getTime() {
  return new Date().toISOString();
}

export default async function ISR() {
  const time = getTime();
  return <div>Time: {time}</div>;
}
