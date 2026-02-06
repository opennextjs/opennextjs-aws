import type { GetStaticPropsContext, GetStaticPropsResult } from "next";
import Head from "next/head";

type Params = { key: string };

type FakeRecord = {
  key: string;
  title: string;
  updatedAt: string;
};

type Props = {
  record: FakeRecord;
};

const fakeDb: FakeRecord[] = [
  { key: "1", title: "First record", updatedAt: new Date().toISOString() },
  { key: "2", title: "Second record", updatedAt: new Date().toISOString() },
  { key: "3", title: "Third record", updatedAt: new Date().toISOString() },
];

export default function TestKeyPage({ record }: Props) {
  return (
    <div style={{ padding: 24 }}>
      <Head>
        <title>SSG Test — {record.key}</title>
      </Head>
      <h1>SSG Test Page</h1>
      <p>
        <strong>Key:</strong> {record.key}
      </p>
      <p>
        <strong>Title:</strong> {record.title}
      </p>
      <p>
        <strong>Updated:</strong>{" "}
        <span data-testid="updated-at">{record.updatedAt}</span>
      </p>
      <p>Revalidate set in getStaticProps.</p>
    </div>
  );
}

export async function getStaticProps({
  params,
}: GetStaticPropsContext<Params>): Promise<GetStaticPropsResult<Props>> {
  const found = fakeDb.find((item) => item.key === params?.key);

  if (!found) {
    return { notFound: true };
  }

  return {
    props: {
      record: {
        ...found,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export async function getStaticPaths() {
  const paths = fakeDb.map((item) => ({
    params: { key: item.key },
  }));

  return { paths, fallback: "blocking" };
}
