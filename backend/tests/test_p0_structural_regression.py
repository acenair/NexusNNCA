"""P0 structural regression tests: API shape + extraction integrity checks."""

import ast
import json
import os
import sys
from pathlib import Path

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")

BACKEND_DIR = Path(__file__).resolve().parents[1]
BASELINE_DIR = BACKEND_DIR.parent / "test_reports" / "p0_baseline"


def _iter_py_files(root: Path):
    for path in sorted(root.rglob("*.py")):
        if "__pycache__" not in str(path):
            yield path


def _norm_node(node: ast.AST) -> ast.AST:
    """Normalize AST for structural comparison.

    Allowed normalization only:
    - remove decorators from defs (router decorators moved to route files)
    """
    clone = ast.fix_missing_locations(ast.parse(ast.unparse(node))).body[0]
    if isinstance(clone, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        clone.decorator_list = []
    return clone


def _collect_defs(tree: ast.Module):
    defs = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            key = (type(node).__name__, node.name)
            defs[key] = ast.dump(_norm_node(node), include_attributes=False)
    return defs


def _collect_constants(tree: ast.Module):
    constants = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                name = node.targets[0].id
                if name.isupper():
                    constants[name] = ast.dump(node.value, include_attributes=False)
    return constants


@pytest.fixture(scope="module")
def live_openapi():
    if not BASE_URL:
        # Fallback to local app object when external URL is unavailable in test env.
        sys.path.insert(0, str(BACKEND_DIR))
        import server  # type: ignore

        return server.app.openapi()

    # Try external route first.
    res = requests.get(f"{BASE_URL}/api/openapi.json", timeout=60)
    if res.status_code == 200:
        return res.json()

    # Fallback to local app object if ingress does not expose openapi endpoint.
    sys.path.insert(0, str(BACKEND_DIR))
    import server  # type: ignore

    return server.app.openapi()


def test_openapi_exact_equality_and_counts(live_openapi):
    """OpenAPI must be exactly equal to baseline (P0 no-contract-change guarantee)."""
    baseline = json.loads((BASELINE_DIR / "openapi.json").read_text())
    assert len(live_openapi.get("paths", {})) == 109
    op_count = sum(len(methods) for methods in live_openapi["paths"].values())
    assert op_count == 135
    assert live_openapi == baseline


def test_routes_baseline_equality_and_uniqueness(live_openapi):
    """Route path-method set must remain identical; no collisions/duplicates."""
    baseline_routes = json.loads((BASELINE_DIR / "routes.json").read_text())
    baseline_set = {(r["path"], tuple(sorted(r["methods"])), r["name"]) for r in baseline_routes}

    live_set = set()
    for path, methods in live_openapi.get("paths", {}).items():
        for method, details in methods.items():
            live_set.add((path, (method.upper(),), details.get("operationId", "")))

    # Compare by path+method only (operationId/name can differ in formatting)
    baseline_path_methods = {(p, m[0]) for p, m, _ in baseline_set}
    live_path_methods = {(p, m[0]) for p, m, _ in live_set}
    assert live_path_methods == baseline_path_methods
    assert len(live_path_methods) == len(live_set)

    # OpenAPI collapses duplicate routes, so also inspect the runtime registry.
    sys.path.insert(0, str(BACKEND_DIR))
    from fastapi.routing import APIRoute
    from server import app

    runtime = [
        (route.path, method, route.name)
        for route in app.routes if isinstance(route, APIRoute)
        for method in route.methods
    ]
    assert len(runtime) == len(set((path, method) for path, method, _ in runtime))
    assert set(runtime) == {(path, methods[0], name) for path, methods, name in baseline_set}


def test_static_routes_not_shadowed(live_openapi):
    """Critical static endpoints must exist exactly, not swallowed by dynamic routes."""
    paths = set(live_openapi.get("paths", {}).keys())
    assert "/api/onboarding/document-checklist" in paths
    assert "/api/audit/template" in paths
    assert "/api/audit/clients-summary" in paths

    # Check actual Starlette resolution, not merely presence in the schema.
    # All baseline paths are covered, including static/dynamic collisions.
    import re
    from starlette.routing import Match, compile_path

    sys.path.insert(0, str(BACKEND_DIR))
    from server import app

    baseline = json.loads((BASELINE_DIR / "routes.json").read_text())
    for target in baseline:
        path = re.sub(r"\{[^}]+\}", "p0-test-id", target["path"])
        for method in target["methods"]:
            expected = next(
                route["name"] for route in baseline
                if method in route["methods"] and compile_path(route["path"])[0].match(path)
            )
            scope = {"type": "http", "path": path, "root_path": "", "method": method}
            actual = next(route.name for route in app.routes if route.matches(scope)[0] == Match.FULL)
            assert actual == expected, f"Route precedence changed: {method} {path}"


def test_server_original_defs_preserved_in_extracted_modules():
    """All original top-level defs must exist with AST-equivalent bodies/signatures."""
    original_tree = ast.parse((BASELINE_DIR / "server.py.original").read_text())
    original_defs = _collect_defs(original_tree)

    current_defs = {}
    search_roots = [
        BACKEND_DIR / "server.py",
        BACKEND_DIR / "core.py",
        BACKEND_DIR / "models.py",
        BACKEND_DIR / "lifecycle.py",
        BACKEND_DIR / "routes",
        BACKEND_DIR / "services",
    ]
    for root in search_roots:
        if root.is_file():
            tree = ast.parse(root.read_text())
            current_defs.update(_collect_defs(tree))
        else:
            for file in _iter_py_files(root):
                tree = ast.parse(file.read_text())
                current_defs.update(_collect_defs(tree))

    missing = []
    changed = []
    for key, original_dump in original_defs.items():
        if key not in current_defs:
            missing.append(key)
        elif current_defs[key] != original_dump:
            changed.append(key)

    assert not missing, f"Missing defs after extraction: {missing[:10]}"
    assert not changed, f"Modified defs after extraction: {changed[:10]}"


def test_server_original_constants_preserved():
    """Upper-case constants from original server must remain value-equivalent."""
    original_tree = ast.parse((BASELINE_DIR / "server.py.original").read_text())
    original_constants = _collect_constants(original_tree)

    current_constants = {}
    for root in [BACKEND_DIR / "server.py", BACKEND_DIR / "core.py", BACKEND_DIR / "models.py", BACKEND_DIR / "lifecycle.py", BACKEND_DIR / "routes", BACKEND_DIR / "services"]:
        if root.is_file():
            tree = ast.parse(root.read_text())
            current_constants.update(_collect_constants(tree))
        else:
            for file in _iter_py_files(root):
                tree = ast.parse(file.read_text())
                current_constants.update(_collect_constants(tree))

    missing = [k for k in original_constants if k not in current_constants]
    changed = [k for k, v in original_constants.items() if k in current_constants and current_constants[k] != v]

    assert not missing, f"Missing constants after extraction: {missing[:10]}"
    assert not changed, f"Changed constants after extraction: {changed[:10]}"


def test_single_shared_core_db_and_no_server_import_cycles():
    """Modules should import shared db from core and avoid importing server module."""
    server_import_violations = []
    db_assignment_violations = []
    uses_db_without_core_import = []

    scan_roots = [BACKEND_DIR / "routes", BACKEND_DIR / "services", BACKEND_DIR / "lifecycle.py"]
    for root in scan_roots:
        files = [root] if root.is_file() else list(_iter_py_files(root))
        for file in files:
            src = file.read_text()
            tree = ast.parse(src)

            imported_core_db = False
            imports_server = False
            assigns_db = False
            uses_db_name = False

            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    if node.module == "core" and any(n.name == "db" for n in node.names):
                        imported_core_db = True
                    if node.module == "server":
                        imports_server = True
                if isinstance(node, ast.Import):
                    if any(n.name == "server" for n in node.names):
                        imports_server = True
                if isinstance(node, ast.Assign):
                    if any(isinstance(t, ast.Name) and t.id == "db" for t in node.targets):
                        assigns_db = True
                if isinstance(node, ast.Name) and node.id == "db":
                    uses_db_name = True

            if imports_server:
                server_import_violations.append(str(file))
            if assigns_db:
                db_assignment_violations.append(str(file))
            if uses_db_name and not imported_core_db:
                uses_db_without_core_import.append(str(file))

    assert not server_import_violations, f"Illegal server imports found: {server_import_violations}"
    assert not db_assignment_violations, f"db reassigned outside core: {db_assignment_violations}"
    assert not uses_db_without_core_import, f"db used without from core import db: {uses_db_without_core_import}"
