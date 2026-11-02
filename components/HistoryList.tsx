"use client";

import { useEffect, useState } from "react";
import {
  deleteItem,
  errorMessage,
  listItems,
  NO_OUTBOX_MESSAGE,
  startAutoUpload,
  subscribe,
  uploadPending,
  type OutboxItem,
} from "@/lib/outbox";

const LABEL = { waiting: "Waiting", uploading: "Uploading…", uploaded: "Uploaded", failed: "Failed" } as const;

export default function HistoryList() {
  const [items, setItems] = useState<OutboxItem[] | null>(null);
  const [noOutbox, setNoOutbox] = useState(false);

  // Show the outbox, refresh it whenever it changes, and keep uploading.
  useEffect(() => {
    const refresh = () =>
      listItems()
        .then(setItems)
        .catch(() => setNoOutbox(true)); // e.g. Private Browsing
    refresh();
    const unsubscribe = subscribe(refresh);
    const stop = startAutoUpload();
    return () => {
      unsubscribe();
      stop();
    };
  }, []);

  if (noOutbox) return <p className="empty">{NO_OUTBOX_MESSAGE}</p>;
  if (!items) return null;
  if (items.length === 0) return <p className="empty">No stickers yet. Take a photo and tap Save.</p>;
  return (
    <ul>
      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </ul>
  );
}

function Row({ item }: { item: OutboxItem }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(item.thumb);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item.thumb]);

  const remove = async () => {
    const question =
      item.status === "uploaded"
        ? "Delete this sticker from your library?"
        : "This sticker isn't uploaded yet. Delete it for good?";
    if (!confirm(question)) return;
    setBusy(true);
    try {
      await deleteItem(item);
    } catch (err) {
      alert(`Couldn't delete: ${errorMessage(err)}`);
      setBusy(false);
    }
  };

  return (
    <li>
      {thumbUrl && <img src={thumbUrl} alt="" />}
      <div className="info">
        <span className={`status-${item.status}`}>{LABEL[item.status]}</span>
        <small>{new Date(item.createdAt).toLocaleString()}</small>
        {item.status === "failed" && item.error && <small>{item.error}</small>}
      </div>
      {item.status === "failed" && (
        <button className="button primary" onClick={() => uploadPending()}>
          Retry
        </button>
      )}
      <button className="button secondary" onClick={remove} disabled={busy || item.status === "uploading"}>
        Delete
      </button>
    </li>
  );
}
