use crate::types::{GitLogEntry, GitStatus};
use git2::{Repository, StatusOptions};
use std::path::Path;

/// Get git status for a project directory using libgit2 (no shell-out).
pub fn get_status(project_dir: &Path) -> Result<GitStatus, String> {
    let repo =
        Repository::discover(project_dir).map_err(|e| format!("Not a git repo: {}", e))?;

    let head = repo.head().map_err(|e| format!("No HEAD: {}", e))?;
    let branch = head
        .shorthand()
        .unwrap_or("detached")
        .to_string();

    let commit = head
        .peel_to_commit()
        .map_err(|e| format!("No commit: {}", e))?;

    let commit_hash = format!("{}", &commit.id())[..7].to_string();
    let commit_message = commit
        .message()
        .unwrap_or("")
        .lines()
        .next()
        .unwrap_or("")
        .to_string();

    let author = commit
        .author()
        .name()
        .unwrap_or("unknown")
        .to_string();

    let time_ago = format_time_ago(commit.time().seconds());

    // Count file statuses — skip ignored files (db/, dni/, etc.) for speed
    let mut opts = StatusOptions::new();
    opts.include_ignored(false)
        .include_untracked(true)
        .recurse_untracked_dirs(false);
    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("Status error: {}", e))?;

    let mut staged = 0u32;
    let mut unstaged = 0u32;
    let mut untracked = 0u32;

    for entry in statuses.iter() {
        let s = entry.status();
        if s.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED,
        ) {
            staged += 1;
        }
        if s.intersects(
            git2::Status::WT_MODIFIED
                | git2::Status::WT_DELETED
                | git2::Status::WT_RENAMED,
        ) {
            unstaged += 1;
        }
        if s.contains(git2::Status::WT_NEW) {
            untracked += 1;
        }
    }

    let dirty = staged > 0 || unstaged > 0 || untracked > 0;

    let (ahead, behind) = compute_ahead_behind(&repo);

    Ok(GitStatus {
        branch,
        commit_hash,
        commit_message,
        author,
        time_ago,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        stashes: count_stashes(&repo),
        dirty,
    })
}

/// Get recent commit log using libgit2 revwalk.
pub fn get_log(project_dir: &Path, max_count: usize) -> Result<Vec<GitLogEntry>, String> {
    let repo =
        Repository::discover(project_dir).map_err(|e| format!("Not a git repo: {}", e))?;

    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk error: {}", e))?;
    revwalk
        .push_head()
        .map_err(|e| format!("Push HEAD error: {}", e))?;
    revwalk.set_sorting(git2::Sort::TIME).map_err(|e| format!("Sort error: {}", e))?;

    let mut entries = Vec::with_capacity(max_count);
    for oid in revwalk.take(max_count) {
        let oid = oid.map_err(|e| format!("Revwalk iter error: {}", e))?;
        let commit = repo.find_commit(oid).map_err(|e| format!("Find commit error: {}", e))?;

        let hash = format!("{}", &oid)[..7].to_string();
        let message = commit
            .message()
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("")
            .to_string();
        let author = commit
            .author()
            .name()
            .unwrap_or("unknown")
            .to_string();
        let time_ago = format_time_ago(commit.time().seconds());

        entries.push(GitLogEntry {
            hash,
            message,
            author,
            time_ago,
        });
    }

    Ok(entries)
}

/// Check if the working directory has uncommitted changes.
pub fn is_dirty(project_dir: &Path) -> Result<bool, String> {
    let repo =
        Repository::discover(project_dir).map_err(|e| format!("Not a git repo: {}", e))?;

    let mut opts = StatusOptions::new();
    opts.include_ignored(false)
        .include_untracked(true)
        .recurse_untracked_dirs(false);
    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("Status error: {}", e))?;

    for entry in statuses.iter() {
        let s = entry.status();
        if s.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED
                | git2::Status::WT_MODIFIED
                | git2::Status::WT_DELETED
                | git2::Status::WT_RENAMED
                | git2::Status::WT_NEW,
        ) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Stage all changes and commit with the given message.
/// Returns the abbreviated commit hash.
pub fn commit_all(project_dir: &Path, message: &str) -> Result<String, String> {
    let repo =
        Repository::discover(project_dir).map_err(|e| format!("Not a git repo: {}", e))?;

    // Ensure .gitignore has vendor build directories
    ensure_gitignore_has_vendor_dirs(project_dir);

    // Remove any previously-tracked vendor build dirs from the index
    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
    for dir in VENDOR_BUILD_DIRS {
        let _ = index.remove_all([format!("{}/*", dir)].iter(), None);
    }

    // Stage all files (git add -A equivalent) — respects .gitignore
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Stage error: {}", e))?;
    // Also handle deleted files
    index
        .update_all(["*"].iter(), None)
        .map_err(|e| format!("Stage update error: {}", e))?;
    index.write().map_err(|e| format!("Index write error: {}", e))?;

    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("Tree write error: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("Tree find error: {}", e))?;

    let sig = repo.signature().unwrap_or_else(|_| {
        git2::Signature::now("CovertEDA User", "user@coverteda.local").unwrap()
    });

    let head = repo.head().map_err(|e| format!("No HEAD: {}", e))?;
    let parent = head
        .peel_to_commit()
        .map_err(|e| format!("No parent commit: {}", e))?;

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
        .map_err(|e| format!("Commit error: {}", e))?;

    Ok(format!("{}", &oid)[..7].to_string())
}

/// Get the current HEAD commit hash (abbreviated).
pub fn head_hash(project_dir: &Path) -> Result<String, String> {
    let repo =
        Repository::discover(project_dir).map_err(|e| format!("Not a git repo: {}", e))?;
    let head = repo.head().map_err(|e| format!("No HEAD: {}", e))?;
    let commit = head
        .peel_to_commit()
        .map_err(|e| format!("No commit: {}", e))?;
    Ok(format!("{}", &commit.id())[..7].to_string())
}

/// Initialize a new git repository in the project directory.
/// Creates a .gitignore with FPGA build artifacts, stages all files,
/// and creates an initial commit.
/// Returns the abbreviated commit hash.
pub fn init_repo(project_dir: &Path) -> Result<String, String> {
    let repo = Repository::init(project_dir)
        .map_err(|e| format!("Failed to init repository: {}", e))?;

    // Write .gitignore with FPGA build artifacts
    let gitignore_path = project_dir.join(".gitignore");
    if !gitignore_path.exists() {
        let gitignore = generate_fpga_gitignore();
        std::fs::write(&gitignore_path, gitignore)
            .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
    }

    // Stage all files
    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Stage error: {}", e))?;
    index.write().map_err(|e| format!("Index write error: {}", e))?;

    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("Tree write error: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("Tree find error: {}", e))?;

    // Use git config signature if available, otherwise use fallback
    let sig = repo.signature().unwrap_or_else(|_| {
        git2::Signature::now("CovertEDA User", "user@coverteda.local").unwrap()
    });

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
        .map_err(|e| format!("Commit error: {}", e))?;

    Ok(format!("{}", &oid)[..7].to_string())
}

/// Generate a .gitignore file for FPGA projects.
/// Excludes build-generated files but keeps log files for debugging.
fn generate_fpga_gitignore() -> String {
    r#"# CovertEDA build scripts (generated, cleaned after build)
.coverteda_build.tcl
.coverteda_build.sh
.coverteda_ipgen.tcl
.coverteda_history.json

# Build output directories
build/
impl1/
impl_1/
impl2/
impl3/
output_files/
output/
runs/

# Bitstreams
*.bit
*.bin
*.jed
*.sof
*.svf
*.fs
*.cfg.bit
*.acxbit

# Vendor project files (auto-created by CovertEDA at build time)
*.ldf
*.rdf
*.sty
*.qpf
*.qsf
*.xpr
*.acepro
promote.xml
promote.pfl
.recovery

# Quartus intermediate directories
db/
dni/
qdb/
incremental_db/
greybox_tmp/
simulation/

# Vivado intermediate directories
*.runs/
*.cache/
*.hw/
*.ip_user_files/
*.srcs/

# Lattice intermediate directories
.recovery/
synwork/
synlog/

# Intermediate / object files
*.vo
*.ngd
*.ncd
*.edi
*.edif

# OS artifacts
.DS_Store
Thumbs.db
*~
*.swp
*:Zone.Identifier
"#
    .to_string()
}

/// Vendor build directories that should never be tracked.
const VENDOR_BUILD_DIRS: &[&str] = &[
    "db", "dni", "qdb", "incremental_db", "greybox_tmp", "simulation",
    "output_files", "synwork", "synlog",
];

/// Ensure the project's .gitignore contains critical vendor build directory entries.
/// Appends missing entries without overwriting user content.
fn ensure_gitignore_has_vendor_dirs(project_dir: &Path) {
    let gitignore_path = project_dir.join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore_path).unwrap_or_default();

    let mut missing = Vec::new();
    for dir in VENDOR_BUILD_DIRS {
        let pattern = format!("{}/", dir);
        if !existing.contains(&pattern) {
            missing.push(pattern);
        }
    }

    if !missing.is_empty() {
        let mut content = existing;
        if !content.ends_with('\n') && !content.is_empty() {
            content.push('\n');
        }
        content.push_str("\n# Vendor build directories (auto-added by CovertEDA)\n");
        for m in missing {
            content.push_str(&m);
            content.push('\n');
        }
        let _ = std::fs::write(&gitignore_path, content);
    }
}

/// Branch info returned to the frontend
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub ahead: u32,
    pub behind: u32,
    pub last_commit_hash: String,
    pub last_commit_msg: String,
    pub last_commit_time: String,
}

/// Tag info returned to the frontend
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub target_hash: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub time_ago: Option<String>,
}

fn compute_ahead_behind(repo: &Repository) -> (u32, u32) {
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return (0, 0),
    };
    let local_oid = match head.target() {
        Some(o) => o,
        None => return (0, 0),
    };
    let branch_name = match head.shorthand() {
        Some(n) => n.to_string(),
        None => return (0, 0),
    };
    let upstream_ref = format!("refs/remotes/origin/{}", branch_name);
    let upstream_oid = match repo.refname_to_id(&upstream_ref) {
        Ok(o) => o,
        Err(_) => return (0, 0),
    };
    match repo.graph_ahead_behind(local_oid, upstream_oid) {
        Ok((ahead, behind)) => (ahead as u32, behind as u32),
        Err(_) => (0, 0),
    }
}

fn count_stashes(repo: &Repository) -> u32 {
    let mut count = 0u32;
    // git2 stash_foreach requires &mut Repository
    // but we only have &Repository, so we'll read refs directly
    let mut revwalk = match repo.revwalk() {
        Ok(rw) => rw,
        Err(_) => return 0,
    };
    match repo.refname_to_id("refs/stash") {
        Ok(oid) => {
            let _ = revwalk.push(oid);
            for _ in revwalk {
                count += 1;
            }
        }
        Err(_) => {} // No stash ref = 0 stashes
    }
    count
}

pub fn list_branches(project_dir: &Path) -> Result<Vec<BranchInfo>, String> {
    let repo = Repository::discover(project_dir).map_err(|e| format!("Not a git repo: {}", e))?;
    let head = repo.head().ok();
    let head_oid = head.as_ref().and_then(|h| h.target());
    let current_branch = head.as_ref().and_then(|h| h.shorthand().map(|s| s.to_string()));

    let mut branches = Vec::new();
    for branch_result in repo.branches(None).map_err(|e| format!("Branch list error: {}", e))? {
        let (branch, branch_type) = branch_result.map_err(|e| format!("Branch error: {}", e))?;
        let name = branch.name().map_err(|e| format!("Branch name error: {}", e))?
            .unwrap_or("(unnamed)")
            .to_string();
        let is_remote = branch_type == git2::BranchType::Remote;
        let is_current = !is_remote && current_branch.as_deref() == Some(&name);

        let (commit_hash, commit_msg, commit_time) = match branch.get().peel_to_commit() {
            Ok(c) => {
                let hash = format!("{}", c.id())[..7].to_string();
                let msg = c.message().unwrap_or("").lines().next().unwrap_or("").to_string();
                let time = format_time_ago(c.time().seconds());
                (hash, msg, time)
            }
            Err(_) => ("".to_string(), "".to_string(), "".to_string()),
        };

        let (ahead, behind) = if !is_remote {
            if let (Some(local_oid), Some(_)) = (branch.get().target(), head_oid) {
                let upstream_ref = format!("refs/remotes/origin/{}", name);
                match repo.refname_to_id(&upstream_ref) {
                    Ok(upstream_oid) => {
                        repo.graph_ahead_behind(local_oid, upstream_oid)
                            .map(|(a, b)| (a as u32, b as u32))
                            .unwrap_or((0, 0))
                    }
                    Err(_) => (0, 0),
                }
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        branches.push(BranchInfo {
            name,
            is_current,
            is_remote,
            ahead,
            behind,
            last_commit_hash: commit_hash,
            last_commit_msg: commit_msg,
            last_commit_time: commit_time,
        });
    }
    // Sort: current first, then local, then remote
    branches.sort_by(|a, b| {
        b.is_current.cmp(&a.is_current)
            .then(a.is_remote.cmp(&b.is_remote))
            .then(a.name.cmp(&b.name))
    });
    Ok(branches)
}

pub fn list_tags(project_dir: &Path) -> Result<Vec<TagInfo>, String> {
    let repo = Repository::discover(project_dir).map_err(|e| format!("Not a git repo: {}", e))?;
    let mut tags = Vec::new();
    repo.tag_foreach(|oid, name| {
        let name_str = String::from_utf8_lossy(name)
            .trim_start_matches("refs/tags/")
            .to_string();
        let (target_hash, message, tagger, time_ago) = match repo.find_tag(oid) {
            Ok(tag) => {
                let hash = format!("{}", tag.target_id())[..7].to_string();
                let msg = tag.message().map(|m| m.lines().next().unwrap_or("").to_string());
                let tagger_name = tag.tagger().and_then(|t| t.name().map(|n| n.to_string()));
                let time = tag.tagger().map(|t| format_time_ago(t.when().seconds()));
                (hash, msg, tagger_name, time)
            }
            Err(_) => {
                // Lightweight tag — resolve to commit
                let hash = format!("{}", oid)[..7].to_string();
                (hash, None, None, None)
            }
        };
        tags.push(TagInfo { name: name_str, target_hash, message, tagger, time_ago });
        true
    }).map_err(|e| format!("Tag list error: {}", e))?;
    tags.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tags)
}

pub fn git_pull(project_dir: &Path) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["pull", "--ff-only"])
        .current_dir(project_dir)
        .output()
        .map_err(|e| format!("Failed to run git pull: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn git_push(project_dir: &Path) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["push"])
        .current_dir(project_dir)
        .output()
        .map_err(|e| format!("Failed to run git push: {}", e))?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Ok(format!("{}{}", stdout, stderr))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn git_checkout(project_dir: &Path, branch: &str) -> Result<(), String> {
    let repo = Repository::discover(project_dir).map_err(|e| format!("Not a git repo: {}", e))?;

    // Check for uncommitted changes
    if is_dirty(project_dir)? {
        return Err("Cannot checkout: working directory has uncommitted changes".to_string());
    }

    // Find the branch reference
    let (obj, reference) = repo.revparse_ext(branch)
        .map_err(|e| format!("Branch '{}' not found: {}", branch, e))?;

    repo.checkout_tree(&obj, None)
        .map_err(|e| format!("Checkout failed: {}", e))?;

    match reference {
        Some(gref) => {
            let refname = gref.name().ok_or("Invalid ref name")?;
            repo.set_head(refname)
                .map_err(|e| format!("Set HEAD failed: {}", e))?;
        }
        None => {
            repo.set_head_detached(obj.id())
                .map_err(|e| format!("Set HEAD failed: {}", e))?;
        }
    }
    Ok(())
}

fn format_time_ago(epoch_secs: i64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let diff = now - epoch_secs;

    if diff < 60 {
        "just now".to_string()
    } else if diff < 3600 {
        format!("{}m ago", diff / 60)
    } else if diff < 86400 {
        format!("{}h ago", diff / 3600)
    } else {
        format!("{}d ago", diff / 86400)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now_secs() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }

    #[test]
    fn test_format_time_ago_just_now() {
        let result = format_time_ago(now_secs() - 10);
        assert_eq!(result, "just now");
    }

    #[test]
    fn test_format_time_ago_minutes() {
        let result = format_time_ago(now_secs() - 120);
        assert_eq!(result, "2m ago");
    }

    #[test]
    fn test_format_time_ago_hours() {
        let result = format_time_ago(now_secs() - 7200);
        assert_eq!(result, "2h ago");
    }

    #[test]
    fn test_format_time_ago_days() {
        let result = format_time_ago(now_secs() - 172800);
        assert_eq!(result, "2d ago");
    }

    #[test]
    fn test_init_repo_creates_git_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let project_dir = tmp.path();
        // Create a dummy file so there's something to commit
        std::fs::write(project_dir.join("test.v"), "module test; endmodule\n").unwrap();

        let result = init_repo(project_dir);
        assert!(result.is_ok());
        let hash = result.unwrap();
        assert_eq!(hash.len(), 7);
        // .git directory should exist
        assert!(project_dir.join(".git").exists());
        // .gitignore should exist
        assert!(project_dir.join(".gitignore").exists());
    }

    #[test]
    fn test_init_repo_gitignore_content() {
        let gitignore = generate_fpga_gitignore();
        assert!(gitignore.contains("build/"));
        assert!(gitignore.contains("*.bit"));
        assert!(gitignore.contains("*.bin"));
        assert!(gitignore.contains("*.jed"));
        assert!(gitignore.contains("*.sof"));
        assert!(gitignore.contains(".coverteda_build.tcl"));
        assert!(gitignore.contains("*.rdf"));
        assert!(gitignore.contains("*.acepro"));
        // Quartus intermediate dirs
        assert!(gitignore.contains("db/"));
        assert!(gitignore.contains("dni/"));
        assert!(gitignore.contains("qdb/"));
        assert!(gitignore.contains("incremental_db/"));
        // Vivado intermediate dirs
        assert!(gitignore.contains("*.runs/"));
        assert!(gitignore.contains("*.cache/"));
        // Log files should NOT be excluded
        assert!(!gitignore.contains("*.log"));
    }

    #[test]
    fn test_init_repo_preserves_existing_gitignore() {
        let tmp = tempfile::tempdir().unwrap();
        let project_dir = tmp.path();
        let custom_gitignore = "# Custom gitignore\n*.o\n";
        std::fs::write(project_dir.join(".gitignore"), custom_gitignore).unwrap();
        std::fs::write(project_dir.join("test.v"), "module test; endmodule\n").unwrap();

        let result = init_repo(project_dir);
        assert!(result.is_ok());
        // Should preserve existing .gitignore
        let content = std::fs::read_to_string(project_dir.join(".gitignore")).unwrap();
        assert_eq!(content, custom_gitignore);
    }

    /// Helper: create a temp dir, init a git repo, write a file, and make an initial commit.
    /// Returns (TempDir, path) — keep TempDir alive so the directory isn't deleted.
    fn make_temp_repo() -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().to_path_buf();
        std::fs::write(dir.join("top.v"), "module top; endmodule\n").unwrap();
        init_repo(&dir).expect("init_repo should succeed");
        (tmp, dir)
    }

    // ── get_status() tests ──

    #[test]
    fn test_get_status_clean_repo() {
        let (_tmp, dir) = make_temp_repo();
        let status = get_status(&dir).unwrap();
        // Default branch may be "main" or "master" depending on git config
        assert!(
            status.branch == "main" || status.branch == "master",
            "unexpected branch name: {}",
            status.branch
        );
        assert_eq!(status.commit_hash.len(), 7);
        assert_eq!(status.staged, 0);
        assert_eq!(status.unstaged, 0);
        assert_eq!(status.untracked, 0);
        assert!(!status.dirty);
    }

    #[test]
    fn test_get_status_with_untracked_file() {
        let (_tmp, dir) = make_temp_repo();
        // Add an untracked file
        std::fs::write(dir.join("new_file.v"), "module new; endmodule\n").unwrap();
        let status = get_status(&dir).unwrap();
        assert!(status.untracked >= 1);
        assert!(status.dirty);
    }

    #[test]
    fn test_get_status_with_modified_file() {
        let (_tmp, dir) = make_temp_repo();
        // Modify a tracked file
        std::fs::write(dir.join("top.v"), "module top_modified; endmodule\n").unwrap();
        let status = get_status(&dir).unwrap();
        assert!(status.unstaged >= 1);
        assert!(status.dirty);
    }

    #[test]
    fn test_get_status_with_staged_file() {
        let (_tmp, dir) = make_temp_repo();
        // Create a new file and stage it
        std::fs::write(dir.join("staged.v"), "module staged; endmodule\n").unwrap();
        let repo = Repository::open(&dir).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("staged.v")).unwrap();
        index.write().unwrap();

        let status = get_status(&dir).unwrap();
        assert!(status.staged >= 1);
        assert!(status.dirty);
    }

    // ── get_log() tests ──

    #[test]
    fn test_get_log_single_commit() {
        let (_tmp, dir) = make_temp_repo();
        let log = get_log(&dir, 10).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].message, "Initial commit");
        assert_eq!(log[0].hash.len(), 7);
    }

    #[test]
    fn test_get_log_multiple_commits() {
        let (_tmp, dir) = make_temp_repo();
        // Make a second commit
        std::fs::write(dir.join("second.v"), "module second; endmodule\n").unwrap();
        commit_all(&dir, "Add second module").unwrap();

        let log = get_log(&dir, 10).unwrap();
        assert_eq!(log.len(), 2);
        // Most recent commit first
        assert_eq!(log[0].message, "Add second module");
        assert_eq!(log[1].message, "Initial commit");
    }

    #[test]
    fn test_get_log_max_count_limits_results() {
        let (_tmp, dir) = make_temp_repo();
        // Make several more commits
        for i in 1..=5 {
            std::fs::write(dir.join(format!("file{}.v", i)), format!("module f{}; endmodule\n", i)).unwrap();
            commit_all(&dir, &format!("Commit {}", i)).unwrap();
        }

        let log = get_log(&dir, 3).unwrap();
        assert_eq!(log.len(), 3);
    }

    // ── is_dirty() tests ──

    #[test]
    fn test_is_dirty_clean_repo() {
        let (_tmp, dir) = make_temp_repo();
        assert!(!is_dirty(&dir).unwrap());
    }

    #[test]
    fn test_is_dirty_with_modified_file() {
        let (_tmp, dir) = make_temp_repo();
        std::fs::write(dir.join("top.v"), "module modified; endmodule\n").unwrap();
        assert!(is_dirty(&dir).unwrap());
    }

    #[test]
    fn test_is_dirty_with_untracked_file() {
        let (_tmp, dir) = make_temp_repo();
        std::fs::write(dir.join("untracked.v"), "module untracked; endmodule\n").unwrap();
        assert!(is_dirty(&dir).unwrap());
    }

    #[test]
    fn test_is_dirty_with_deleted_file() {
        let (_tmp, dir) = make_temp_repo();
        std::fs::remove_file(dir.join("top.v")).unwrap();
        assert!(is_dirty(&dir).unwrap());
    }

    // ── count_stashes() tests ──

    #[test]
    fn test_count_stashes_fresh_repo() {
        let (_tmp, dir) = make_temp_repo();
        let repo = Repository::open(&dir).unwrap();
        assert_eq!(count_stashes(&repo), 0);
    }

    // ── compute_ahead_behind() tests ──

    #[test]
    fn test_compute_ahead_behind_no_remote() {
        let (_tmp, dir) = make_temp_repo();
        let repo = Repository::open(&dir).unwrap();
        let (ahead, behind) = compute_ahead_behind(&repo);
        // No remote configured, should return (0, 0)
        assert_eq!(ahead, 0);
        assert_eq!(behind, 0);
    }

    // ── head_hash() tests ──

    #[test]
    fn test_head_hash_matches_status() {
        let (_tmp, dir) = make_temp_repo();
        let hash = head_hash(&dir).unwrap();
        let status = get_status(&dir).unwrap();
        assert_eq!(hash, status.commit_hash);
        assert_eq!(hash.len(), 7);
    }

    // ── commit_all() tests ──

    #[test]
    fn test_commit_all_creates_commit() {
        let (_tmp, dir) = make_temp_repo();
        std::fs::write(dir.join("new.v"), "module new; endmodule\n").unwrap();
        let hash = commit_all(&dir, "Add new module").unwrap();
        assert_eq!(hash.len(), 7);

        // Repo should be clean after commit
        assert!(!is_dirty(&dir).unwrap());

        // Log should show the new commit
        let log = get_log(&dir, 1).unwrap();
        assert_eq!(log[0].message, "Add new module");
    }

    // ── list_branches() tests ──

    #[test]
    fn test_list_branches_single_branch() {
        let (_tmp, dir) = make_temp_repo();
        let branches = list_branches(&dir).unwrap();
        assert!(!branches.is_empty());
        // The current branch should be marked as current
        let current = branches.iter().find(|b| b.is_current).unwrap();
        assert!(
            current.name == "main" || current.name == "master",
            "unexpected branch name: {}",
            current.name
        );
        assert!(!current.is_remote);
    }

    // ── ensure_gitignore_has_vendor_dirs() tests ──

    #[test]
    fn test_ensure_gitignore_adds_missing_vendor_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        // Start with a minimal .gitignore missing vendor dirs
        std::fs::write(dir.join(".gitignore"), "*.o\n").unwrap();
        ensure_gitignore_has_vendor_dirs(dir);

        let content = std::fs::read_to_string(dir.join(".gitignore")).unwrap();
        for vendor_dir in VENDOR_BUILD_DIRS {
            let pattern = format!("{}/", vendor_dir);
            assert!(content.contains(&pattern), "Missing vendor dir: {}", vendor_dir);
        }
    }

    #[test]
    fn test_ensure_gitignore_no_duplicates() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        // .gitignore already has all vendor dirs
        let mut initial = String::new();
        for vendor_dir in VENDOR_BUILD_DIRS {
            initial.push_str(&format!("{}/\n", vendor_dir));
        }
        std::fs::write(dir.join(".gitignore"), &initial).unwrap();
        ensure_gitignore_has_vendor_dirs(dir);

        // Should not have added anything extra
        let content = std::fs::read_to_string(dir.join(".gitignore")).unwrap();
        assert_eq!(content, initial);
    }
}
