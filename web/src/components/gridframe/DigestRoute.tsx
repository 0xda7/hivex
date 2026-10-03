import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  type GridframeDigestItem,
  getGridframeDigest,
  postGridframeDecide,
} from "../../api/client";
import { showNotice } from "../ui/Toast";

/**
 * Gridframe Principal digest (G4, spec §9.1): today's pending T2/T3
 * decisions as actionable items. Each decision button writes the
 * approval-queue row through POST /gridframe/approvals/decide (gridframe
 * api.go): approve unblocks the gated action; reject/defer flip the row.
 * The operator here is the Principal, so signers ride the §4 tier rules
 * (T2 → HOB-00; T3 → HOB-00+RSK-01) and the click is the authenticated
 * human event (human: true).
 */

const DIGEST_QUERY_KEY = ["gridframe", "digest"] as const;

function signersFor(tier: string): string[] {
  return tier === "T3" ? ["HOB-00", "RSK-01"] : ["HOB-00"];
}

function DecisionCard({
  item,
  onDecide,
  busy,
}: {
  item: GridframeDigestItem;
  onDecide: (
    itemId: string,
    tier: string,
    decision: "approve" | "reject" | "defer",
  ) => void;
  busy: boolean;
}) {
  const { row } = item;
  return (
    <div
      data-testid={`digest-decision-${row.item_id}`}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: 13 }}>{row.description}</strong>
        <span
          data-testid={`digest-tier-${row.item_id}`}
          style={{
            fontSize: 11,
            padding: "1px 6px",
            borderRadius: 4,
            background: "var(--bg-subtle)",
          }}
        >
          {row.tier}
        </span>
        {item.escalated ? (
          <span style={{ fontSize: 11, color: "var(--red)" }}>
            escalated (48h+)
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        {row.dept} · raised {row.raised_date} by {row.raised_by} · cost of delay
        ${item.cost_of_delay_usd.toFixed(2)}/wk · needs {row.approver}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {(["approve", "reject", "defer"] as const).map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy}
            data-testid={`digest-${d}-${row.item_id}`}
            className={`btn ${d === "approve" ? "btn-primary" : ""}`}
            onClick={() => onDecide(row.item_id, row.tier, d)}
          >
            {d === "approve" ? "Approve" : d === "reject" ? "Reject" : "Defer"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DigestRoute() {
  const queryClient = useQueryClient();
  const digestQuery = useQuery({
    queryKey: DIGEST_QUERY_KEY,
    queryFn: ({ signal }) => getGridframeDigest(signal),
  });

  const decide = useMutation({
    mutationFn: (v: {
      itemId: string;
      tier: string;
      decision: "approve" | "reject" | "defer";
    }) =>
      postGridframeDecide(v.itemId, v.decision, {
        signers: signersFor(v.tier),
        human: true,
      }),
    onSuccess: (res) => {
      showNotice(
        `Decision recorded: ${res.item_id} → ${res.status}`,
        "success",
      );
      void queryClient.invalidateQueries({ queryKey: DIGEST_QUERY_KEY });
    },
    onError: (err) => {
      showNotice(
        err instanceof ApiError
          ? err.message
          : "Decision failed — broker unreachable",
        "error",
      );
    },
  });

  const digest = digestQuery.data;
  return (
    <div className="app-panel active" data-testid="digest-route">
      <header
        style={{
          padding: "16px 20px 8px",
          display: "flex",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Principal digest</h2>
        {digest ? (
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {digest.date} · {digest.artifact}
          </span>
        ) : null}
      </header>
      <div
        style={{
          padding: "0 20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
        }}
      >
        {digestQuery.isPending ? (
          <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            Loading digest…
          </div>
        ) : digestQuery.isError ? (
          <div role="alert" style={{ color: "var(--red)", fontSize: 13 }}>
            Could not load digest:{" "}
            {digestQuery.error instanceof ApiError
              ? digestQuery.error.message
              : "broker unreachable"}
          </div>
        ) : !digest || digest.decisions.length === 0 ? (
          <div
            style={{ color: "var(--text-tertiary)", fontSize: 13 }}
            data-testid="digest-empty"
          >
            No pending T2/T3 decisions today.
          </div>
        ) : (
          digest.decisions.map((item) => (
            <DecisionCard
              key={item.row.item_id}
              item={item}
              busy={decide.isPending}
              onDecide={(itemId, tier, decision) =>
                decide.mutate({ itemId, tier, decision })
              }
            />
          ))
        )}
        {digest && digest.open_exceptions.length > 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Open exceptions:{" "}
            {digest.open_exceptions
              .map((e) => `${e.exc_id} (${e.severity}) ${e.description}`)
              .join("; ")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DigestRoute;
