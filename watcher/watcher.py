"""
DevLog AI - File Watcher
Watches a project directory for file changes and sends them to the API for processing.
"""

import os
import time
import json
import threading
import difflib
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Tuple

import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent


# Constants
DEBOUNCE_DELAY = 2.0  # seconds
MAX_FILE_SIZE = 1024 * 1024  # 1MB
IGNORE_PATTERNS = ['node_modules', '.git', '__pycache__', 'build', '.venv', 'devlog', '.DS_Store']


class DevLogWatcher(FileSystemEventHandler):
    """
    Watches a directory for file changes and sends diffs to the API.

    Features:
    - Debounces changes (waits 2 seconds after last change)
    - Caches file contents to generate diffs
    - Ignores common directories (node_modules, .git, etc.)
    - Handles errors gracefully without crashing
    """

    def __init__(self, watch_path: str, api_url: str):
        """
        Initialize the watcher.

        Args:
            watch_path: Directory to watch (relative or absolute)
            api_url: API endpoint to POST changes to
        """
        super().__init__()

        # Convert to absolute path
        self.watch_path = Path(watch_path).resolve()
        self.api_url = api_url

        # File cache: {absolute_path: content_string}
        self.file_cache: Dict[str, str] = {}

        # Pending changes: {absolute_path: event_type}
        self.pending_changes: Dict[str, str] = {}

        # Debounce timer
        self.debounce_timer: Optional[threading.Timer] = None
        self.timer_lock = threading.Lock()

        # Ignore patterns
        self.ignore_patterns = IGNORE_PATTERNS

        # Initialize cache with existing files
        self.initialize_cache()

    def initialize_cache(self):
        """Populate the file cache with all existing files in the watch directory."""
        print("📦 Initializing file cache...")

        if not self.watch_path.exists():
            print(f"⚠️  Watch path does not exist: {self.watch_path}")
            return

        file_count = 0
        for root, dirs, files in os.walk(self.watch_path):
            # Remove ignored directories from traversal
            dirs[:] = [d for d in dirs if not self.should_ignore(os.path.join(root, d))]

            for file in files:
                file_path = os.path.join(root, file)
                if not self.should_ignore(file_path):
                    content = self.read_file_content(file_path)
                    if content is not None:
                        self.file_cache[file_path] = content
                        file_count += 1

        print(f"✅ Cached {file_count} files")

    def should_ignore(self, file_path: str) -> bool:
        """
        Check if a file path should be ignored.

        Args:
            file_path: Path to check

        Returns:
            True if the file should be ignored
        """
        path_str = str(file_path)

        # Check each ignore pattern
        for pattern in self.ignore_patterns:
            # Check if pattern appears as a directory component or filename
            if f"/{pattern}/" in path_str or path_str.endswith(f"/{pattern}") or f"/{pattern}" in path_str:
                return True
            if path_str.endswith(pattern):
                return True
            # Handle patterns in path components
            path_parts = Path(path_str).parts
            if pattern in path_parts:
                return True

        return False

    def read_file_content(self, file_path: str) -> Optional[str]:
        """
        Read file content as a string.

        Args:
            file_path: Path to the file

        Returns:
            File content as string, or None if read fails
        """
        try:
            # Check file size
            file_size = os.path.getsize(file_path)
            if file_size > MAX_FILE_SIZE:
                print(f"⚠️  File too large ({file_size} bytes), skipping: {file_path}")
                return None

            # Try to read as text
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Check for binary content (null bytes)
            if '\0' in content:
                print(f"⚠️  Binary file detected, skipping: {file_path}")
                return None

            return content

        except UnicodeDecodeError:
            # Try with a different encoding
            try:
                with open(file_path, 'r', encoding='latin-1') as f:
                    return f.read()
            except Exception as e:
                print(f"⚠️  Encoding error reading {file_path}: {e}")
                return None

        except FileNotFoundError:
            # File was deleted before we could read it
            return None

        except PermissionError:
            print(f"⚠️  Permission denied: {file_path}")
            return None

        except Exception as e:
            print(f"⚠️  Error reading {file_path}: {e}")
            return None

    def generate_diff(self, file_path: str, old_content: str, new_content: str) -> Tuple[str, int, int]:
        """
        Generate a unified diff between old and new content.

        Args:
            file_path: Path to the file (for diff header)
            old_content: Original content
            new_content: New content

        Returns:
            Tuple of (diff_string, lines_added, lines_removed)
        """
        old_lines = old_content.splitlines(keepends=True)
        new_lines = new_content.splitlines(keepends=True)

        # Generate unified diff
        diff = difflib.unified_diff(
            old_lines,
            new_lines,
            fromfile=f"old/{Path(file_path).name}",
            tofile=f"new/{Path(file_path).name}",
            lineterm=''
        )

        diff_lines = list(diff)
        diff_string = '\n'.join(diff_lines)

        # Count additions and deletions
        lines_added = sum(1 for line in diff_lines if line.startswith('+') and not line.startswith('+++'))
        lines_removed = sum(1 for line in diff_lines if line.startswith('-') and not line.startswith('---'))

        return diff_string, lines_added, lines_removed

    def send_to_api(self, payload: dict) -> bool:
        """
        Send a change payload to the API.

        Args:
            payload: JSON payload to send

        Returns:
            True if successful, False otherwise
        """
        try:
            print(f"📤 Sending to API: {self.api_url}")

            response = requests.post(
                self.api_url,
                json=payload,
                timeout=15  # Increased timeout for Cloud Run
            )
            response.raise_for_status()

            # Log successful response
            result = response.json()
            print(f"✅ API Response: {result.get('message', 'success')}")

            return True

        except requests.exceptions.ConnectionError:
            print(f"❌ API connection error - is the server running at {self.api_url}?")
            return False

        except requests.exceptions.Timeout:
            print(f"❌ API timeout - request took too long (>15s)")
            return False

        except requests.exceptions.HTTPError as e:
            print(f"❌ API HTTP error: {e}")
            print(f"   Response: {e.response.text if e.response else 'N/A'}")
            return False

        except Exception as e:
            print(f"❌ Unexpected error sending to API: {e}")
            return False

    def process_changes(self):
        """Process all pending changes after debounce period."""
        if not self.pending_changes:
            return

        print(f"\n🔄 Processing {len(self.pending_changes)} change(s)...")

        # Process each pending change
        for file_path, event_type in list(self.pending_changes.items()):
            try:
                # Get relative path for display and API
                rel_path = os.path.relpath(file_path, Path.cwd())

                # Get old content from cache
                old_content = self.file_cache.get(file_path, "")

                # Get new content (if file still exists)
                new_content = None
                if event_type != "deleted":
                    new_content = self.read_file_content(file_path)
                    if new_content is None:
                        print(f"⚠️  Cannot read file, skipping: {rel_path}")
                        continue

                # Generate diff
                diff_string = ""
                lines_added = 0
                lines_removed = 0

                if event_type == "deleted":
                    # For deleted files, show entire content as removed
                    lines_removed = len(old_content.splitlines())
                    diff_string = f"--- {rel_path}\n+++ /dev/null\n" + "\n".join(f"-{line}" for line in old_content.splitlines())
                elif event_type == "created":
                    # For new files, show entire content as added
                    lines_added = len(new_content.splitlines())
                    diff_string = f"--- /dev/null\n+++ {rel_path}\n" + "\n".join(f"+{line}" for line in new_content.splitlines())
                else:
                    # For modified files, generate proper diff
                    diff_string, lines_added, lines_removed = self.generate_diff(
                        file_path, old_content, new_content
                    )

                # Build payload
                payload = {
                    "timestamp": datetime.now().isoformat(),
                    "file_path": rel_path,
                    "event_type": event_type,
                    "diff": diff_string,
                    "old_content": old_content if old_content else None,
                    "new_content": new_content,
                    "lines_added": lines_added,
                    "lines_removed": lines_removed
                }

                # Send to API
                if self.send_to_api(payload):
                    print(f"✅ Sent to API: {rel_path} ({event_type})")

                # Update cache
                if event_type == "deleted":
                    self.file_cache.pop(file_path, None)
                elif new_content is not None:
                    self.file_cache[file_path] = new_content

            except Exception as e:
                print(f"⚠️  Error processing {file_path}: {e}")

        # Clear pending changes
        self.pending_changes.clear()

    def reset_debounce_timer(self):
        """Reset the debounce timer (cancel existing and start new)."""
        with self.timer_lock:
            # Cancel existing timer
            if self.debounce_timer is not None and self.debounce_timer.is_alive():
                self.debounce_timer.cancel()

            # Start new timer
            self.debounce_timer = threading.Timer(DEBOUNCE_DELAY, self.process_changes)
            self.debounce_timer.start()

    def on_modified(self, event: FileSystemEvent):
        """Handle file modification events."""
        if event.is_directory:
            return

        file_path = event.src_path

        # Ignore filtered files
        if self.should_ignore(file_path):
            return

        # Add to pending changes
        rel_path = os.path.relpath(file_path, Path.cwd())
        print(f"📝 File changed: {rel_path}")

        self.pending_changes[file_path] = "modified"
        self.reset_debounce_timer()

    def on_created(self, event: FileSystemEvent):
        """Handle file creation events."""
        if event.is_directory:
            return

        file_path = event.src_path

        # Ignore filtered files
        if self.should_ignore(file_path):
            return

        # Add to pending changes
        rel_path = os.path.relpath(file_path, Path.cwd())
        print(f"📝 File created: {rel_path}")

        self.pending_changes[file_path] = "created"
        self.reset_debounce_timer()

    def on_deleted(self, event: FileSystemEvent):
        """Handle file deletion events."""
        if event.is_directory:
            return

        file_path = event.src_path

        # Ignore filtered files
        if self.should_ignore(file_path):
            return

        # Add to pending changes
        rel_path = os.path.relpath(file_path, Path.cwd())
        print(f"📝 File deleted: {rel_path}")

        self.pending_changes[file_path] = "deleted"
        self.reset_debounce_timer()

    def run(self):
        """Start watching the directory."""
        print("\n🚀 DevLog Watcher Starting...")
        print(f"📁 Watching: {self.watch_path}")
        print(f"🌐 API Endpoint: {self.api_url}")
        print(f"⏰ Debounce: {DEBOUNCE_DELAY} seconds")
        print(f"🚫 Ignoring: {', '.join(self.ignore_patterns)}")
        print("✅ Watcher active! Press Ctrl+C to stop.\n")

        observer = Observer()
        observer.schedule(self, str(self.watch_path), recursive=True)
        observer.start()

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n\n🛑 Stopping watcher...")
            observer.stop()

        observer.join()
        print("👋 Watcher stopped.")


if __name__ == "__main__":
    # Configuration
    watch_path = os.getenv("DEVLOG_WATCH_PATH", ".")  # Current directory by default
    api_url = os.getenv(
        "DEVLOG_API_URL",
        "https://devlog-backend-980285509584.us-central1.run.app/change"  # Cloud Run endpoint
    )

    print(f"📍 Using API URL: {api_url}")
    print(f"📁 Watching path: {watch_path}")

    # Create and run watcher
    watcher = DevLogWatcher(watch_path, api_url)
    watcher.run()
