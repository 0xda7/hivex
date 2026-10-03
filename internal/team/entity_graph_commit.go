package team

// entity_graph_commit.go owns the repo-level write that rewrites the
// cross-entity adjacency log at team/entities/.graph.jsonl. Shares the
// same single-writer wiki goroutine as fact writes, but uses a dedicated
// path pattern + commit method because the standard Repo.Commit path only
// accepts .md extensions.

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// CommitEntityGraph writes the full graph log to team/entities/.graph.jsonl
// as runtime state — disk-only, never staged or committed (excluded by the
// wiki root .gitignore); HEAD is reported for response-shape compatibility.
// Always replace-mode — the EntityGraph builder in entity_graph.go merges
// existing bytes with the new edges before calling this.
func (r *Repo) CommitEntityGraph(ctx context.Context, slug, content, message string) (string, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	slug = strings.TrimSpace(slug)
	if slug == "" {
		return "", 0, fmt.Errorf("entity graph commit: author slug is required")
	}
	if content == "" {
		return "", 0, fmt.Errorf("entity graph commit: content is required")
	}

	clean := filepath.ToSlash(filepath.Clean(EntityGraphPath))
	fullPath := filepath.Join(r.root, clean)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o700); err != nil {
		return "", 0, fmt.Errorf("entity graph commit: mkdir: %w", err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o600); err != nil {
		return "", 0, fmt.Errorf("entity graph commit: write: %w", err)
	}

	sha, err := r.headShortLocked(ctx, "entity graph commit")
	if err != nil {
		return "", 0, err
	}
	return sha, len(content), nil
}
