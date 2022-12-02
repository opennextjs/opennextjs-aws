import Head from "next/head";
import Link from "next/link";
import { SITE } from "../config";
import styles from "../styles/404.module.css";

export default function Custom404() {
  return (
    <>
      <Head>
        <title key="title">Page not found / {SITE.title}</title>
      </Head>
      <h1 className={styles.heading}>Page not found</h1>
      <p>
        <Link href="/">Go back home</Link>
      </p>
    </>
  );
}
