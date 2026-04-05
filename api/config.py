from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _resolve_path(base: Path, raw_value: str) -> Path:
    candidate = Path(raw_value)
    if candidate.is_absolute():
        return candidate.resolve()
    return (base / candidate).resolve()


@dataclass(frozen=True)
class Settings:
    repo_root: Path
    project_root: Path
    devlog_path: Path
    cache_path: Path
    google_cloud_project: str
    gcp_location: str
    gemini_fast_model: str
    gemini_pro_model: str
    host: str
    port: int


def load_settings() -> Settings:
    repo_root = Path(__file__).resolve().parents[1]
    load_dotenv(repo_root / "api" / ".env")

    project_root = _resolve_path(
        repo_root,
        os.getenv("DEVLOG_PROJECT_ROOT", str(repo_root)),
    )
    devlog_path = _resolve_path(
        project_root,
        os.getenv("DEVLOG_PROJECT_MARKDOWN", "devlog/project.md"),
    )
    cache_path = _resolve_path(
        project_root,
        os.getenv("DEVLOG_LOCAL_CACHE", "devlog/data/api_state.json"),
    )

    return Settings(
        repo_root=repo_root,
        project_root=project_root,
        devlog_path=devlog_path,
        cache_path=cache_path,
        google_cloud_project=os.getenv(
            "DEVLOG_GOOGLE_CLOUD_PROJECT",
            "project-5f6bf043-2561-48a7-af4",
        ),
        gcp_location=os.getenv("DEVLOG_GCP_LOCATION", "us-central1"),
        gemini_fast_model=os.getenv("DEVLOG_GEMINI_FAST_MODEL", "gemini-2.5-flash"),
        gemini_pro_model=os.getenv("DEVLOG_GEMINI_PRO_MODEL", "gemini-2.5-pro"),
        host=os.getenv("DEVLOG_API_HOST", "127.0.0.1"),
        port=int(os.getenv("DEVLOG_API_PORT", "8000")),
    )


settings = load_settings()
