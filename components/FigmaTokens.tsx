"use client";

// Owner only (in the Library): tokens for the Figma plugin.
// A new token is shown once; the server keeps only its hash.

import { useState } from "react";
import { createToken, revokeToken } from "@/app/library/token-actions";
import styles from "./FigmaTokens.module.css";

export type TokenInfo = { id: string; created_at: string; last_used_at: string | null };

export default function FigmaTokens({ tokens }: { tokens: TokenInfo[] | null }) {
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  };

  const generate = () =>
    run(async () => {
      setNewToken(await createToken());
      setCopied(false);
    });

  const revoke = (id: string) => {
    if (!confirm("Revoke this token? The Figma plugin using it will stop working.")) return;
    run(() => revokeToken(id));
  };

  const copy = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
  };

  return (
    <details className={styles.tokens}>
      <summary>Figma plugin</summary>
      {tokens === null ? (
        <p className={styles.note}>Tokens table is missing. Run the Stage 4 SQL in Neon first.</p>
      ) : (
        <>
          <p className={styles.note}>
            A token lets the Figma plugin list, insert and delete your stickers. Paste it into the plugin.
          </p>
          {newToken && (
            <div className={styles.new}>
              <input readOnly value={newToken} onFocus={(e) => e.currentTarget.select()} aria-label="New token" />
              <button className="button primary" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
              <p className={styles.note}>Copy it now. It won&apos;t be shown again.</p>
            </div>
          )}
          <ul className={styles.list}>
            {tokens.map((t) => (
              <li key={t.id}>
                <span>
                  Made {formatDate(t.created_at)} ·{" "}
                  {t.last_used_at ? `last used ${formatDate(t.last_used_at)}` : "never used"}
                </span>
                <button className="link-button" onClick={() => revoke(t.id)} disabled={busy}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
          <button className="button secondary" onClick={generate} disabled={busy}>
            Generate token
          </button>
          {error && <p className={styles.note}>{error}</p>}
        </>
      )}
    </details>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
