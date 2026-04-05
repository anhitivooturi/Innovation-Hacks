from __future__ import annotations

from pathlib import Path

from server.app.analyzer import RepoAnalyzer


class ApiRepoTools:
    def __init__(self, root_dir: Path) -> None:
        self._analyzer = RepoAnalyzer(root_dir=root_dir)

    def explain_file(
        self,
        file_path: str,
        selection_start: int | None = None,
        selection_end: int | None = None,
    ) -> dict[str, object]:
        return self._analyzer.explain_file(file_path, selection_start, selection_end)

    def generate_diagram(self, kind: str, file_path: str | None = None) -> dict[str, object]:
        return self._analyzer.generate_diagram(kind, file_path)

    def architecture_map(self) -> dict[str, object]:
        return self._analyzer.architecture_map()

    def search_code(self, query: str, limit: int = 8):
        return self._analyzer.search_code(query, limit=limit)
