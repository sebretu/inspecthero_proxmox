"use client";
import React from "react";
import { useNotification } from "@/contexts/NotificationContext";
import styles from "./NotificationBar.module.css";

export function NotificationBar() {
  const { notifications, removeNotification } = useNotification();

  return (
    <div className={styles.notificationBar}>
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`${styles.notification} ${styles[n.type || "info"]}`}
          onClick={() => removeNotification(n.id)}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
}
