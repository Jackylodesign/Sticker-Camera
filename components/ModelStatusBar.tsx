import type { ModelStatus } from "@/lib/models";

const mb = (bytes: number) => Math.round(bytes / 1e6);

/** Shows the one-time model download. Hidden once the model is ready. */
export default function ModelStatusBar({ status }: { status: ModelStatus }) {
  if (status.state === "ready") return null;
  if (status.state === "error") {
    return <p className="model-status error">The sticker AI models failed to load: {status.message}</p>;
  }
  const pct = status.total ? Math.round((status.loaded / status.total) * 100) : 0;
  return (
    <div className="model-status">
      <span>
        {status.total
          ? `Downloading sticker AI models… ${mb(status.loaded)} / ${mb(status.total)} MB`
          : "Preparing sticker AI models…"}
      </span>
      <small>First time only. After this it works from cache.</small>
      <div className="progress">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
