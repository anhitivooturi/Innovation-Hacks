"""
DevLog file watcher.
Watches a local workspace and posts diffs to the local DevLog API.
"""

from __future__ import annotations

import difflib
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer


DEBOUNCE_DELAY = 2.0
MAX_FILE_SIZE = 1024 * 1024
IGNORE_PATTERNS = {
    ".git",
    ".venv",
    ".venv313",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "devlog",
    ".DS_Store",
}


class DevLogWatcher(FileSystemEventHandler):
    def __init__(self, watch_path: str, api_url: str, project_id: str) -> None:
        super().__init__()
        self.watch_path = Path(watch_path).resolve()
        self.api_url = api_url
        self.project_id = project_id
        self.file_cache: dict[str, str] = {}
        self.pending_changes: dict[str, str] = {}
        self.debounce_timer: Optional[threading.Timer] = None
        self.timer_lock = threading.Lock()
        self.initialize_cache()

    def initialize_cache(self) -> None:
        print("[watcher] Initializing file cache...")
        if not self.watch_path.exists():
            print(f"[watcher] Watch path does not exist: {self.watch_path}")
            return

        count = 0
        for path in self.watch_path.rglob("*"):
            if not path.is_file() or self.should_ignore(path):
                continue
            content = self.read_file_content(path)
            if content is None:
                continue
            self.file_cache[str(path)] = content
            count += 1
        print(f"[watcher] Cached {count} files")

    def should_ignore(self, file_path: str | Path) -> bool:
        path = Path(file_path)
        return any(part in IGNORE_PATTERNS for part in path.parts)

    def read_file_content(self, file_path: str | Path) -> Optional[str]:
        path = Path(file_path)
        try:
            if path.stat().st_size > MAX_FILE_SIZE:
                return None
            content = path.read_text(encoding="utf-8")
            if "\0" in content:
                return None
            return content
        except UnicodeDecodeError:
            try:
                return path.read_text(encoding="latin-1")
            except Exception:
                return None
        except Exception:
            return None

    def generate_diff(self, file_path: str, old_content: str, new_content: str) -> tuple[str, int, int]:
        old_lines = old_content.splitlines(keepends=True)
        new_lines = new_content.splitlines(keepends=True)
        diff_lines = list(
            difflib.unified_diff(
                old_lines,
                new_lines,
                fromfile=f"old/{Path(file_path).name}",
                tofile=f"new/{Path(file_path).name}",
                lineterm="",
            )
        )
        diff_text = "\n".join(diff_lines)
        lines_added = sum(1 for line in diff_lines if line.startswith("+") and not line.startswith("+++"))
        lines_removed = sum(1 for line in diff_lines if line.startswith("-") and not line.startswith("---"))
        return diff_text, lines_added, lines_removed

    def send_to_api(self, payload: dict) -> bool:
        try:
            response = requests.post(self.api_url, json=payload, timeout=15)
            response.raise_for_status()
            print(f"[watcher] Sent {payload['file_path']} ({payload['event_type']})")
            return True
        except requests.RequestException as exc:
            print(f"[watcher] Failed to send change: {exc}")
            return False

    def process_changes(self) -> None:
        if not self.pending_changes:
            return

        print(f"[watcher] Processing {len(self.pending_changes)} change(s)...")
        for file_path, event_type in list(self.pending_changes.items()):
            try:
                path = Path(file_path)
                rel_path = os.path.relpath(file_path, self.watch_path)
                old_content = self.file_cache.get(file_path, "")
                new_content = None
                if event_type != "deleted":
                    new_content = self.read_file_content(path)
                    if new_content is None:
                        continue

                diff_string = ""
                lines_added = 0
                lines_removed = 0
                if event_type == "deleted":
                    lines_removed = len(old_content.splitlines())
                    diff_string = f"--- {rel_path}\n+++ /dev/null\n" + "\n".join(
                        f"-{line}" for line in old_content.splitlines()
                    )
                elif event_type == "created":
                    lines_added = len((new_content or "").splitlines())
                    diff_string = f"--- /dev/null\n+++ {rel_path}\n" + "\n".join(
                        f"+{line}" for line in (new_content or "").splitlines()
                    )
                else:
                    diff_string, lines_added, lines_removed = self.generate_diff(file_path, old_content, new_content or "")

                payload = {
                    "project_id": self.project_id,
                    "timestamp": datetime.now().isoformat(),
                    "file_path": rel_path.replace("\\", "/"),
                    "event_type": event_type,
                    "diff": diff_string,
                    "old_content": old_content or None,
                    "new_content": new_content,
                    "lines_added": lines_added,
                    "lines_removed": lines_removed,
                }

                if self.send_to_api(payload):
                    if event_type == "deleted":
                        self.file_cache.pop(file_path, None)
                    elif new_content is not None:
                        self.file_cache[file_path] = new_content
            except Exception as exc:
                print(f"[watcher] Error processing {file_path}: {exc}")

        self.pending_changes.clear()

    def reset_debounce_timer(self) -> None:
        with self.timer_lock:
            if self.debounce_timer is not None and self.debounce_timer.is_alive():
                self.debounce_timer.cancel()
            self.debounce_timer = threading.Timer(DEBOUNCE_DELAY, self.process_changes)
            self.debounce_timer.start()

    def on_modified(self, event: FileSystemEvent) -> None:
        self._queue_change(event, "modified")

    def on_created(self, event: FileSystemEvent) -> None:
        self._queue_change(event, "created")

    def on_deleted(self, event: FileSystemEvent) -> None:
        self._queue_change(event, "deleted")

    def _queue_change(self, event: FileSystemEvent, event_type: str) -> None:
        if event.is_directory:
            return
        file_path = Path(event.src_path).resolve()
        if self.should_ignore(file_path):
            return
        rel_path = os.path.relpath(file_path, self.watch_path)
        print(f"[watcher] {event_type}: {rel_path}")
        self.pending_changes[str(file_path)] = event_type
        self.reset_debounce_timer()

    def run(self) -> None:
        print(f"[watcher] Watching {self.watch_path}")
        print(f"[watcher] API endpoint: {self.api_url}")
        print(f"[watcher] Project ID: {self.project_id}")
        observer = Observer()
        observer.schedule(self, str(self.watch_path), recursive=True)
        observer.start()
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()


if __name__ == "__main__":
    watch_path = os.getenv("DEVLOG_WATCH_PATH", ".")
    api_url = os.getenv("DEVLOG_API_URL", "http://127.0.0.1:8000/change")
    project_id = os.getenv("DEVLOG_PROJECT_ID", "default")
    watcher = DevLogWatcher(watch_path, api_url, project_id)
    watcher.run()
