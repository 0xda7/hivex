import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getMarketplace,
  installMarketplaceEntry,
  type MarketplaceEntry,
  uninstallMarketplaceEntry,
} from "../../api/client";
import { showNotice } from "../ui/Toast";

const CATEGORY_LABELS: Record<MarketplaceEntry["category"], string> = {
  skill: "Skills",
  expert: "Bot experts",
  plugin: "Plugins",
};

const cardStyle = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "12px 14px",
  background: "var(--bg-warm)",
} as const;

// MarketplaceApp is the office surface for the curated catalog of skills,
// bot experts, and plugins. Install/uninstall write into the workspace.
export function MarketplaceApp() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["marketplace"], queryFn: getMarketplace });

  const invalidate = {
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace"] }),
    onError: (err: Error) => showNotice(err.message),
  };
  const install = useMutation({
    mutationFn: installMarketplaceEntry,
    ...invalidate,
  });
  const uninstall = useMutation({
    mutationFn: uninstallMarketplaceEntry,
    ...invalidate,
  });

  const entries: MarketplaceEntry[] = list.data?.entries ?? [];
  const categories = ["skill", "expert", "plugin"] as const;
  const errMsg = list.isError
    ? list.error instanceof Error
      ? list.error.message
      : String(list.error)
    : null;

  return (
    <div style={{ padding: 20, overflowY: "auto" }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Marketplace</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        Skills, bot experts, and plugins from the Hivex catalog. Installed items
        land in your workspace.
      </p>
      {list.isLoading && <p style={{ fontSize: 13 }}>Loading catalog…</p>}
      {errMsg ? (
        <p style={{ fontSize: 13, color: "var(--red)" }}>{errMsg}</p>
      ) : null}
      {categories.map((cat) => {
        const items = entries.filter((e) => e.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} style={{ marginTop: 20 }}>
            <h2
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-tertiary)",
              }}
            >
              {CATEGORY_LABELS[cat]}
            </h2>
            <ul
              style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}
            >
              {items.map((e) => (
                <li
                  key={e.id}
                  style={cardStyle}
                  data-testid={`marketplace-${e.id}`}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>{e.name}</strong>
                    <div
                      style={{ fontSize: 12, color: "var(--text-secondary)" }}
                    >
                      {e.description}
                    </div>
                  </div>
                  {e.installed ? (
                    <button
                      type="button"
                      onClick={() => uninstall.mutate(e.id)}
                      disabled={uninstall.isPending}
                    >
                      Uninstall
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => install.mutate(e.id)}
                      disabled={install.isPending}
                    >
                      Install
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
