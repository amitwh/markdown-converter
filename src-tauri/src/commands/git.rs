use git2::{Repository, Status, DiffOptions};
use tauri::CommandResult;
use crate::error::AppError;

#[tauri::command]
pub async fn git_status(repo_path: String) -> CommandResult<Vec<GitStatusEntry>, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e.to_string()))?;
    let mut statuses = Vec::new();

    repo.statuses(None).map_err(|e| AppError::Git(e.to_string()))?.foreach(|entry| {
        if let Some(status) = entry.status() {
            let path = entry.path().unwrap_or("").to_string();
            statuses.push(GitStatusEntry {
                path,
                is_staged: status.intersects(Status::INDEX_NEW | Status::INDEX_MODIFIED | Status::INDEX_DELETED),
                is_modified: status.intersects(Status::WT_MODIFIED),
                is_new: status.intersects(Status::WT_NEW),
                is_deleted: status.intersects(Status::WT_DELETED),
            });
        }
        true
    }).map_err(|e| AppError::Git(e.to_string()))?;

    Ok(statuses)
}

#[derive(serde::Serialize)]
pub struct GitStatusEntry {
    pub path: String,
    pub is_staged: bool,
    pub is_modified: bool,
    pub is_new: bool,
    pub is_deleted: bool,
}

#[tauri::command]
pub async fn git_stage(repo_path: String, path: String) -> CommandResult<(), AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e.to_string()))?;
    let mut index = repo.index().map_err(|e| AppError::Git(e.to_string()))?;
    index.add_path(std::path::Path::new(&path)).map_err(|e| AppError::Git(e.to_string()))?;
    index.write().map_err(|e| AppError::Git(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> CommandResult<String, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e.to_string()))?;
    let mut index = repo.index().map_err(|e| AppError::Git(e.to_string()))?;
    let oid = index.write_tree().map_err(|e| AppError::Git(e.to_string()))?;
    let tree = repo.find_tree(oid).map_err(|e| AppError::Git(e.to_string()))?;
    let signature = repo.signature().map_err(|e| AppError::Git(e.to_string()))?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let commit = repo.commit(
        Some("HEAD"), &signature, &signature, &message, &tree,
        parent.as_ref(),
    ).map_err(|e| AppError::Git(e.to_string()))?;
    Ok(commit.to_string())
}

#[tauri::command]
pub async fn git_log(repo_path: String, limit: Option<usize>) -> CommandResult<Vec<GitCommitEntry>, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e.to_string()))?;
    let mut revwalk = repo.revwalk().map_err(|e| AppError::Git(e.to_string()))?;
    revwalk.push_head().map_err(|e| AppError::Git(e.to_string()))?;
    let max = limit.unwrap_or(50);
    let mut commits = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i >= max { break; }
        let commit = repo.find_commit(oid).map_err(|e| AppError::Git(e.to_string()))?;
        commits.push(GitCommitEntry {
            hash: commit.id().to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            date: chrono::DateTime::from_timestamp(commit.time().seconds(), 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_default(),
        });
    }
    Ok(commits)
}

#[derive(serde::Serialize)]
pub struct GitCommitEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[tauri::command]
pub async fn git_diff(repo_path: String, path: Option<String>) -> CommandResult<String, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e.to_string()))?;
    let mut opts = DiffOptions::new();
    if let Some(p) = path {
        opts.path_filter(&p);
    }
    let diff = repo.diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| AppError::Git(e.to_string()))?;
    let mut out = Vec::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _origin, line| {
        let prefix = match line.origin() {
            '+' => " +",
            '-' => " -",
            ' ' => "  ",
            _ => "",
        };
        if let Ok(content) = std::str::from_utf8(line.content()) {
            out.push(format!("{}{}", prefix, content));
        }
        true
    }).map_err(|e| AppError::Git(e.to_string()))?;
    Ok(out.join(""))
}
