from __future__ import annotations

import argparse
import difflib
import json
import threading
import time
from pathlib import Path

import requests
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

IGNORE_PARTS = {
    ".git",
    ".venv",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    ".cache",
    "devlog/data",
    "devlog/.cache",
    "Innovation-Hacks-local",
}

TEXT_SUFFIXES = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".css",
    ".html",
    ".yml",
    ".yaml",
    ".toml",
    ".env",
    ".txt",
}


class DevLogWatcher(FileSystemEventHandler):
    def __init__(
        self,
        project_root: Path,
        backend_url: str,
        project_id: str,
        debounce_ms: int,
        mirror_path: Path,
    ) -> None:
        self.project_root = project_root.resolve()
        self.backend_url = backend_url.rstrip("/")
        self.project_id = project_id
        self.debounce_seconds = debounce_ms / 1000
        self.mirror_path = mirror_path.resolve()
        self.cache_path = self.project_root / "devlog" / ".cache" / f"{project_id}.json"
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)

        self.file_cache: dict[str, str] = {}
        self.timers: dict[str, threading.Timer] = {}
        self.event_types: dict[str, str] = {}
        self._load_cache()

    def on_created(self, event: FileSystemEvent) -> None:
        self._schedule(event, "create")

    def on_modified(self, event: FileSystemEvent) -> None:
        self._schedule(event, "modify")

    def on_deleted(self, event: FileSystemEvent) -> None:
        self._schedule(event, "delete")

    def _schedule(self, event: FileSystemEvent, change_type: str) -> None:
        if event.is_directory:
            return

        path = Path(event.src_path).resolve()
        if self._should_ignore(path):
            return

        rel_path = self._relative(path)
        existing = self.timers.pop(rel_path, None)
        if existing is not None:
            existing.cancel()

        self.event_types[rel_path] = change_type
        timer = threading.Timer(self.debounce_seconds, self._process, args=(path, rel_path))
        self.timers[rel_path] = timer
        timer.start()

    def _process(self, path: Path, rel_path: str) -> None:
        change_type = self.event_types.pop(rel_path, "modify")
        self.timers.pop(rel_path, None)

        old_content = self.file_cache.get(rel_path, "")
        new_content = ""

        if change_type != "delete" and path.exists():
            if not self._is_text_file(path):
                return
            try:
                new_content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                return
            except OSError:
                return

        diff_text = self._build_diff(rel_path, old_content, new_content)
        if not diff_text.strip():
            return

        payload = {
            "projectId": self.project_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "filePath": rel_path.replace("\\", "/"),
            "changeType": change_type,
            "diffText": diff_text,
        }

        try:
            response = requests.post(f"{self.backend_url}/events", json=payload, timeout=20)
            response.raise_for_status()
            state = response.json()["state"]
            self._write_markdown(state["markdown"])
        except requests.RequestException as exc:
            print(f"[devlog] failed to send event for {rel_path}: {exc}")
            return

        if change_type == "delete":
            self.file_cache.pop(rel_path, None)
        else:
            self.file_cache[rel_path] = new_content

        self._save_cache()

    def seed_cache(self) -> None:
        for path in self.project_root.rglob("*"):
            if not path.is_file():
                continue
            if self._should_ignore(path) or not self._is_text_file(path):
                continue
            rel_path = self._relative(path)
            try:
                self.file_cache[rel_path] = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
        self._save_cache()
        self._sync_remote_markdown()

    def _sync_remote_markdown(self) -> None:
        try:
            response = requests.get(
                f"{self.backend_url}/state",
                params={"projectId": self.project_id},
                timeout=15,
            )
            response.raise_for_status()
            self._write_markdown(response.json()["markdown"])
        except requests.RequestException as exc:
            print(f"[devlog] failed to sync markdown: {exc}")

    def _write_markdown(self, markdown: str) -> None:
        self.mirror_path.parent.mkdir(parents=True, exist_ok=True)
        self.mirror_path.write_text(markdown, encoding="utf-8")

    def _build_diff(self, rel_path: str, old: str, new: str) -> str:
        old_lines = old.splitlines()
        new_lines = new.splitlines()
        diff = difflib.unified_diff(
            old_lines,
            new_lines,
            fromfile=f"a/{rel_path}",
            tofile=f"b/{rel_path}",
            lineterm="",
        )
        return "\n".join(diff)

    def _should_ignore(self, path: Path) -> bool:
        try:
            rel = path.resolve().relative_to(self.project_root).as_posix()
        except ValueError:
            return True

        if rel == self.mirror_path.relative_to(self.project_root).as_posix():
            return True

        for part in IGNORE_PARTS:
            if part in rel:
                return True
        return False

    def _is_text_file(self, path: Path) -> bool:
        if path.name.startswith(".env"):
            return True
        return path.suffix.lower() in TEXT_SUFFIXES

    def _relative(self, path: Path) -> str:
        return str(path.resolve().relative_to(self.project_root))

    def _load_cache(self) -> None:
        if not self.cache_path.exists():
            return
        try:
            self.file_cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            self.file_cache = {}

    def _save_cache(self) -> None:
        self.cache_path.write_text(json.dumps(self.file_cache), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the DevLog file watcher.")
    parser.add_argument("--project-root", default=".", help="Directory to watch.")
    parser.add_argument("--backend-url", default="http://localhost:8000", help="DevLog backend URL.")
    parser.add_argument("--project-id", default="default", help="Project identifier.")
    parser.add_argument("--debounce-ms", type=int, default=1200, help="Debounce window in milliseconds.")
    parser.add_argument("--mirror-path", default="devlog/project.md", help="Local markdown mirror path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    project_root = Path(args.project_root).resolve()
    mirror_path = project_root / args.mirror_path

    watcher = DevLogWatcher(
        project_root=project_root,
        backend_url=args.backend_url,
        project_id=args.project_id,
        debounce_ms=args.debounce_ms,
        mirror_path=mirror_path,
    )
    watcher.seed_cache()

    observer = Observer()
    observer.schedule(watcher, str(project_root), recursive=True)
    observer.start()
    print(f"[devlog] watching {project_root}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
