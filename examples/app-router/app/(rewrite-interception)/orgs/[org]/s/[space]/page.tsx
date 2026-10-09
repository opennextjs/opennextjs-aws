import Link from "next/link";

type Props = {
  params: Promise<{ org: string; space: string }>;
};

/**
 * Renders an organization space reached through the pretty-URL rewrite.
 *
 * @param props The dynamic organization and space parameters
 * @returns The organization space page
 */
export default async function SpacePage({ params }: Props) {
  const { org, space } = await params;

  return (
    <main>
      <h1>
        Organization {org} space {space}
      </h1>
      <Link href={`/@${org}/${space}/delete`}>Delete space</Link>
    </main>
  );
}
