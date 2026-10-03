package team

// wiki_runtime_state.go owns the content/state split of the wiki git
// repository. Runtime stores (read telemetry, entity fact/graph logs,
// playbook execution logs, the learnings jsonl, the fact store) live inside
// the wiki tree for their readers but are never versioned as articles:
// ensureLayoutLocked writes the ignore rules, Init migrates legacy
// instances that predate them, and the state write paths report HEAD
// instead of creating commits.

import (
	"context"
	"fmt"
	"strings"
)

// wikiRuntimeStateGitignoreEntries are the machine-written runtime stores
// that live inside the wiki tree but are not wiki content: read telemetry,
// the entity fact/graph logs, playbook execution logs, the learnings jsonl,
// and the new-schema fact store. The files stay on disk for their readers —
// they are just never versioned as articles.
var wikiRuntimeStateGitignoreEntries = []string{
	"/.reads/",
	"/team/entities/",
	"/team/playbooks/*.executions.jsonl",
	"/team/learnings/index.jsonl",
	"/wiki/facts/",
}

// wikiRuntimeStatePathspecs mirrors wikiRuntimeStateGitignoreEntries as git
// pathspecs for the probe in untrackRuntimeStateLocked.
var wikiRuntimeStatePathspecs = []string{
	".reads",
	"team/entities",
	"team/playbooks/*.executions.jsonl",
	"team/learnings/index.jsonl",
	"wiki/facts",
}

// untrackRuntimeStateLocked migrates pre-existing instances: state files
// committed before the root .gitignore existed are removed from the index
// in a single labelled commit. Idempotent — once clean, the ls-files probe
// comes back empty and no commit is made. Files remain on disk; only their
// membership in the content history changes.
// Caller must hold r.mu.
func (r *Repo) untrackRuntimeStateLocked(ctx context.Context) error {
	probeArgs := append([]string{"ls-files", "-z", "--"}, wikiRuntimeStatePathspecs...)
	out, err := r.runGitLocked(ctx, "system", probeArgs...)
	if err != nil {
		return fmt.Errorf("wiki: runtime-state probe: %w: %s", err, out)
	}
	var tracked []string
	for _, p := range strings.Split(out, "\x00") {
		if p != "" {
			tracked = append(tracked, p)
		}
	}
	if len(tracked) == 0 {
		return nil
	}
	rmArgs := append([]string{"rm", "-q", "--cached", "--"}, tracked...)
	if rmOut, err := r.runGitLocked(ctx, "system", rmArgs...); err != nil {
		return fmt.Errorf("wiki: untrack runtime state: %w: %s", err, rmOut)
	}
	if cOut, err := r.runGitLocked(ctx, "system", "commit", "-q", "-m", "hivex: untrack runtime state from the wiki content repo"); err != nil {
		return fmt.Errorf("wiki: runtime-state migration commit: %w: %s", err, cOut)
	}
	return nil
}

// headShortLocked resolves the short SHA of HEAD. Runtime-state writers
// (entity facts, the graph log, playbook executions, fact logs) no longer
// commit — their files are excluded from the content history — so they
// report HEAD as their revision, the same shape these paths already
// returned for byte-identical no-op writes.
// Caller must hold r.mu.
func (r *Repo) headShortLocked(ctx context.Context, op string) (string, error) {
	sha, err := r.runGitLocked(ctx, "system", "rev-parse", "--short", "HEAD")
	if err != nil {
		return "", fmt.Errorf("%s: resolve HEAD: %w", op, err)
	}
	return strings.TrimSpace(sha), nil
}
