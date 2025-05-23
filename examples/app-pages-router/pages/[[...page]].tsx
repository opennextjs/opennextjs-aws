import Home from "@/app/home";
import type {
  GetStaticPathsResult,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from "next";

const validRootPages = ["conico974", "kheuzy", "sommeeer"];

export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  const rootPaths = validRootPages.map((page) => ({
    params: { page: [page] },
  }));

  const paths = [{ params: { page: [] } }, ...rootPaths];

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
      <h1>{pageType === "home" ? "Homepage" : `Root page: ${subpage}`}</h1>
      <p>Path: {subpage.join("/")}</p>
    </div>
  );
}
