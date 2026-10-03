import { useState } from "react";

import { type ConfigSnapshot, verifyZaiKey } from "../../../api/client";

/**
 * The Inference card — the one place that answers "what is my company
 * running on, with whose key, and what has it cost". Data comes from the
 * broker's inference snapshot (settings GET): per runtime kind — agent
 * count, endpoint, key FINGERPRINT (never the key), and metered tokens.
 */
export interface InferenceEntry {
  kind: string;
  label?: string;
  agents: number;
  endpoint?: string;
  default_model?: string;
  key_fingerprint?: string;
  key_source?: string;
  key_set?: boolean;
  auth?: string;
  tokens?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
    total_tokens?: number;
    requests?: number;
  };
}

function fmtTokens(n?: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function InferenceCard({ cfg }: { cfg: ConfigSnapshot }) {
  const rows = cfg.inference ?? [];
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
        Inference
      </h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          margin: "0 0 8px 0",
        }}
      >
        Every runtime your agents bill, with the key fingerprint (never the key)
        and tokens metered on this install.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row) => (
          <div
            key={row.kind}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-card)",
              fontSize: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {row.label ?? row.kind}
                {row.agents > 0 ? (
                  <span
                    style={{ color: "var(--text-tertiary)", fontWeight: 400 }}
                  >
                    {" "}
                    · {row.agents} agent{row.agents > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                {row.key_fingerprint
                  ? `key ${row.key_fingerprint} · ${row.key_source ?? ""}`
                  : (row.auth ??
                    (row.key_set === false ? "no key configured" : ""))}
                {row.default_model ? ` · ${row.default_model}` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <div style={{ fontWeight: 600 }}>
                {fmtTokens(row.tokens?.total_tokens)} tokens
              </div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                {fmtTokens(row.tokens?.input_tokens)} in ·{" "}
                {fmtTokens(row.tokens?.output_tokens)} out ·{" "}
                {fmtTokens(row.tokens?.requests)} calls
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Verify the Z.ai key: tests whatever is typed in the key field above (or
 * the stored key when blank) with a real 1-token call; a freshly provided
 * key that verifies is saved as the authoritative credential.
 */
export function ZaiKeyVerifyRow({ enteredKey }: { enteredKey?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const r = await verifyZaiKey(enteredKey?.trim() || "");
      if (r.ok) {
        setResult(
          `✓ Verified with ${r.model ?? "GLM-5.3"} in ${r.latency_ms ?? "?"}ms — key ${r.fingerprint ?? "?"}${r.saved ? " saved as the authoritative key" : " (already stored)"}`,
        );
      } else {
        setResult(`✗ ${r.error ?? "verification failed"}`);
      }
    } catch (e) {
      setResult(`✗ ${e instanceof Error ? e.message : "request failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 10, marginBottom: 14 }}>
      <button onClick={run} disabled={busy} style={{ fontSize: 12 }}>
        {busy ? "Verifying…" : "Verify Z.ai key"}
      </button>
      {result ? (
        <p
          style={{
            fontSize: 12,
            margin: "6px 0 0 0",
            color: result.startsWith("✓")
              ? "var(--text-secondary)"
              : "var(--red)",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {result}
        </p>
      ) : null}
    </div>
  );
}
