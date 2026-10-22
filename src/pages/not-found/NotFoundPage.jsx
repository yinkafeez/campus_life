import Button from "../../components/ui/Button";
import styles from "./NotFoundPage.module.css";

// Any unknown URL.
export default function NotFoundPage() {
  return (
    <div className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>You've wandered off campus.</h1>
      <p className={styles.text}>The page you're looking for doesn't exist.</p>
      <Button to="/">Back to the main gate</Button>
    </div>
  );
}
