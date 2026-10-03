import { useQuery } from "@tanstack/react-query";

import { getProviderModels, type LocalProviderStatus } from "../api/client";
import { modelOptionsForKind } from "./modelCatalog";

/**
 * Model options for a runtime kind: the verified catalog entry merged with
 * whatever the provider's live /models endpoint actually serves. Discovery
 * is best-effort — a provider that cannot be reached simply leaves the
 * catalog (and the Custom… escape hatch) as the options.
 */
export function useProviderModels(
  kind: string | undefined,
  localStatuses?: LocalProviderStatus[],
) {
  const discovered = useQuery({
    queryKey: ["provider-models", kind],
    queryFn: () => getProviderModels(kind ?? ""),
    enabled: Boolean(kind),
    staleTime: 60_000,
    retry: false,
  });
  const catalog = modelOptionsForKind((kind ?? "") as never, localStatuses);
  const live = (discovered.data?.models ?? []).filter(
    (m: string) => !catalog.some((c) => c.value === m),
  );
  return {
    options: [
      ...catalog,
      ...live.map((id: string) => ({ value: id, label: id, discovered: true })),
    ],
    loading: discovered.isLoading,
  };
}
