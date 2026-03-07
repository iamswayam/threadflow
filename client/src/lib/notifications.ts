export type NotificationItem = {
  id: string;
  type: "success" | "error" | "info" | "milestone" | "dna";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
};

const STORAGE_KEY = "threadflow_notifications";
const MAX_NOTIFICATIONS = 50;
const NOTIFICATION_EVENT = "threadflow:notification";

function dispatchNotificationEvent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT));
}

function readNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || ""),
        type: item.type as NotificationItem["type"],
        title: String(item.title || ""),
        message: String(item.message || ""),
        timestamp: Number(item.timestamp || 0),
        read: Boolean(item.read),
      }))
      .filter((item) => item.id && item.title && item.message && Number.isFinite(item.timestamp));
  } catch {
    return [];
  }
}

function saveNotifications(items: NotificationItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function sortNotifications(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => b.timestamp - a.timestamp);
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getNotifications(): NotificationItem[] {
  return sortNotifications(readNotifications());
}

export function addNotification(item: Omit<NotificationItem, "id" | "timestamp" | "read">): void {
  const next: NotificationItem = {
    ...item,
    id: createId(),
    timestamp: Date.now(),
    read: false,
  };
  const current = getNotifications();
  const merged = [next, ...current].slice(0, MAX_NOTIFICATIONS);
  saveNotifications(merged);
  dispatchNotificationEvent();
}

export function markAllRead(): void {
  const current = getNotifications();
  const updated = current.map((item) => ({ ...item, read: true }));
  saveNotifications(updated);
  dispatchNotificationEvent();
}

export function markRead(id: string): void {
  const current = getNotifications();
  const updated = current.map((item) => (item.id === id ? { ...item, read: true } : item));
  saveNotifications(updated);
  dispatchNotificationEvent();
}

export function clearAll(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  dispatchNotificationEvent();
}

export function getUnreadCount(): number {
  return getNotifications().filter((item) => !item.read).length;
}

export const THREADFLOW_NOTIFICATION_EVENT = NOTIFICATION_EVENT;
