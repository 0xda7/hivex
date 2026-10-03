import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  getGridframeCompliance,
  getGridframeDigest,
  postGridframeDecide,
} from "../../api/client";
import { showNotice } from "../ui/Toast";

/**
 * Gridframe G4 (spec §9.2/§9.4):
 *  - ApprovalsRoute: approval-queue table filtered to pending T2/T3. Every
 *    decision button is the authenticated human event (§4: human: true) with
 *    tier-mandated signers (T2 → HOB-00; T3 → HOB-00+RSK-01).
 *  - ComplianceRoute: compliance-calendar timeline; overdue rows render red
 *    and link to the open-exception list below (overdue → SEV2, job #9).
 * Both reuse the digest endpoint's pending-T2/T3 view so the digest, queue,
 * and any other surface stay cache-consistent under one react-query key.
 */

const DIGEST_QUERY_KEY = ["gridframe", "digest"] as const;

function signersFor(tier: string): string[] {
  return tier === "T3" ? ["HOB-00", "RSK-01"] : ["HOB-00"];
}

function useDecide() {
  const queryClient = useQueryClient();
  return useMutation({
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
}

export function ApprovalsRoute() {
  const digestQuery = useQuery({
    queryKey: DIGEST_QUERY_KEY,
    queryFn: ({ signal }) => getGridframeDigest(signal),
  });
  const decide = useDecide();
  const rows = digestQuery.data?.decisions ?? [];

  return (
    <div className="app-panel active" data-testid="approvals-route">
      <header style={{ padding: "16px 20px 8px" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Approval queue</h2>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Pending T2/T3 — decisions are authenticated human events (§4)
        </span>
      </header>
      <div style={{ padding: "0 20px 20px", overflowX: "auto" }}>
        {digestQuery.isPending ? (
          <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            Loading…
          </div>
        ) : digestQuery.isError ? (
          <div role="alert" style={{ color: "var(--red)", fontSize: 13 }}>
            Could not load the queue:{" "}
            {digestQuery.error instanceof ApiError
              ? digestQuery.error.message
              : "broker unreachable"}
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{ color: "var(--text-tertiary)", fontSize: 13 }}
            data-testid="approvals-empty"
          >
            Nothing waiting on a human decision.
          </div>
        ) : (
          <table
            style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                <th style={{ padding: 6 }}>Item</th>
                <th style={{ padding: 6 }}>Tier</th>
                <th style={{ padding: 6 }}>Dept</th>
                <th style={{ padding: 6 }}>Raised</th>
                <th style={{ padding: 6 }}>Description</th>
                <th style={{ padding: 6 }}>Delay $/wk</th>
                <th style={{ padding: 6 }}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.row.item_id}
                  data-testid={`approval-row-${d.row.item_id}`}
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <td style={{ padding: 6 }}>{d.row.item_id}</td>
                  <td style={{ padding: 6 }}>{d.row.tier}</td>
                  <td style={{ padding: 6 }}>{d.row.dept}</td>
                  <td style={{ padding: 6 }}>{d.row.raised_date}</td>
                  <td style={{ padding: 6 }}>{d.row.description}</td>
                  <td style={{ padding: 6 }}>
                    ${d.cost_of_delay_usd.toFixed(2)}
                    {d.escalated ? " (48h+)" : ""}
                  </td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                    {(["approve", "reject", "defer"] as const).map((act) => (
                      <button
                        key={act}
                        type="button"
                        disabled={decide.isPending}
                        data-testid={`approval-${act}-${d.row.item_id}`}
                        className={`btn ${act === "approve" ? "btn-primary" : ""}`}
                        style={{ marginRight: 4 }}
                        onClick={() =>
                          decide.mutate({
                            itemId: d.row.item_id,
                            tier: d.row.tier,
                            decision: act,
                          })
                        }
                      >
                        {act === "approve"
                          ? "Approve"
                          : act === "reject"
                            ? "Reject"
                            : "Defer"}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function ComplianceRoute() {
  const q = useQuery({
    queryKey: ["gridframe", "compliance"] as const,
    queryFn: ({ signal }) => getGridframeCompliance(signal),
  });
  const items = q.data?.items ?? [];

  return (
    <div className="app-panel active" data-testid="compliance-route">
      <header style={{ padding: "16px 20px 8px" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Compliance timeline</h2>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Overdue obligations render red; overdue fires a SEV2 exception (job
          #9)
        </span>
      </header>
      <div
        style={{
          padding: "0 20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflowY: "auto",
        }}
      >
        {q.isPending ? (
          <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            Loading…
          </div>
        ) : q.isError ? (
          <div role="alert" style={{ color: "var(--red)", fontSize: 13 }}>
            Could not load the calendar:{" "}
            {q.error instanceof ApiError
              ? q.error.message
              : "broker unreachable"}
          </div>
        ) : items.length === 0 ? (
          <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            No obligations tracked.
          </div>
        ) : (
          items.map((it) => (
            <div
              key={it.row.item_id}
              data-testid={`compliance-item-${it.row.item_id}`}
              style={{
                border: "1px solid var(--border)",
                borderLeft: it.overdue ? "3px solid var(--red)" : undefined,
                borderRadius: 8,
                padding: 10,
                color: it.overdue ? "var(--red)" : undefined,
                fontSize: 12,
              }}
            >
              <strong>{it.row.due_date}</strong> — {it.row.obligation}
              {it.overdue ? " — OVERDUE" : ""} · {it.row.authority} · owner{" "}
              {it.row.owner} · {it.row.status} · {it.row.recurrence}
            </div>
          ))
        )}
        {q.data && q.data.open_exceptions.length > 0 ? (
          <div
            data-testid="compliance-exceptions"
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              borderTop: "1px solid var(--border)",
              paddingTop: 8,
            }}
          >
            Open exceptions:{" "}
            {q.data.open_exceptions
              .map((e) => `${e.exc_id} (${e.severity}) ${e.description}`)
              .join("; ")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
