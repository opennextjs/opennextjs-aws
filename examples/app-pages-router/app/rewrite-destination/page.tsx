export default function RewriteDestination({
  searchParams,
}: {
  searchParams: { a: string };
}) {
  return (
    <div>
      <div>Rewritten Destination</div>
      <div>a: {searchParams.a}</div>
    </div>
  );
}
