/**
 * BoxPlanNotice — the one place the Gridframe Cloud plan gate is explained.
 *
 * A key can be valid and the account still unable to start a box: Gridframe Cloud
 * answers subscription_required until a plan or the 7-day trial is started.
 * Nobody can know that without being told, so wherever the cloud shows up
 * (onboarding, the Computer tab, Settings) this notice names the block and
 * links to the billing page. Renders nothing when the account can start.
 */

import { type BoxAccount, describeBoxBlock } from "../../api/computer";

interface BoxPlanNoticeProps {
  account: BoxAccount | null;
  /** Compact form for inline use under a status line. */
  compact?: boolean;
}

export function BoxPlanNotice({
  account,
  compact = false,
}: BoxPlanNoticeProps) {
  if (!account || account.canStart !== false) return null;
  const reason = describeBoxBlock(account.blockedReason);
  return (
    <div
      className={
        compact ? "box-plan-notice box-plan-notice--compact" : "box-plan-notice"
      }
      role="status"
      data-testid="box-plan-notice"
    >
      <p className="box-plan-notice-text">
        <strong>Your Gridframe Cloud account cannot start a box yet.</strong>{" "}
        {reason}
        {account.trialLine ? ` Trial limits: ${account.trialLine}.` : ""}
      </p>
      <a
        href={account.billingUrl}
        target="_blank"
        rel="noreferrer"
        className="btn btn-secondary btn-sm"
        data-testid="box-plan-notice-link"
      >
        Start the trial or a plan on Gridframe
      </a>
    </div>
  );
}

/** One line naming the signed-in account, for status rows. */
export function boxAccountLine(account: BoxAccount | null): string {
  if (!account) return "";
  if (account.signedIn && account.identifier) {
    return `Signed in to Gridframe Cloud as ${account.identifier}${account.plan ? ` (${account.plan})` : ""}.`;
  }
  if (account.keySet) return "A Box key is saved.";
  return "Not connected to Gridframe Cloud.";
}
