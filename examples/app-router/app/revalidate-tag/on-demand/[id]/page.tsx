export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <p data-testid="on-demand-page">On-demand page: {id}</p>;
}
