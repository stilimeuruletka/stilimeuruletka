import styles from "../../admin.module.css";

export default function AdminShelfPage() {
  return (
    <div className={styles.card}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Полка</h1>
        <div className={styles.pill}>Скоро</div>
      </div>
      <div className={styles.muted} style={{ marginTop: 8 }}>
        Раздел пока пустой — будет заполнен позже.
      </div>
    </div>
  );
}