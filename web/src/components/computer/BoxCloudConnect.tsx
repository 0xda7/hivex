/**
 * BoxCloudConnect — the cloud connection block shared by the Computer tab
 * and Settings: sign in to Gridframe Cloud (primary), paste a key (fallback),
 * the signed-in account line, the plan gate, and sign out.
 *
 * The onboarding step renders its own copy of this surface from the same
 * hook, with wizard-specific copy; everything in the app proper uses this.
 */

import { useState } from "react";

import { ApiError, updateConfig } from "../../api/client";
import { BOX_BILLING_URL } from "../../api/computer";
import { type BoxSigninPhase, useBoxSignin } from "../../hooks/useBoxSignin";
import { BoxPlanNotice, boxAccountLine } from "./BoxPlanNotice";

export const BOX_INSTALL_COMMAND =
  "curl -fsSL https://ascii.dev/api/box/install | sh";

interface BoxCloudConnectProps {
  /** Called after the account view changed (key saved, signed out). */
  onChanged?: () => void;
  /** Hide the paste fallback until asked for. */
  compact?: boolean;
}

function SigninProgress({
  phase,
  authUrl,
  waitingSeconds,
  onCancel,
}: {
  phase: BoxSigninPhase;
  authUrl: string;
  waitingSeconds: number;
  onCancel: () => void;
}) {
  if (phase === "installing") {
    return <span className="box-account-line">Getting the Box CLI ready…</span>;
  }
  if (phase === "awaiting_login") {
    return (
      <span className="box-account-line" data-testid="box-signin-waiting">
        Waiting for you to finish in the Gridframe tab
        {waitingSeconds >= 5
          ? ` (${waitingSeconds}s, checking every few seconds)`
          : ""}
        .{" "}
        {authUrl ? (
          <a
            href={authUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="box-signin-link"
          >
            Open it again
          </a>
        ) : null}
        {" · "}
        <button
          type="button"
          className="btn btn-text btn-sm"
          onClick={onCancel}
          data-testid="box-signin-cancel"
        >
          Start over
        </button>
      </span>
    );
  }
  if (phase === "provisioning") {
    return (
      <span className="box-account-line">
        Signed in. Creating a key named hivebot…
      </span>
    );
  }
  return null;
}

interface PasteKeyProps {
  showPaste: boolean;
  onShowPaste: () => void;
  keyValue: string;
  onKeyChange: (value: string) => void;
  saving: boolean;
  saveError: string | null;
  onSubmit: (event: React.FormEvent) => void;
}

function PasteKey({
  showPaste,
  onShowPaste,
  keyValue,
  onKeyChange,
  saving,
  saveError,
  onSubmit,
}: PasteKeyProps) {
  if (!showPaste) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onShowPaste}
        data-testid="box-paste"
      >
        Or paste a key yourself
      </button>
    );
  }
  return (
    <form className="computer-box-key" onSubmit={onSubmit}>
      <input
        type="password"
        className="input computer-box-key-input"
        aria-label="Gridframe Cloud API key"
        placeholder="box_…"
        value={keyValue}
        onChange={(event) => onKeyChange(event.target.value)}
        autoComplete="off"
        data-testid="box-key-input"
      />
      <button
        type="submit"
        className="btn btn-secondary btn-sm"
        disabled={saving || keyValue.trim() === ""}
        data-testid="box-key-save"
      >
        {saving ? "Checking…" : "Save key"}
      </button>
      {saveError ? (
        <p
          role="alert"
          className="computer-card-text computer-card-text--error"
          data-testid="box-key-error"
        >
          {saveError}
        </p>
      ) : null}
    </form>
  );
}

export function BoxCloudConnect({
  onChanged,
  compact = false,
}: BoxCloudConnectProps) {
  const signin = useBoxSignin();
  const [showPaste, setShowPaste] = useState(!compact);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const busy =
    signin.phase === "installing" ||
    signin.phase === "awaiting_login" ||
    signin.phase === "provisioning" ||
    signin.phase === "signing_out";

  const saveKey = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = keyValue.trim();
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateConfig({ box_api_key: token });
      setKeyValue("");
      await signin.refreshAccount();
      onChanged?.();
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? error.message
          : "We could not save that key. Check it and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await signin.signOut();
    onChanged?.();
  };

  const line = boxAccountLine(signin.account);
  return (
    <div className="box-account-row" data-testid="box-cloud-connect">
      {signin.accountLoaded && line ? (
        <p className="box-account-line" data-testid="box-account-line">
          {line}
        </p>
      ) : null}
      <BoxPlanNotice account={signin.account} compact={true} />
      <div className="box-account-actions">
        {signin.keySet ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void signOut()}
            disabled={busy}
            data-testid="box-signout"
          >
            {signin.phase === "signing_out"
              ? "Signing out…"
              : "Sign out and sign in again"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={signin.start}
            disabled={busy}
            data-testid="box-signin"
          >
            Sign in to Gridframe Cloud
          </button>
        )}
        <SigninProgress
          phase={signin.phase}
          authUrl={signin.authUrl}
          waitingSeconds={signin.waitingSeconds}
          onCancel={() => void signin.cancel()}
        />
      </div>
      {!signin.keySet ? (
        <p className="box-account-line" data-testid="box-plan-hint">
          Computers run on your own Gridframe account at gridframes.app; you pay
          Gridframe directly.{" "}
          <a
            href={BOX_BILLING_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="box-plan-hint-link"
          >
            Plans and trial
          </a>
        </p>
      ) : null}
      {signin.phase === "cli_missing" ? (
        <div
          role="alert"
          className="computer-card-text computer-card-text--secondary"
        >
          {signin.error ||
            "We could not set up the Box CLI on this machine. Run this in a terminal, then try again:"}
          <br />
          <code>{signin.installCommand || BOX_INSTALL_COMMAND}</code>
        </div>
      ) : null}
      {signin.phase === "error" ? (
        <p
          role="alert"
          className="computer-card-text computer-card-text--error"
          data-testid="box-signin-error"
        >
          {signin.error} Use Sign in to Gridframe Cloud to try again, or paste a
          key.
        </p>
      ) : null}
      {!signin.keySet ? (
        <PasteKey
          showPaste={showPaste}
          onShowPaste={() => setShowPaste(true)}
          keyValue={keyValue}
          onKeyChange={setKeyValue}
          saving={saving}
          saveError={saveError}
          onSubmit={saveKey}
        />
      ) : null}
    </div>
  );
}
