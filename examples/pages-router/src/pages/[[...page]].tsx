import Home from "@/components/home";
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

  const paths = [{ params: { page: [] } }, ...rootPaths, ...longPaths];

  return {
    paths,
    fallback: false,
  };
}

export async function getStaticProps(context: GetStaticPropsContext) {
  const page = (context.params?.page as string[]) || [];

  if (page.length === 0) {
    return {
      props: {
        subpage: [],
        pageType: "home",
      },
    };
  }
  if (page.length === 1 && validRootPages.includes(page[0])) {
    return {
      props: {
        subpage: page,
        pageType: "root",
      },
    };
  }

  const pagePath = page.join("/");
  if (validLongPaths.includes(pagePath)) {
    return { props: { subpage: page, pageType: "long-path" } };
  }
  return { notFound: true };
}

export default function Page({
  subpage,
  pageType,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  if (subpage.length === 0 && pageType === "home") {
    return <Home />;
  }
  return (
    <div>
      <h1 data-testid="page">{`Page: ${subpage}`}</h1>
      <p>Page type: {pageType}</p>
      <p>Path: {subpage.join("/")}</p>
    </div>
  );
}
