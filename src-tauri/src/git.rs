use crate::types::GitStatus;
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

    Ok(GitStatus {
        branch,
        commit_hash,
        commit_message,
        author,
        time_ago,
        ahead: 0,  // TODO: compute via revwalk
        behind: 0,
        staged,
        unstaged,
        untracked,
        dirty,
    })
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

    let sig = repo
        .signature()
        .map_err(|e| format!("Signature error (set user.name and user.email in git config): {}", e))?;

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
}
