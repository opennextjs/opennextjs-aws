import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link href="/ppr">
          <h1 className={styles.title}>Incremental PPR</h1>
        </Link>
      </main>
    </div>
  );
}
