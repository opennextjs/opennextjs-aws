import { useConfig } from "nextra-theme-docs";

import Footer from "./components/Footer";
import Logo from "./components/Logo.svg";

export default {
  logo: <Logo />,
  docsRepositoryBase: "https://github.com/sst/open-next/tree/main/docs",
  project: {
    link: "https://github.com/sst/open-next",
  },
  chat: {
    link: "https://sst.dev/discord",
  },
  footer: {
    text: <Footer />,
  },
  navigation: {
    prev: false,
    next: false,
  },
  feedback: {
    useLink: () => "https://github.com/sst/open-next/issues/new",
  },
  head: (
    <>
      <meta httpEquiv="refresh" content="0; URL='https://opennext.js.org'" />
    </>
  ),
  useNextSeoProps() {
    const { frontMatter } = useConfig();
    return {
      additionalLinkTags: [
        {
          href: "/favicon-light.png",
          rel: "icon",
        },
      ],
      titleTemplate: "%s - OpenNext",
      description:
        frontMatter.description || "Open source Next.js serverless adapter",
      openGraph: {
        titleTemplate: "%s - OpenNext",
        images: [
          {
            url: frontMatter.image || "/share.png",
          },
        ],
      },
      twitter: {
        cardType: "summary_large_image",
        site: "https://open-next.js.org",
      },
    };
  },
};
