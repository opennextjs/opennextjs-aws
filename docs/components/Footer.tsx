import { SITE } from "../config";
import styles from "../styles/Layout.module.css";

export default function Footer() {
  return (
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
  );
}
