from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _resolve_path(root_dir: Path, raw_value: str | Path) -> Path:
    candidate = Path(raw_value)
    if candidate.is_absolute():
        return candidate
    return (root_dir / candidate).resolve()


@dataclass(frozen=True)
class Settings:
    root_dir: Path
    data_dir: Path
    project_markdown: Path
    use_vertex: bool
    use_firestore: bool
    google_cloud_project: str | None
    gcp_location: str
    gemini_model: str


def load_settings() -> Settings:
    root_dir = Path(__file__).resolve().parents[2]
    load_dotenv(root_dir / "server" / ".env")
    data_dir = _resolve_path(root_dir, os.getenv("DEVLOG_DATA_DIR", "devlog/data"))
    project_markdown = _resolve_path(
        root_dir,
        os.getenv("DEVLOG_PROJECT_MARKDOWN", "devlog/project.md"),
    )

    return Settings(
        root_dir=root_dir,
        data_dir=data_dir,
        project_markdown=project_markdown,
        use_vertex=_truthy(os.getenv("DEVLOG_USE_VERTEX")),
        use_firestore=_truthy(os.getenv("DEVLOG_USE_FIRESTORE")),
        google_cloud_project=os.getenv("DEVLOG_GOOGLE_CLOUD_PROJECT"),
        gcp_location=os.getenv("DEVLOG_GCP_LOCATION", "us-central1"),
        gemini_model=os.getenv("DEVLOG_GEMINI_MODEL", "gemini-2.5-pro"),
    )


settings = load_settings()
