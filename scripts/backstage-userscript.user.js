// ==UserScript==
// @name         OFF-AIR 백스테이지 크리에이터 데이터 → GitHub
// @namespace    offair-league
// @version      1.0
// @description  LIVE Backstage "크리에이터 데이터" 페이지를 열 때 표 전체(페이지당 100개 × 3페이지)를 자동으로 넘겨가며 긁어 GitHub(backstage-creator-data.json)에 올린다. 계산기 사이트 "우리 호스트" 탭이 이걸 자동으로 읽어 채운다 — 수동 붙여넣기 불필요.
// @match        https://live-backstage.tiktok.com/portal/data/data*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// ==/UserScript==

(function () {
  "use strict";

  /* ══════════ 설정 ══════════ */
  const REPO = "000628yea-hub/offair-league";
  const PATH = "backstage-creator-data.json";
  const TOKEN = "PASTE_GITHUB_FINE_GRAINED_TOKEN_HERE"; // ← tikdo-userscript 때 만든 토큰 그대로 붙여넣기
  /* ═══════════════════════════ */

  const MIN_GAP_MIN = 55;
  const LS = "offair_backstage_push_at";
  const now = Date.now();

  if (now - Number(localStorage.getItem(LS) || 0) < MIN_GAP_MIN * 60000) return;
  if (!TOKEN || TOKEN.indexOf("PASTE_") === 0) {
    console.warn("[OFF-AIR] 백스테이지 유저스크립트: GitHub 토큰이 아직 안 들어감");
    return;
  }

  setTimeout(run, 3000);

  function waitFor(check, timeoutMs) {
    return new Promise(function (resolve) {
      const t0 = Date.now();
      (function poll() {
        const v = check();
        if (v) return resolve(v);
        if (Date.now() - t0 > (timeoutMs || 15000)) return resolve(null);
        setTimeout(poll, 300);
      })();
    });
  }

  async function trySetPageSize100() {
    try {
      const sel = [...document.querySelectorAll(".semi-select")].find(function (e) {
        return e.textContent.indexOf("페이지당") >= 0;
      });
      if (!sel) return;
      sel.click();
      await new Promise(function (r) { setTimeout(r, 400); });
      const opt = [...document.querySelectorAll(".semi-select-option, [role='option']")].find(function (o) {
        return o.textContent.trim() === "페이지당 항목: 100";
      });
      if (opt) { opt.click(); await new Promise(function (r) { setTimeout(r, 900); }); }
    } catch (e) { console.warn("[OFF-AIR] 페이지 크기 변경 실패(무시하고 계속)", e); }
  }

  function pagerText() {
    const el = [...document.querySelectorAll("*")].find(function (e) {
      return e.children.length === 0 && /\d+\s*중\s*\d+에서\s*\d+\s*표시/.test(e.textContent || "");
    });
    return el ? el.textContent.trim() : "";
  }

  function nextButton() {
    return document.querySelector('li[aria-label="Next"]');
  }

  async function run() {
    try {
      const table = await waitFor(function () {
        const t = document.querySelector(".semi-table");
        return t && t.innerText.length > 200 ? t : null;
      });
      if (!table) return console.warn("[OFF-AIR] 표를 못 찾음 — 로그인/페이지 확인");

      await trySetPageSize100();

      const pages = [];
      let guard = 0;
      while (guard++ < 20) {
        const t = document.querySelector(".semi-table");
        if (!t) break;
        pages.push(t.innerText);
        const nb = nextButton();
        if (!nb || nb.className.indexOf("disabled") >= 0) break;
        nb.querySelector("button") ? nb.querySelector("button").click() : nb.click();
        await new Promise(function (r) { setTimeout(r, 1200); });
      }
      if (!pages.length) return console.warn("[OFF-AIR] 페이지 수집 0장");

      const text = pagerText() + "\n\n" + pages.join("\n\n===PAGE===\n\n");
      const rowCount = (text.match(/^\d{17,20}$/gm) || []).length;
      if (rowCount < 5) return console.warn("[OFF-AIR] 유효 행 수 부족(" + rowCount + ") — 스킵");

      const payload = JSON.stringify({
        savedAtMs: now,
        savedAt: new Date(now).toISOString(),
        pageCount: pages.length,
        rowCount: rowCount,
        text: text,
      });
      const content = b64(payload);

      let sha;
      const cur = await gh("GET", "/contents/" + PATH);
      if (cur.status === 200) { try { sha = JSON.parse(cur.responseText).sha; } catch (e) {} }
      else if (cur.status !== 404) return console.warn("[OFF-AIR] 파일 조회 실패", cur.status, cur.responseText.slice(0, 200));

      const put = await gh("PUT", "/contents/" + PATH, {
        message: "data: 백스테이지 크리에이터 데이터 (유저스크립트 · " + rowCount + "명 · " + pages.length + "페이지)",
        content: content,
        sha: sha,
      });
      if (put.status === 200 || put.status === 201) {
        localStorage.setItem(LS, String(now));
        toast("백스테이지 데이터 업로드 완료 · " + rowCount + "명");
        console.log("[OFF-AIR] 백스테이지 커밋 완료 · " + rowCount + "명 · " + pages.length + "페이지");
      } else {
        console.warn("[OFF-AIR] 커밋 실패", put.status, put.responseText.slice(0, 300));
        if (put.status === 401 || put.status === 403) toast("GitHub 토큰 오류 — 확인 필요", true);
      }
    } catch (e) {
      console.warn("[OFF-AIR] 오류", e);
    }
  }

  function gh(method, p, body) {
    return new Promise(function (resolve) {
      GM_xmlhttpRequest({
        method: method,
        url: "https://api.github.com/repos/" + REPO + p,
        headers: {
          Authorization: "Bearer " + TOKEN,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        data: body ? JSON.stringify(body) : undefined,
        onload: resolve,
        onerror: function () { resolve({ status: 0, responseText: "network error" }); },
      });
    });
  }

  function b64(str) {
    return btoa(
      new Uint8Array(new TextEncoder().encode(str)).reduce(
        function (a, c) { return a + String.fromCharCode(c); }, ""
      )
    );
  }

  function toast(msg, err) {
    var d = document.createElement("div");
    d.textContent = (err ? "⚠ " : "✓ ") + msg;
    d.style.cssText =
      "position:fixed;left:16px;bottom:16px;z-index:99999;" +
      "background:" + (err ? "#E5231B" : "#0A0A0A") + ";color:#fff;" +
      "font:13px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:6px;opacity:.96";
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 5000);
  }
})();
