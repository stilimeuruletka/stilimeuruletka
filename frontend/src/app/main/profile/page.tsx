import Image from "next/image";
import styles from "../../page.module.css";

export default function ProfilePage() {
  return (
    <div className={styles.profileScreen}>
      <Image
        src="/профильбаза.png"
        alt="Профиль"
        width={720}
        height={1280}
        className={styles.profileImageFull}
        priority
      />
    </div>
  );
}
