from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Protocol

from .config import settings
from .models import ProjectState, utc_now_iso

try:
    from google.cloud import firestore  # type: ignore
except Exception:  # pragma: no cover
    firestore = None


class Store(Protocol):
    def get_project(self, project_id: str) -> ProjectState: ...
    def save_project(self, state: ProjectState) -> ProjectState: ...


class LocalStore:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _path_for(self, project_id: str) -> Path:
        return self.data_dir / f"{project_id}.json"

    def get_project(self, project_id: str) -> ProjectState:
        path = self._path_for(project_id)
        if not path.exists():
            return ProjectState(projectId=project_id)

        data = json.loads(path.read_text(encoding="utf-8"))
        return ProjectState.model_validate(data)

    def save_project(self, state: ProjectState) -> ProjectState:
        path = self._path_for(state.projectId)
        state.updatedAt = utc_now_iso()
        with self._lock:
            path.write_text(
                json.dumps(state.model_dump(mode="json"), indent=2),
                encoding="utf-8",
            )
        return state


class FirestoreStore:
    def __init__(self) -> None:
        if firestore is None:
            raise RuntimeError("google-cloud-firestore is not installed.")

        self.client = firestore.Client(project=settings.google_cloud_project)
        self.collection = self.client.collection("devlog_projects")

    def get_project(self, project_id: str) -> ProjectState:
        snapshot = self.collection.document(project_id).get()
        if not snapshot.exists:
            return ProjectState(projectId=project_id)

        return ProjectState.model_validate(snapshot.to_dict())

    def save_project(self, state: ProjectState) -> ProjectState:
        state.updatedAt = utc_now_iso()
        self.collection.document(state.projectId).set(state.model_dump(mode="json"))
        return state


def build_store() -> Store:
    if settings.use_firestore:
        try:
            return FirestoreStore()
        except Exception:
            return LocalStore(settings.data_dir)

    return LocalStore(settings.data_dir)
