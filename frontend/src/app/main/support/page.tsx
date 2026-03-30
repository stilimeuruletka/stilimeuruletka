import Image from "next/image";
import styles from "../../page.module.css";

export default function SupportPlaceholderPage() {
  return (
    <div className={styles.profileScreen}>
      <Image src="/заглушка2.png" alt="Страница в разработке" width={720} height={1280} className={styles.profileImageFull} priority />
    </div>
  );
}

