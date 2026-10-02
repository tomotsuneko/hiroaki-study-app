"""学習内容マップのデータ定義（中学・高校共通）。欄の意味と運用は README.md を参照。

区分（Segment）
  中学校は学年、高校は科目を1つの区分とする。区分ごとに標準授業時数（コマ数）を持つ。
行（R）＝小項目（授業1コマ）
  R(小項目, 区分, 要点, 根拠コード, 解説ページ, 印, 入試, rid=固定ID)
  根拠コードは学習指導要領の当該区分の記号。
    中学: "A(1)ア(ア)" / "取扱い(1)" / "第3の4"（課題学習）
    高校: "(1)ア(ア)" / "取扱い(1)" / "課題学習"
  他の区分の項目は "<区分キー>:<コード>" と書く（例: "2:D(2)ア(イ)", "数学A:(2)ア(ウ)"）。
  解説ページは当該教科の『学習指導要領解説』の印刷ページ。
  印 "†" は、教科書で一般的に扱うが解説に明示の記述が見当たらない語句・内容を含む行。
  入試は列名→記号の辞書で、単元の既定値を行ごとに上書きしたいときだけ指定する。
  rid は資料内で固定の行ID（例 "中1-066"）。行の並べ替え・追加・削除で他の行の ID は変えない。
    新しい行は rid を書かずに追加し、python tools/assign_ids.py data.<モジュール> で未使用の番号を振る。
単元（Unit）＝中項目
  aim は単元のねらい（学習指導要領・解説の記述に基づく1〜2文）。
  prereq は前提となる単元の参照。同じ資料の単元は "uid"、別の資料は "<モジュール名>:<uid>"
    （例 "jhs_math:3-4"）。学年・科目をまたぐ系統は解説の記述や教科書の配列を根拠にする。
  extra=True の単元は標準授業時数の合計に含めない。学習指導要領が「内容の(1)から(3)までの中から
  適宜選択させる」とする科目（数学A・B・Cなど）で、選択される内容を別枠として載せるときに使う。
"""
from dataclasses import dataclass, field


@dataclass
class R:
    title: str
    kind: str
    summary: str
    basis: list[str]
    page: str = ""
    mark: str = ""
    exam: dict[str, str] = field(default_factory=dict)
    rid: str = ""


@dataclass
class Unit:
    uid: str
    seg: object
    title: str
    cos: str
    kaisetsu: str
    publishers: dict[str, int]
    rows: list[R] = field(default_factory=list)
    note: str = ""
    exam: dict[str, str] = field(default_factory=dict)
    extra: bool = False
    aim: str = ""
    prereq: list[str] = field(default_factory=list)


@dataclass
class Segment:
    key: object
    title: str
    hours: int
    row_label: str
    no_prefix: str
    kaisetsu_pages: tuple[int, int] = (0, 0)
