import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  GRIDFRAME_REGISTER_TABLES,
  type GridframeRegisterTableName,
  getGridframeExport,
  getGridframeRegister,
  postGridframeDecide,
  postGridframeRegisterRow,
} from "../../api/client";
import { showNotice } from "../ui/Toast";

/**
 * Gridframe Board register tabs (G4, spec §9.3): approvals / revenue /
 * costs / exceptions / AEI. Each tab lists the §5.1 ledger (headers come
 * from the backend, so column order is byte-parity), carries an add-row
 * form (append-only; aei-monthly is engine-only — 403 by design) and CSV
 * export parity. The approvals tab adds §4 decision buttons on pending
 * rows; each click is the authenticated human event.
 */

const REGISTER_QUERY_KEY = ["gridframe", "register"] as const;

const TAB_LABELS: Record<GridframeRegisterTableName, string> = {
  "approval-queue": "Approvals",
  "revenue-ledger": "Revenue",
  "cost-ledger": "Costs",
  "exception-log": "Exceptions",
  "aei-monthly": "AEI",
};

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
      void queryClient.invalidateQueries({ queryKey: REGISTER_QUERY_KEY });
    },
    onError: (err) =>
      showNotice(
        err instanceof ApiError ? err.message : "Decision failed",
        "error",
      ),
  });
}

function AddRowForm({
  table,
  headers,
}: {
  table: GridframeRegisterTableName;
  headers: string[];
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reverseOf, setReverseOf] = useState("");
  const add = useMutation({
    mutationFn: (v: Record<string, string>) =>
      postGridframeRegisterRow(
        table,
        v,
        reverseOf ? { reverse_of: reverseOf } : {},
      ),
    onSuccess: () => {
      showNotice(`${TAB_LABELS[table]} row appended`, "success");
      setValues({});
      setReverseOf("");
      void queryClient.invalidateQueries({ queryKey: REGISTER_QUERY_KEY });
    },
    onError: (err) =>
      showNotice(
        err instanceof ApiError ? err.message : "Append failed",
        "error",
      ),
  });
  if (table === "aei-monthly") {
    return (
      <div
        style={{ fontSize: 12, color: "var(--text-tertiary)" }}
        data-testid="board-engine-only"
      >
        aei-monthly rows are appended by the AEI engine only (§5.3) — the form
        is disabled here.
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
      data-testid="board-add-row"
    >
      {headers.map((h) => (
        <input
          key={h}
          placeholder={h}
          aria-label={h}
          value={values[h] ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, [h]: e.target.value }))}
          style={{ width: 110, fontSize: 12, padding: "4px 6px" }}
        />
      ))}
      <input
        placeholder="reverse_of (optional)"
        aria-label="reverse_of"
        value={reverseOf}
        onChange={(e) => setReverseOf(e.target.value)}
        style={{ width: 150, fontSize: 12, padding: "4px 6px" }}
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={add.isPending}
        onClick={() => add.mutate(values)}
      >
        Append row
      </button>
    </div>
  );
}

function ExportButton({ table }: { table: GridframeRegisterTableName }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    setBusy(true);
    try {
      const blob = await getGridframeExport(table);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${table}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showNotice(
        err instanceof ApiError ? err.message : "Export failed",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className="btn"
      disabled={busy}
      onClick={onClick}
      data-testid="board-export"
    >
      Export CSV
    </button>
  );
}

function RegisterTab({ table }: { table: GridframeRegisterTableName }) {
  const q = useQuery({
    queryKey: [...REGISTER_QUERY_KEY, table],
    queryFn: ({ signal }) => getGridframeRegister(table, signal),
  });
  const decide = useDecide();
  const headers = q.data?.headers ?? [];
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <AddRowForm table={table} headers={headers} />
        <ExportButton table={table} />
      </div>
      {q.isPending ? (
        <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
          Loading {TAB_LABELS[table]}…
        </div>
      ) : q.isError ? (
        <div role="alert" style={{ color: "var(--red)", fontSize: 13 }}>
          {q.error instanceof ApiError ? q.error.message : "broker unreachable"}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}
            data-testid={`board-table-${table}`}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                {headers.map((h) => (
                  <th key={h} style={{ padding: 6 }}>
                    {h}
                  </th>
                ))}
                {table === "approval-queue" ? (
                  <th style={{ padding: 6 }}>decision</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {(q.data?.rows ?? []).map((row, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  {headers.map((h) => (
                    <td key={h} style={{ padding: 6 }}>
                      {row[h] ?? ""}
                    </td>
                  ))}
                  {table === "approval-queue" && row.status === "pending" ? (
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                      {(["approve", "reject", "defer"] as const).map((act) => (
                        <button
                          key={act}
                          type="button"
                          disabled={decide.isPending}
                          data-testid={`board-${act}-${row.item_id}`}
                          className={`btn ${act === "approve" ? "btn-primary" : ""}`}
                          style={{ marginRight: 4 }}
                          onClick={() =>
                            decide.mutate({
                              itemId: row.item_id,
                              tier: row.tier,
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
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BoardRoute() {
  const [tab, setTab] = useState<GridframeRegisterTableName>("approval-queue");
  return (
    <div className="app-panel active" data-testid="board-route">
      <header
        style={{
          padding: "16px 20px 8px",
          display: "flex",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Board</h2>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          §5.1 registers — append-only; corrections are reversing rows
        </span>
      </header>
      <nav
        style={{
          padding: "0 20px",
          display: "flex",
          gap: 6,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {GRIDFRAME_REGISTER_TABLES.map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`board-tab-${t}`}
            className={`btn ${t === tab ? "btn-primary" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>
      <div style={{ padding: "12px 20px 20px", overflowX: "auto" }}>
        <RegisterTab table={tab} />
      </div>
    </div>
  );
}

export default BoardRoute;
