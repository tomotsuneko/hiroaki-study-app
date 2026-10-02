/* 学習コンテンツ（1コマ1ページ）共通スクリプト。
   部品：目次の自動生成、確認問題（選択・入力・記述）、例題の段階表示、ねらいのチェック保存、英文の読み上げ、数式の表示。
   マークアップの書き方は lessons/_template.html を参照。外部通信は KaTeX（数式）の読み込みだけ。 */
(function () {
  "use strict";
  const meta = (() => {
    const el = document.getElementById("lesson-meta");
    try { return el ? JSON.parse(el.textContent) : {}; } catch (e) { return {}; }
  })();
  const KEY = "lesson:" + (meta.id || location.pathname);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(KEY + ":" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(KEY + ":" + k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ } }
  };
  const norm = (s) => (s || "").normalize("NFKC").replace(/\s+/g, "").replace(/[，、]/g, ",")
    .replace(/≤|<=/g, "≦").replace(/≥|>=/g, "≧").replace(/−/g, "-").toLowerCase();

  function buildToc() {
    const nav = document.querySelector("nav.toc");
    if (!nav) return;
    const heads = [...document.querySelectorAll("main h2[id]")];
    const ol = document.createElement("ol");
    heads.forEach((h) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.dataset.toc || h.textContent.trim();
      li.appendChild(a); ol.appendChild(li);
    });
    nav.innerHTML = '<div class="toc-title">この時間の流れ</div>';
    nav.appendChild(ol);
    const links = [...ol.querySelectorAll("a")];
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((ents) => {
        ents.forEach((en) => {
          if (en.isIntersecting) {
            links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + en.target.id));
          }
        });
      }, { rootMargin: "0px 0px -70% 0px" });
      heads.forEach((h) => io.observe(h));
    }
  }

  function setupObjectives() {
    document.querySelectorAll(".objectives input[type=checkbox]").forEach((cb, i) => {
      const id = cb.dataset.obj || String(i);
      cb.checked = store.get("obj:" + id, false);
      cb.addEventListener("change", () => store.set("obj:" + id, cb.checked));
    });
  }

  function setupWorked() {
    document.querySelectorAll(".worked").forEach((w) => {
      const steps = [...w.querySelectorAll(".step")];
      if (!steps.length) return;
      const ctr = document.createElement("div");
      ctr.className = "step-controls";
      const next = document.createElement("button");
      next.className = "primary"; next.type = "button"; next.textContent = "次のステップ";
      const all = document.createElement("button");
      all.type = "button"; all.textContent = "すべて表示";
      const reset = document.createElement("button");
      reset.type = "button"; reset.textContent = "最初から";
      let n = 0;
      const update = () => {
        steps.forEach((s, i) => s.classList.toggle("shown", i < n));
        next.disabled = n >= steps.length; all.disabled = n >= steps.length;
        next.textContent = n === 0 ? "解き方を見る" : (n >= steps.length ? "完了" : "次のステップ");
        if (window.renderMathInElement) renderMath(w);
      };
      next.onclick = () => { n = Math.min(n + 1, steps.length); update(); };
      all.onclick = () => { n = steps.length; update(); };
      reset.onclick = () => { n = 0; update(); };
      ctr.append(next, all, reset);
      w.appendChild(ctr);
      update();
    });
  }

  const results = {};
  function scoreUpdate() {
    const el = document.getElementById("quiz-score");
    if (!el) return;
    const quizHead = document.getElementById("quiz");
    const scope = (quizHead && quizHead.closest("section")) || document;
    const graded = [...scope.querySelectorAll(".q[data-type=choice], .q[data-type=input]")];
    const done = graded.filter((q) => results[q.id] !== undefined);
    const ok = done.filter((q) => results[q.id]).length;
    el.textContent = `確認問題：${done.length}/${graded.length} 問に解答（正解 ${ok}）`;
  }
  function reveal(q) {
    q.querySelectorAll(".explain, .model").forEach((e) => e.classList.add("shown"));
    if (window.renderMathInElement) renderMath(q);
  }
  function setupQuiz() {
    document.querySelectorAll(".q").forEach((q, i) => {
      if (!q.id) q.id = "q" + (i + 1);
      const type = q.dataset.type;
      if (type === "choice") {
        const btns = [...q.querySelectorAll(".choices button")];
        btns.forEach((b) => {
          b.type = "button";
          b.addEventListener("click", () => {
            if (results[q.id] !== undefined) return;
            const ok = b.dataset.correct === "true";
            results[q.id] = ok;
            b.classList.add(ok ? "correct" : "wrong");
            btns.forEach((x) => { if (x.dataset.correct === "true") x.classList.add("correct"); x.disabled = true; });
            const r = q.querySelector(".result");
            if (r) { r.textContent = ok ? "正解！" : "もう一度確かめよう"; r.className = "result " + (ok ? "ok" : "ng"); }
            reveal(q); scoreUpdate();
          });
        });
      } else if (type === "input") {
        const input = q.querySelector("input[type=text]");
        const btn = q.querySelector("button.check");
        const accept = (q.dataset.accept || "").split("|").map(norm).filter(Boolean);
        const check = () => {
          const ok = accept.includes(norm(input.value));
          results[q.id] = ok;
          const r = q.querySelector(".result");
          if (r) { r.textContent = ok ? "正解！" : "解説を読んで確かめよう"; r.className = "result " + (ok ? "ok" : "ng"); }
          reveal(q); scoreUpdate();
        };
        if (btn) { btn.type = "button"; btn.addEventListener("click", check); }
        if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
      } else if (type === "open") {
        let btn = q.querySelector("button.show-model");
        if (!btn) { btn = document.createElement("button"); btn.className = "show-model"; btn.textContent = "解答例を見る"; q.appendChild(btn); }
        btn.type = "button";
        const sc = q.querySelector(".self-check");
        btn.addEventListener("click", () => { reveal(q); if (sc) sc.classList.add("shown"); btn.disabled = true; });
        if (sc) sc.querySelectorAll("button").forEach((b) => {
          b.type = "button";
          b.addEventListener("click", () => { store.set("self:" + q.id, b.dataset.self || b.textContent); sc.querySelectorAll("button").forEach((x) => x.disabled = true); b.classList.add("primary"); });
        });
      }
    });
    scoreUpdate();
  }

  function setupSpeak() {
    const synth = window.speechSynthesis;
    document.querySelectorAll("button.speak").forEach((b) => {
      b.type = "button";
      if (!synth) { b.disabled = true; b.title = "このブラウザは読み上げに対応していません"; return; }
      b.addEventListener("click", () => {
        synth.cancel();
        const target = b.dataset.target ? document.querySelector(b.dataset.target) : null;
        const text = b.dataset.text || (target ? target.innerText : "");
        const u = new SpeechSynthesisUtterance(text);
        u.lang = b.dataset.lang || "en-US";
        const rateSel = document.getElementById("speak-rate");
        u.rate = rateSel ? parseFloat(rateSel.value) : (parseFloat(b.dataset.rate) || 0.9);
        synth.speak(u);
      });
    });
  }

  function renderMath(root) {
    window.renderMathInElement(root || document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false
    });
  }

  function init() {
    buildToc(); setupObjectives(); setupWorked(); setupQuiz(); setupSpeak();
    if (window.renderMathInElement) renderMath(document.body);
    else window.addEventListener("load", () => { if (window.renderMathInElement) renderMath(document.body); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
