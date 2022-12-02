import Head from "next/head";
import { SITE } from "../config";
import styles from "../styles/Layout.module.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.container}>
      <Head>
        <title key="title">{SITE.title}</title>
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
        <meta key="description" name="description" content={SITE.description} />
        <link rel="icon" href="/open-next/favicon.svg" />
        <meta property="og:image" content="/open-next/share.png" />
      </Head>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <span>
          Maintained by{" "}
          <a target="_blank" href={SITE.sst} rel="noopener noreferrer">
            SST
          </a>
        </span>
        <div>
          <a target="_blank" href={SITE.github} rel="noopener noreferrer">
            GitHub
          </a>
          <a target="_blank" href={SITE.discord} rel="noopener noreferrer">
            Discord
          </a>
          <a target="_blank" href={SITE.twitter} rel="noopener noreferrer">
            Twitter
          </a>
        </div>
      </footer>
    </div>
  );
}
