import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";

/**
 * Exposes the routing context received by the final fallback page.
 *
 * @param context The catch-all parameters and locale supplied by Next.js
 * @return Props identifying the rendered route and its decoded parameters
 */
export function getServerSideProps({
  params,
  locale,
}: GetServerSidePropsContext<{ slugs: string[] }>) {
  return {
    props: {
      message: "This is a dynamic fallback page.",
      slugs: params?.slugs ?? [],
      locale: locale ?? null,
    },
  };
}

/**
 * Renders the fallback page with observable routing values.
 *
 * @param props The message, decoded parameters, and locale from Next.js
 * @return The fallback page and its routing context
 */
export default function Page({
  message,
  slugs,
  locale,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div>
      <h1>Dynamic Fallback Page</h1>
      <p data-testid="message">{message}</p>
      <pre data-testid="slugs">{JSON.stringify(slugs)}</pre>
      <p data-testid="locale">{locale}</p>
    </div>
  );
}
