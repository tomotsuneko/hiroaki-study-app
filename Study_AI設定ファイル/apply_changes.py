"""変更指示ファイル（JSON）の内容を data/*.py に反映し、ID付与・再生成・検証まで行う。

データファイルを直接編集できない AI ツールは、この形式で変更を出力し、人またはこのツールが反映する。
書式と運用は docs/AI_MAINTENANCE_GUIDE.md「変更指示ファイル」を参照。

usage: python tools/apply_changes.py <changes.json> [--dry-run] [--no-build]
  --dry-run   ファイルを書き換えず、変更後との差分だけを表示する
  --no-build  反映後の assign_ids・build_md・lint を実行しない

変更指示の種類（changes[] の op）
  update_row     {"map", "rid", "set": {欄: 値}}          行の title/kind/summary/basis/page/mark/exam を変更
  insert_row     {"map", "after" または "before": rid, "row": {...}}  行を挿入（rid は自動付与）
  delete_row     {"map", "rid"}                           行を削除（rid は欠番になる）
  update_unit    {"map", "uid", "set": {欄: 値}}          単元の title/cos/kaisetsu/note/aim/prereq/publishers/exam を変更
  set_var        {"map", "name", "value"}                 資料の設定値（EXAM_NOTE・METHOD_NOTE など）を差し替え
  append_to_list {"map", "name", "value"}                 LIMITATIONS・HEADER_LINES に1項目、SOURCES に1件（5要素の配列）を追加
各変更には "reason"（理由）と "evidence"（根拠：資料名とページ）を書く。ツールは記録に使うだけで検証はしない。
"""
import ast
import difflib
import importlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
from rebuild_all import OUTPUTS  # noqa: E402

R_FIELDS = ["title", "kind", "summary", "basis", "page", "mark", "exam", "rid"]
UNIT_FIELDS = ["uid", "seg", "title", "cos", "kaisetsu", "publishers", "rows", "note", "exam", "extra", "aim", "prereq"]
ROW_EDITABLE = {"title", "kind", "summary", "basis", "page", "mark", "exam"}
UNIT_EDITABLE = {"title", "cos", "kaisetsu", "note", "aim", "prereq", "publishers", "exam"}
LIST_VARS = {"LIMITATIONS", "HEADER_LINES", "SOURCES"}


def lit(v) -> str:
    if isinstance(v, str):
        return '"' + v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'
    if isinstance(v, (list, tuple)):
        inner = ", ".join(lit(x) for x in v)
        return f"({inner})" if isinstance(v, tuple) else f"[{inner}]"
    if isinstance(v, dict):
        return "{" + ", ".join(f"{lit(k)}: {lit(x)}" for k, x in v.items()) + "}"
    return repr(v)


class Source:
    def __init__(self, path: Path):
        self.path = path
        self.src = path.read_bytes()
        self.tree = ast.parse(self.src)
        self.starts = [0]
        for line in self.src.splitlines(keepends=True):
            self.starts.append(self.starts[-1] + len(line))
        self.edits: list[tuple[int, int, bytes]] = []

    def off(self, lineno: int, col: int) -> int:
        return self.starts[lineno - 1] + col

    def span(self, node) -> tuple[int, int]:
        return self.off(node.lineno, node.col_offset), self.off(node.end_lineno, node.end_col_offset)

    def calls(self, name: str):
        return [n for n in ast.walk(self.tree)
                if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == name]

    def row_call(self, rid: str) -> ast.Call:
        for c in self.calls("R"):
            for k in c.keywords:
                if k.arg == "rid" and isinstance(k.value, ast.Constant) and k.value.value == rid:
                    return c
        raise KeyError(f"行ID {rid} の R(...) が見つからない")

    def unit_call(self, uid: str) -> ast.Call:
        for c in self.calls("Unit"):
            if c.args and isinstance(c.args[0], ast.Constant) and c.args[0].value == uid:
                return c
        raise KeyError(f"単元 {uid} の Unit(...) が見つからない")

    def assign(self, name: str) -> ast.AST:
        for n in self.tree.body:
            if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in n.targets):
                return n.value
        raise KeyError(f"設定値 {name} が見つからない")

    def set_arg(self, call: ast.Call, fields: list[str], field: str, value) -> None:
        i = fields.index(field)
        node = call.args[i] if i < len(call.args) else next((k.value for k in call.keywords if k.arg == field), None)
        text = lit(value).encode("utf-8")
        if node is not None:
            a, b = self.span(node)
            self.edits.append((a, b, text))
            return
        end = self.off(call.end_lineno, call.end_col_offset) - 1
        j = end - 1
        while self.src[j:j + 1] in (b" ", b"\n", b"\r", b"\t"):
            j -= 1
        sep = b" " if self.src[j:j + 1] == b"," else b", "
        self.edits.append((end, end, sep + field.encode() + b"=" + text))

    def line_indent(self, pos: int) -> bytes:
        ls = self.src.rfind(b"\n", 0, pos) + 1
        k = ls
        while self.src[k:k + 1] in (b" ", b"\t"):
            k += 1
        return self.src[ls:k]

    def insert_row(self, call: ast.Call, before: bool, row: dict) -> None:
        args = [lit(row["title"]), lit(row["kind"]), lit(row["summary"]), lit(row.get("basis", []))]
        for f in ("page", "mark"):
            args.append(lit(row.get(f, "")))
        text = "R(" + ", ".join(args) + (f", exam={lit(row['exam'])}" if row.get("exam") else "") + ")"
        a, b = self.span(call)
        indent = self.line_indent(a)
        if before:
            ls = self.src.rfind(b"\n", 0, a) + 1
            self.edits.append((ls, ls, indent + text.encode("utf-8") + b",\n"))
            return
        k = b
        while self.src[k:k + 1] in (b" ", b"\t"):
            k += 1
        if self.src[k:k + 1] == b",":
            self.edits.append((k + 1, k + 1, b"\n" + indent + text.encode("utf-8") + b","))
        else:
            self.edits.append((b, b, b",\n" + indent + text.encode("utf-8")))

    def delete_row(self, call: ast.Call) -> None:
        a, b = self.span(call)
        ls = self.src.rfind(b"\n", 0, a) + 1
        k = b
        while self.src[k:k + 1] in (b" ", b"\t"):
            k += 1
        if self.src[k:k + 1] == b",":
            k += 1
        rest_end = self.src.find(b"\n", k)
        whole_line = self.src[ls:a].strip() == b"" and self.src[k:rest_end].strip() in (b"", b"#")
        if whole_line and rest_end != -1:
            self.edits.append((ls, rest_end + 1, b""))
        else:
            self.edits.append((a, k, b""))

    def append_to_list(self, name: str, value) -> None:
        node = self.assign(name)
        if not isinstance(node, ast.List):
            raise ValueError(f"{name} はリストではない")
        end = self.off(node.end_lineno, node.end_col_offset) - 1
        j = end - 1
        while self.src[j:j + 1] in (b" ", b"\n", b"\r", b"\t"):
            j -= 1
        sep = b"" if self.src[j:j + 1] in (b",", b"[") else b","
        item = tuple(value) if name == "SOURCES" else value
        self.edits.append((j + 1, j + 1, sep + b"\n    " + lit(item).encode("utf-8") + b","))

    def result(self) -> bytes:
        out = self.src
        spans = sorted(self.edits, key=lambda e: (e[0], e[1]), reverse=True)
        for (a, b, _), (c, d, _) in zip(spans, spans[1:]):
            if c < b and d > a and not (a == b == c == d):
                raise ValueError("同じ箇所への重複した変更がある")
        for a, b, text in spans:
            out = out[:a] + text + out[b:]
        return out


def runtime_row(mod, rid: str):
    for u in mod.UNITS:
        for r in u.rows:
            if r.rid == rid:
                return r
    raise KeyError(rid)


def plan(map_name: str, changes: list[dict]) -> tuple[Source, bool]:
    path = ROOT / "data" / f"{map_name}.py"
    s = Source(path)
    mod = importlib.import_module(f"data.{map_name}")
    inserted = False
    for ch in changes:
        op = ch["op"]
        if op == "update_row":
            call = s.row_call(ch["rid"])
            for field, value in ch["set"].items():
                if field not in ROW_EDITABLE:
                    raise ValueError(f"行の欄 {field} は変更できない")
                if field == "summary":
                    node = call.args[2] if len(call.args) > 2 else next(k.value for k in call.keywords if k.arg == "summary")
                    literal = ast.literal_eval(node) if isinstance(node, ast.Constant) else None
                    runtime = runtime_row(mod, ch["rid"]).summary
                    if literal is not None and runtime != literal and runtime.startswith(literal):
                        appended = runtime[len(literal):]
                        if not value.endswith(appended):
                            raise ValueError(f"{map_name} {ch['rid']}: この資料は末尾の「主な語句」を対応表で管理している。"
                                             "要点の本文だけを変える（末尾の語句は元のまま付ける）か、語句は対応表を直接編集する")
                        value = value[:len(value) - len(appended)]
                s.set_arg(call, R_FIELDS, field, value)
        elif op == "insert_row":
            ref = ch.get("after") or ch.get("before")
            s.insert_row(s.row_call(ref), before="before" in ch, row=ch["row"])
            inserted = True
        elif op == "delete_row":
            s.delete_row(s.row_call(ch["rid"]))
        elif op == "update_unit":
            call = s.unit_call(ch["uid"])
            for field, value in ch["set"].items():
                if field not in UNIT_EDITABLE:
                    raise ValueError(f"単元の欄 {field} は変更できない")
                s.set_arg(call, UNIT_FIELDS, field, value)
        elif op == "set_var":
            a, b = s.span(s.assign(ch["name"]))
            s.edits.append((a, b, lit(ch["value"]).encode("utf-8")))
        elif op == "append_to_list":
            if ch["name"] not in LIST_VARS:
                raise ValueError(f"{ch['name']} への追加はできない（{sorted(LIST_VARS)}）")
            s.append_to_list(ch["name"], ch["value"])
        else:
            raise ValueError(f"未知の op: {op}")
    return s, inserted


def run(args: list[str]) -> str:
    p = subprocess.run([sys.executable, *args], capture_output=True, text=True, encoding="utf-8", cwd=ROOT)
    return (p.stdout + p.stderr).strip()


def main() -> None:
    args = sys.argv[1:]
    dry, no_build = "--dry-run" in args, "--no-build" in args
    files = [a for a in args if not a.startswith("--")]
    if len(files) != 1:
        raise SystemExit(__doc__)
    spec = json.loads(Path(files[0]).read_text(encoding="utf-8"))
    by_map: dict[str, list[dict]] = {}
    for ch in spec["changes"]:
        if ch["map"] not in OUTPUTS:
            raise SystemExit(f"未登録の資料: {ch['map']}")
        by_map.setdefault(ch["map"], []).append(ch)
    results = {}
    for m, chs in by_map.items():
        s, inserted = plan(m, chs)
        new = s.result()
        ast.parse(new)
        results[m] = (s, new, inserted)
        if dry:
            diff = difflib.unified_diff(s.src.decode("utf-8").splitlines(), new.decode("utf-8").splitlines(),
                                        f"data/{m}.py", f"data/{m}.py（変更後）", lineterm="", n=0)
            print("\n".join(diff))
    if dry:
        print(f"（試行）{sum(len(v) for v in by_map.values())} 件の変更、{len(by_map)} 資料。ファイルは変更していない。")
        return
    for m, (s, new, _) in results.items():
        s.path.write_bytes(new)
    print(f"反映：{sum(len(v) for v in by_map.values())} 件の変更、{len(by_map)} 資料")
    if no_build:
        return
    for m, (_, _, inserted) in results.items():
        if inserted:
            print(run(["tools/assign_ids.py", f"data.{m}"]).splitlines()[-1])
        out = run(["tools/build_md.py", f"data.{m}", f"output/{OUTPUTS[m]}.md"])
        ng = [l for l in out.splitlines() if l.startswith("NG") or "Error" in l or "Traceback" in l]
        print(f"{m}: " + ("検証すべて OK" if not ng else "要確認\n  " + "\n  ".join(ng)))
    print(run(["tools/lint.py"]).splitlines()[-1])
    print("全資料の目次と JSON 版の更新は python tools/rebuild_all.py で行う。")


if __name__ == "__main__":
    main()
