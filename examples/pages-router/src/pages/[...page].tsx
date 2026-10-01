import type {
  GetStaticPathsResult,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from "next";

const validRootPages = ["conico974", "kheuzy", "sommeeer"];
const validLongPaths = ["super/long/path/to/secret/page"];

export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  const rootPaths = validRootPages.map((page) => ({
    params: { page: [page] },
  }));

  const longPaths = validLongPaths.map((path) => ({
    params: { page: path.split("/") },
  }));

  const paths = [...rootPaths, ...longPaths];

  return {
    paths,
    // Blocking fallback is intentional: this fixture reproduces the route
    // shape from GHSA-mcj8-r9mp-w47p, where encoded aliases and `/index` are
    // rendered by a root catch-all and persisted in the response cache.
    fallback: "blocking",
  };
}

export async function getStaticProps(context: GetStaticPropsContext) {
  const page = (context.params?.page as string[]) || [];

  if (
    page.length === 1 &&
    (validRootPages.includes(page[0]) || page[0] === "index")
  ) {
    return {
      props: {
        subpage: page,
        pageType: "root",
      },
    };
  }

  const pagePath = page.join("/");
  if (page[0] === "victim") {
    return {
      props: {
        subpage: page,
        pageType: "encoded-catch-all",
      },
      revalidate: 60,
    };
  }
  if (validLongPaths.includes(pagePath)) {
    return { props: { subpage: page, pageType: "long-path" } };
  }
  return { notFound: true };
}

export default function Page({
  subpage,
  pageType,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div>
      <p data-testid="cache-owner">root-catch-all</p>
      <h1 data-testid="page">{`Page: ${subpage}`}</h1>
      <p>Page type: {pageType}</p>
      <p>Path: {subpage.join("/")}</p>
    </div>
  );
}
