use crate::types::GitStatus;
use git2::Repository;
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

    // Count file statuses
    let statuses = repo
        .statuses(None)
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

    let statuses = repo
        .statuses(None)
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

    // Stage all files (git add -A equivalent)
    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
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
}
