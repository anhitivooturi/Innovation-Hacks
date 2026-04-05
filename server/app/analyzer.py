from __future__ import annotations

import ast
import os
import re
from pathlib import Path

from .config import settings
from .models import CodeReference

SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html"}
ARCHITECTURE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx"}
IGNORE_DIRS = {
    ".git",
    ".tmp_extension_branch",
    ".venv",
    ".venv313",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    "devlog",
    "Innovation-Hacks-local",
}


class RepoAnalyzer:
    def __init__(self, root_dir: Path | None = None) -> None:
        self.root_dir = (root_dir or settings.root_dir).resolve()

    def explain_file(
        self,
        file_path: str,
        selection_start: int | None = None,
        selection_end: int | None = None,
    ) -> dict[str, object]:
        path = self._resolve_file(file_path)
        content = path.read_text(encoding="utf-8")
        rel_path = self._relative(path)
        language = self._language_for(path)
        analysis = self._analyze_file(path, content)

        lines = content.splitlines()
        if selection_start is not None and selection_end is not None:
            selected_lines = lines[max(selection_start - 1, 0) : max(selection_end, 0)]
            code_context = "\n".join(selected_lines)
            scope_label = f"lines {selection_start}-{selection_end}"
        else:
            code_context = "\n".join(lines[:80])
            scope_label = "the current file"

        bullets = [
            f"Language: {language}",
            f"Imports {len(analysis['imports'])} local or framework modules.",
            f"Defines {len(analysis['functions'])} functions and {len(analysis['classes'])} classes.",
        ]

        if analysis["routes"]:
            bullets.append(f"Exposes {len(analysis['routes'])} route or request handlers.")

        if analysis["exports"]:
            bullets.append(f"Key exports: {', '.join(analysis['exports'][:4])}.")

        title = f"Explain {rel_path}"
        summary = (
            f"{rel_path} handles {self._purpose_label(rel_path, analysis)}. "
            f"The explanation is grounded in {scope_label} and the file's imports, symbols, and routes."
        )

        mermaid = self._file_dependency_mermaid(rel_path, analysis["imports"])
        references = [
            CodeReference(filePath=ref_path, line=line, snippet=snippet)
            for ref_path, line, snippet in analysis["references"][:8]
        ]

        return {
            "title": title,
            "summary": summary,
            "bullets": bullets + self._role_specific_bullets(rel_path, analysis),
            "codeContext": code_context,
            "mermaid": mermaid,
            "references": references,
        }

    def generate_diagram(self, kind: str, file_path: str | None = None) -> dict[str, object]:
        if kind == "dependency":
            target = file_path or self._guess_entrypoint()
            path = self._resolve_file(target)
            rel_path = self._relative(path)
            content = path.read_text(encoding="utf-8")
            analysis = self._analyze_file(path, content)
            return {
                "title": f"Dependency graph for {rel_path}",
                "kind": kind,
                "mermaid": self._file_dependency_mermaid(rel_path, analysis["imports"]),
                "explanation": (
                    f"This graph shows the direct dependencies DevLog detected for {rel_path}. "
                    f"Use it to trace what this file relies on before changing it."
                ),
                "references": [
                    CodeReference(filePath=ref_path, line=line, snippet=snippet)
                    for ref_path, line, snippet in analysis["references"][:8]
                ],
            }

        if kind == "class":
            target = file_path or self._guess_entrypoint()
            path = self._resolve_file(target)
            content = path.read_text(encoding="utf-8")
            analysis = self._analyze_file(path, content)
            rel_path = self._relative(path)
            return {
                "title": f"Class map for {rel_path}",
                "kind": kind,
                "mermaid": self._class_mermaid(rel_path, analysis["classes"]),
                "explanation": (
                    f"This class diagram highlights the concrete class shapes inside {rel_path}. "
                    f"If the file is function-heavy, the diagram will stay intentionally small."
                ),
                "references": [
                    CodeReference(filePath=rel_path, line=line, snippet=snippet)
                    for _, line, snippet in analysis["classes"][:8]
                ],
            }

        if kind in {"flow", "sequence"}:
            target = file_path or self._guess_server_file()
            path = self._resolve_file(target)
            content = path.read_text(encoding="utf-8")
            analysis = self._analyze_file(path, content)
            rel_path = self._relative(path)
            mermaid = (
                self._sequence_mermaid(rel_path, analysis["routes"], analysis["functions"])
                if kind == "sequence"
                else self._flow_mermaid(rel_path, analysis["routes"], analysis["imports"])
            )
            explanation = (
                f"This {kind} diagram is inferred from routes, handlers, and imports inside {rel_path}. "
                f"It is intended to make the current request path or control flow legible in the IDE."
            )
            refs = [
                CodeReference(filePath=rel_path, line=line, snippet=snippet)
                for _, line, snippet in analysis["routes"][:8]
            ]
            return {
                "title": f"{kind.title()} diagram for {rel_path}",
                "kind": kind,
                "mermaid": mermaid,
                "explanation": explanation,
                "references": refs,
            }

        raise ValueError(f"Unsupported diagram kind: {kind}")

    def architecture_map(self) -> dict[str, object]:
        files = self._list_source_files(ARCHITECTURE_SUFFIXES)
        buckets: dict[str, set[str]] = {}
        edges: set[tuple[str, str]] = set()
        entrypoints: list[str] = []
        hotspots: list[str] = []

        for path in files[:80]:
            rel_path = self._relative(path)
            top_level = rel_path.split("/", 1)[0]
            buckets.setdefault(top_level, set()).add(rel_path)
            content = path.read_text(encoding="utf-8", errors="ignore")
            analysis = self._analyze_file(path, content)

            if any(token in rel_path.lower() for token in ("main.", "app.", "index.", "server.", "extension.")):
                entrypoints.append(rel_path)

            complexity = len(analysis["functions"]) + len(analysis["classes"]) + len(analysis["routes"])
            if complexity >= 4:
                hotspots.append(rel_path)

            for dep in analysis["imports"]:
                dep_root = dep.split("/", 1)[0]
                if dep_root != top_level:
                    edges.add((top_level, dep_root))

        nodes = sorted(buckets.keys())
        mermaid_lines = ["graph TD"]
        for node in nodes:
            mermaid_lines.append(f"    {self._node_id(node)}[{node}]")
        for source, target in sorted(edges):
            mermaid_lines.append(f"    {self._node_id(source)} --> {self._node_id(target)}")
        if len(mermaid_lines) == 1:
            mermaid_lines.append("    app[project]")

        summary = (
            f"The workspace is organized around {', '.join(nodes[:6]) or 'a single root'} directories. "
            f"Entrypoints and hotspots are inferred from route handlers, app bootstraps, and symbol density."
        )

        return {
            "title": "Workspace architecture map",
            "summary": summary,
            "mermaid": "\n".join(mermaid_lines),
            "entrypoints": entrypoints[:10],
            "hotspots": hotspots[:10],
        }

    def search_code(self, query: str, limit: int = 8) -> list[CodeReference]:
        if not query.strip():
            return []

        query_lower = query.lower()
        matches: list[CodeReference] = []
        for path in self._list_source_files():
            content = path.read_text(encoding="utf-8", errors="ignore")
            for line_number, line in enumerate(content.splitlines(), start=1):
                if query_lower in line.lower():
                    matches.append(
                        CodeReference(
                            filePath=self._relative(path),
                            line=line_number,
                            snippet=line.strip(),
                        )
                    )
                    break
            if len(matches) >= limit:
                break
        return matches

    def _list_source_files(self, suffixes: set[str] | None = None) -> list[Path]:
        files: list[Path] = []
        allowed = suffixes or SOURCE_SUFFIXES
        for path in self.root_dir.rglob("*"):
            if not path.is_file():
                continue
            rel_parts = set(path.relative_to(self.root_dir).parts)
            if rel_parts & IGNORE_DIRS:
                continue
            if path.suffix.lower() in allowed:
                files.append(path)
        return files

    def _resolve_file(self, file_path: str) -> Path:
        path = (self.root_dir / file_path).resolve()
        if not path.exists():
            raise FileNotFoundError(file_path)
        if not path.is_file():
            raise FileNotFoundError(file_path)
        return path

    def _relative(self, path: Path) -> str:
        return path.resolve().relative_to(self.root_dir).as_posix()

    def _language_for(self, path: Path) -> str:
        suffix = path.suffix.lower()
        return {
            ".py": "Python",
            ".ts": "TypeScript",
            ".tsx": "TypeScript React",
            ".js": "JavaScript",
            ".jsx": "JavaScript React",
            ".json": "JSON",
            ".md": "Markdown",
            ".css": "CSS",
            ".html": "HTML",
        }.get(suffix, "Text")

    def _analyze_file(self, path: Path, content: str) -> dict[str, list[tuple[str, int, str]] | list[str]]:
        suffix = path.suffix.lower()
        if suffix == ".py":
            return self._analyze_python(path, content)
        if suffix in {".ts", ".tsx", ".js", ".jsx"}:
            return self._analyze_script(path, content)
        return {
            "imports": [],
            "functions": [],
            "classes": [],
            "routes": [],
            "exports": [],
            "references": [],
        }

    def _analyze_python(self, path: Path, content: str) -> dict[str, list[tuple[str, int, str]] | list[str]]:
        imports: list[str] = []
        functions: list[tuple[str, int, str]] = []
        classes: list[tuple[str, int, str]] = []
        routes: list[tuple[str, int, str]] = []
        exports: list[str] = []
        references: list[tuple[str, int | None, str | None]] = []

        try:
            tree = ast.parse(content)
        except SyntaxError:
            return {
                "imports": [],
                "functions": [],
                "classes": [],
                "routes": [],
                "exports": [],
                "references": [],
            }

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name.replace(".", "/"))
            elif isinstance(node, ast.ImportFrom):
                imports.extend(self._resolve_python_from_import(path, node))
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                functions.append((node.name, getattr(node, "lineno", 1), f"def {node.name}(...)"))
                exports.append(node.name)
                for decorator in node.decorator_list:
                    decorator_text = ast.unparse(decorator) if hasattr(ast, "unparse") else ""
                    if any(token in decorator_text for token in (".get", ".post", ".put", ".delete", ".patch")):
                        routes.append((node.name, getattr(node, "lineno", 1), decorator_text))
            elif isinstance(node, ast.ClassDef):
                classes.append((node.name, getattr(node, "lineno", 1), f"class {node.name}"))
                exports.append(node.name)

        normalized_imports = self._normalize_local_imports(path, imports)
        for module in normalized_imports:
            references.append((module, None, None))

        return {
            "imports": normalized_imports,
            "functions": functions,
            "classes": classes,
            "routes": routes,
            "exports": exports,
            "references": references,
        }

    def _analyze_script(self, path: Path, content: str) -> dict[str, list[tuple[str, int, str]] | list[str]]:
        imports = []
        functions = []
        classes = []
        routes = []
        exports = []
        references: list[tuple[str, int | None, str | None]] = []

        for line_number, line in enumerate(content.splitlines(), start=1):
            import_match = re.search(r"from ['\"](.+?)['\"]|import .*? from ['\"](.+?)['\"]", line)
            if import_match:
                raw_target = import_match.group(1) or import_match.group(2)
                imports.append(raw_target)
                references.append((raw_target, line_number, line.strip()))

            export_match = re.search(r"export (?:default )?(?:function|const|class)?\s*([A-Za-z0-9_]+)", line)
            if export_match:
                exports.append(export_match.group(1))

            function_match = re.search(r"(?:function|const)\s+([A-Za-z0-9_]+)\s*(?:=|\()", line)
            if function_match:
                functions.append((function_match.group(1), line_number, line.strip()))

            class_match = re.search(r"class\s+([A-Za-z0-9_]+)", line)
            if class_match:
                classes.append((class_match.group(1), line_number, line.strip()))

            route_match = re.search(r"(app|router)\.(get|post|put|delete|patch)\(['\"](.+?)['\"]", line)
            if route_match:
                routes.append((route_match.group(3), line_number, line.strip()))

        return {
            "imports": self._normalize_local_imports(path, imports),
            "functions": functions,
            "classes": classes,
            "routes": routes,
            "exports": exports,
            "references": references,
        }

    def _normalize_local_imports(self, source_path: Path, imports: list[str]) -> list[str]:
        normalized: list[str] = []
        source_dir = source_path.parent
        for raw_import in imports:
            if raw_import.startswith("."):
                resolved = self._resolve_relative_module(source_dir, raw_import)
                if resolved is not None:
                    normalized.append(resolved)
                    continue

            if raw_import.startswith(("server/", "web/", "agent/")):
                normalized.append(raw_import)
        return normalized[:12]

    def _resolve_python_from_import(self, source_path: Path, node: ast.ImportFrom) -> list[str]:
        modules: list[str] = []

        if node.level > 0:
            base_dir = source_path.parent
            for _ in range(max(node.level - 1, 0)):
                base_dir = base_dir.parent

            if node.module:
                modules.append(self._relative_import_string(source_path.parent, base_dir / node.module.replace(".", "/")))
            else:
                for alias in node.names:
                    modules.append(self._relative_import_string(source_path.parent, base_dir / alias.name.replace(".", "/")))
            return modules

        if node.module:
            modules.append(node.module.replace(".", "/"))
        return modules

    def _resolve_relative_module(self, source_dir: Path, raw_import: str) -> str | None:
        target = (source_dir / raw_import).resolve()
        candidates = [
            target,
            target.with_suffix(".ts"),
            target.with_suffix(".tsx"),
            target.with_suffix(".py"),
            target / "index.ts",
            target / "index.tsx",
            target / "__init__.py",
        ]
        for candidate in candidates:
            if candidate.exists() and candidate.is_file():
                return self._relative(candidate)
        return None

    def _relative_import_string(self, source_dir: Path, target_path: Path) -> str:
        relative = os.path.relpath(target_path, source_dir).replace("\\", "/")
        if not relative.startswith("."):
            relative = f"./{relative}"
        return relative

    def _purpose_label(self, rel_path: str, analysis: dict[str, object]) -> str:
        if analysis["routes"]:
            return "route handling and request orchestration"
        if rel_path.startswith("web/"):
            return "frontend UI state and rendering"
        if rel_path.startswith("server/"):
            return "backend API behavior"
        if rel_path.startswith("agent/"):
            return "workspace watching and local automation"
        return "shared project logic"

    def _role_specific_bullets(self, rel_path: str, analysis: dict[str, object]) -> list[str]:
        bullets: list[str] = []
        if analysis["routes"]:
            route_names = ", ".join(item[0] for item in analysis["routes"][:4])
            bullets.append(f"Detected route handlers: {route_names}.")
        if rel_path.startswith("web/") and analysis["functions"]:
            bullets.append("This file is a good candidate for a flowchart or dependency map inside the IDE.")
        if rel_path.startswith("server/") and analysis["imports"]:
            bullets.append("Server-side imports can be used to trace request flow into services or helpers.")
        return bullets

    def _file_dependency_mermaid(self, rel_path: str, imports: list[str]) -> str:
        node_id = self._node_id(rel_path)
        lines = ["graph TD", f"    {node_id}[{rel_path}]"]
        if not imports:
            lines.append(f"    {node_id} --> noDeps[No direct local dependencies]")
        for dep in imports[:10]:
            dep_id = self._node_id(dep)
            lines.append(f"    {dep_id}[{dep}]")
            lines.append(f"    {node_id} --> {dep_id}")
        return "\n".join(lines)

    def _class_mermaid(self, rel_path: str, classes: list[tuple[str, int, str]]) -> str:
        lines = ["classDiagram"]
        if not classes:
            class_name = self._safe_label(Path(rel_path).stem.title() or "File")
            lines.append(f"    class {class_name}")
            lines.append(f"    {class_name} : no explicit classes")
            return "\n".join(lines)

        for class_name, _, snippet in classes[:8]:
            safe_name = self._safe_label(class_name)
            lines.append(f"    class {safe_name}")
            lines.append(f"    {safe_name} : {snippet}")
        return "\n".join(lines)

    def _flow_mermaid(
        self,
        rel_path: str,
        routes: list[tuple[str, int, str]],
        imports: list[str],
    ) -> str:
        file_id = self._node_id(rel_path)
        lines = ["flowchart TD", f"    start([Developer action]) --> {file_id}[{rel_path}]"]
        if routes:
            for route_name, _, _ in routes[:6]:
                route_id = self._node_id(f"route_{route_name}")
                lines.append(f"    {file_id} --> {route_id}[{route_name}]")
        else:
            lines.append(f"    {file_id} --> process[Core logic]")

        for dep in imports[:6]:
            dep_id = self._node_id(dep)
            lines.append(f"    {file_id} --> {dep_id}[{dep}]")
        return "\n".join(lines)

    def _sequence_mermaid(
        self,
        rel_path: str,
        routes: list[tuple[str, int, str]],
        functions: list[tuple[str, int, str]],
    ) -> str:
        lines = ["sequenceDiagram", "    participant User", f"    participant File as {rel_path}"]
        if routes:
            for route_name, _, _ in routes[:4]:
                lines.append(f"    User->>File: call {route_name}")
                if functions:
                    lines.append(f"    File->>File: run {functions[0][0]}")
                lines.append("    File-->>User: response")
        else:
            lines.append("    User->>File: invoke module logic")
            if functions:
                lines.append(f"    File->>File: run {functions[0][0]}")
            lines.append("    File-->>User: result")
        return "\n".join(lines)

    def _guess_entrypoint(self) -> str:
        candidates = [
            "server/app/main.py",
            "web/src/App.tsx",
            "agent/main.py",
        ]
        for candidate in candidates:
            path = self.root_dir / candidate
            if path.exists():
                return candidate
        files = self._list_source_files()
        return self._relative(files[0]) if files else "README.md"

    def _guess_server_file(self) -> str:
        candidate = self.root_dir / "server" / "app" / "main.py"
        if candidate.exists():
            return self._relative(candidate)
        return self._guess_entrypoint()

    def _node_id(self, value: str) -> str:
        return re.sub(r"[^A-Za-z0-9_]", "_", value)

    def _safe_label(self, value: str) -> str:
        return re.sub(r"[^A-Za-z0-9_]", "_", value) or "Node"
