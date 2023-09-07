async function getTime() {
  return new Date().toISOString();
}

export const revalidate = 10;
export default async function ISR() {
  const time = getTime();
  return <div>Time: {time}</div>;
}
