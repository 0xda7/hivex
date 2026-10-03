package team

// wiki_runtime_state_test.go pins the content/state split of the wiki git
// repository: runtime stores (read telemetry, entity facts and graph,
// playbook execution logs, learnings jsonl, fact logs) live inside the wiki
// tree but must never enter the article history — not on bootstrap's
// `git add -A`, not on recovery, not through their dedicated write paths,
// and not on instances created before the root .gitignore existed.

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Northlatch-Labs-LLC/hivex/internal/gitexec"
)

func gitIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{
		"-C", dir,
		"-c", "user.name=wiki-test",
		"-c", "user.email=wiki-test@example.com",
	}, args...)...)
	cmd.Env = gitexec.CleanEnv()
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v in %s: %v\n%s", args, dir, err, out)
	}
	return strings.TrimSpace(string(out))
}

func trackedFiles(t *testing.T, root string) []string {
	t.Helper()
	return strings.Fields(gitIn(t, root, "ls-files"))
}

func writeWikiFile(t *testing.T, root, relPath, content string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(full), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestInitWritesRuntimeStateGitignore(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	if err := repo.Init(ctx); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.Join(repo.Root(), ".gitignore"))
	if err != nil {
		t.Fatalf("root .gitignore missing: %v", err)
	}
	gi := string(data)
	for _, entry := range wikiRuntimeStateGitignoreEntries {
		if !strings.Contains(gi, entry) {
			t.Errorf(".gitignore missing entry %q, got:\n%s", entry, gi)
		}
	}

	// A user-authored line survives re-init, and entries are not duplicated.
	userLine := "# local override"
	if err := os.WriteFile(filepath.Join(repo.Root(), ".gitignore"), []byte(userLine+"\n"+gi), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := repo.Init(ctx); err != nil {
		t.Fatal(err)
	}
	merged, _ := os.ReadFile(filepath.Join(repo.Root(), ".gitignore"))
	if !strings.Contains(string(merged), userLine) {
		t.Error("re-init dropped a user .gitignore line")
	}
	if got := strings.Count(string(merged), "/.reads/"); got != 1 {
		t.Errorf("re-init duplicated an entry: /.reads/ appears %d times", got)
	}
}

func TestBootstrapDoesNotTrackRuntimeState(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	if err := repo.Init(ctx); err != nil {
		t.Fatal(err)
	}

	writeWikiFile(t, repo.Root(), ".reads/reads.jsonl", `{"slug":"a","n":1}`)
	writeWikiFile(t, repo.Root(), "team/entities/people-x.facts.jsonl", `{"fact":1}`)
	writeWikiFile(t, repo.Root(), "team/playbooks/cos.executions.jsonl", `{"run":1}`)
	writeWikiFile(t, repo.Root(), "article.md", "# Team article\n")

	if _, err := repo.CommitBootstrap(ctx, "test: bootstrap"); err != nil {
		t.Fatal(err)
	}

	for _, p := range trackedFiles(t, repo.Root()) {
		if isRuntimeStatePath(p) {
			t.Errorf("bootstrap tracked runtime state: %s", p)
		}
	}
	if status := gitIn(t, repo.Root(), "status", "--porcelain"); status != "" {
		t.Errorf("working tree dirty after bootstrap:\n%s", status)
	}
}

func isRuntimeStatePath(p string) bool {
	return strings.HasPrefix(p, ".reads/") ||
		strings.HasPrefix(p, "team/entities/") ||
		strings.HasSuffix(p, ".executions.jsonl") ||
		p == TeamLearningsJSONLPath ||
		strings.HasPrefix(p, "wiki/facts/")
}

func TestUntrackRuntimeStateMigration(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	if err := repo.Init(ctx); err != nil {
		t.Fatal(err)
	}

	// Simulate a legacy instance: state committed before the .gitignore
	// existed (forced past the ignore rules).
	writeWikiFile(t, repo.Root(), ".reads/reads.jsonl", `{"slug":"a","n":1}`)
	writeWikiFile(t, repo.Root(), "team/entities/people-x.facts.jsonl", `{"fact":1}`)
	gitIn(t, repo.Root(), "add", "-f", ".reads", "team/entities")
	gitIn(t, repo.Root(), "commit", "-q", "-m", "legacy: state swept in")

	// Re-open the same tree: Init must migrate.
	repo2 := NewRepoAt(repo.Root(), repo.BackupRoot())
	if err := repo2.Init(ctx); err != nil {
		t.Fatal(err)
	}

	tracked := trackedFiles(t, repo.Root())
	for _, p := range tracked {
		if p == ".reads/reads.jsonl" || strings.HasPrefix(p, "team/entities/") {
			t.Errorf("state still tracked after migration: %s", p)
		}
	}
	if _, err := os.Stat(filepath.Join(repo.Root(), ".reads", "reads.jsonl")); err != nil {
		t.Errorf("migration deleted the on-disk state file: %v", err)
	}
	if _, err := os.Stat(filepath.Join(repo.Root(), "team", "entities", "people-x.facts.jsonl")); err != nil {
		t.Errorf("migration deleted the on-disk state file: %v", err)
	}
	log := gitIn(t, repo.Root(), "log", "--oneline")
	if !strings.Contains(log, "untrack runtime state") {
		t.Errorf("migration commit missing from history:\n%s", log)
	}

	// Idempotent: a third Init makes no second migration commit.
	repo3 := NewRepoAt(repo.Root(), repo.BackupRoot())
	if err := repo3.Init(ctx); err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(gitIn(t, repo.Root(), "log", "--oneline"), "untrack runtime state"); got != 1 {
		t.Errorf("migration ran twice: %d migration commits", got)
	}
}

func TestCommitEntityFactIsStateOnly(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	if err := repo.Init(ctx); err != nil {
		t.Fatal(err)
	}
	headBefore := gitIn(t, repo.Root(), "rev-parse", "HEAD")

	if _, _, err := repo.CommitEntityFact(ctx, "operator", "team/entities/people-x.facts.jsonl", `{"fact":1}`, ""); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(repo.Root(), "team", "entities", "people-x.facts.jsonl")); err != nil {
		t.Fatalf("state file not written: %v", err)
	}
	if headAfter := gitIn(t, repo.Root(), "rev-parse", "HEAD"); headAfter != headBefore {
		t.Error("entity fact write created a commit")
	}
	if status := gitIn(t, repo.Root(), "status", "--porcelain"); status != "" {
		t.Errorf("state write left the tree dirty:\n%s", status)
	}
}

func TestCommitTeamLearningsTracksPageNotLog(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	if err := repo.Init(ctx); err != nil {
		t.Fatal(err)
	}

	if _, _, err := repo.CommitTeamLearnings(
		ctx, "operator", TeamLearningsJSONLPath,
		`{"learning":"l1"}`, "# Team Learnings\n\n- l1\n", "",
	); err != nil {
		t.Fatal(err)
	}

	tracked := trackedFiles(t, repo.Root())
	hasPage, hasLog := false, false
	for _, p := range tracked {
		if p == TeamLearningsPagePath {
			hasPage = true
		}
		if p == TeamLearningsJSONLPath {
			hasLog = true
		}
	}
	if !hasPage {
		t.Errorf("learnings page not tracked: %v", tracked)
	}
	if hasLog {
		t.Errorf("learnings jsonl tracked as content: %v", tracked)
	}
	if _, err := os.Stat(filepath.Join(repo.Root(), filepath.FromSlash(TeamLearningsJSONLPath))); err != nil {
		t.Errorf("learnings jsonl not written to disk: %v", err)
	}
}
