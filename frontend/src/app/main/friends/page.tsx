"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../page.module.css";

type FriendItem = {
  tg_user_id: number;
  username: string | null;
  photo_url: string | null;
  created_at: string;
};

type TelegramSdkWindow = Window & {
  Telegram?: {
    WebApp?: { initData?: string };
  };
};

function getBackendBase() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, "") : "";
}

function getInitData() {
  const w = window as TelegramSdkWindow;
  const initData = w.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 10 ? initData : null;
}

export default function FriendsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const initData = getInitData();
    if (!initData) {
      const demo: FriendItem[] = [
        { tg_user_id: 1, username: "alice", photo_url: null, created_at: new Date().toISOString() },
        { tg_user_id: 2, username: "bob", photo_url: null, created_at: new Date().toISOString() },
        { tg_user_id: 3, username: "carol", photo_url: null, created_at: new Date().toISOString() }
      ];
      setFriends(demo);
      setCount(demo.length);
      return;
    }

    const base = getBackendBase();
    const res = await fetch(`${base}/api/referrals`, {
      headers: { "x-telegram-init-data": initData }
    });
    if (!res.ok) {
      setFriends([]);
      setCount(0);
      return;
    }

    const json = (await res.json().catch(() => null)) as { count: number; friends: FriendItem[] } | null;
    if (!json) {
      setFriends([]);
      setCount(0);
      return;
    }
    setFriends(Array.isArray(json.friends) ? json.friends : []);
    setCount(typeof json.count === "number" ? json.count : null);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const totalText = useMemo(() => String(count ?? friends.length), [count, friends.length]);
  const showEmpty = (count ?? friends.length) === 0;

  return (
    <div className={styles.friendsListPage}>
      <div className={styles.friendsListFrame}>
        <div className={styles.friendsListBackground} aria-hidden="true">
          <Image src="/IMG_2234.PNG" alt="" fill className={styles.friendsListBackgroundImage} priority sizes="(max-width: 520px) 100vw, 520px" />
        </div>

        <div className={styles.friendsListHeader}>
          <Image src="/приглашенные.png" alt="Стильные друзья" fill className={styles.friendsListHeaderImage} priority sizes="(max-width: 520px) 100vw, 520px" />

          <button type="button" className={styles.friendsListBackButton} onClick={() => router.push("/main/friend")} aria-label="Назад">
            <Image src="/стрелканазад.PNG" alt="" width={52} height={26} className={styles.friendsListBackIcon} priority />
          </button>

          <div className={styles.friendsListCount} aria-label="Итого приглашённых">
            {totalText}
          </div>
        </div>

        <div className={styles.friendsListScroll}>
          {showEmpty && <div className={styles.friendsListEmpty}>Пока нет приглашённых друзей</div>}
          {friends.map((f) => (
            <div key={f.tg_user_id} className={styles.friendsListCard}>
              <Image src="/IMG_1368.PNG" alt="" fill className={styles.friendsListCardImage} sizes="(max-width: 520px) 92vw, 520px" quality={90} />
              <div className={styles.friendsListCardName}>{f.username ? `@${f.username.replace(/^@/, "")}` : `tg:${f.tg_user_id}`}</div>
              <div className={styles.friendsListCardAvatar}>
                {f.photo_url ? <img src={f.photo_url} alt="" width={1} height={1} draggable="false" /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
