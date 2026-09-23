// ==UserScript==
// @name         OFF-AIR 틱두 컷 → GitHub
// @namespace    offair-league
// @version      1.0
// @description  tikdo.kr 를 열 때 리그 실시간 조각컷을 GitHub(tikdo-cuts.json)에 올려, 계산기 사이트가 틱두 정확 컷을 쓰게 한다. Vercel 봇차단 때문에 서버(GitHub Actions)에서는 못 긁어서, 내 브라우저·집 IP로 대신 올리는 방식.
// @match        https://tikdo.kr/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// ==/UserScript==

(function () {
  "use strict";

  /* ══════════ 설정 (여기 3줄만 확인) ══════════ */
  const REPO = "000628yea-hub/offair-league";
  const PATH = "tikdo-cuts.json";
  const TOKEN = "PASTE_GITHUB_FINE_GRAINED_TOKEN_HERE"; // ← GitHub 토큰 붙여넣기
  /* ═══════════════════════════════════════════ */

  const MIN_GAP_MIN = 4; // 최근 이 시간(분) 안에 이미 올렸으면 스킵 — 저녁엔 5분 간격으로 방문하므로 낮춤
  const LS = "offair_tikdo_push_at";

  const now = Date.now();
  if (now - Number(localStorage.getItem(LS) || 0) < MIN_GAP_MIN * 60000) return;
  if (!TOKEN || TOKEN.indexOf("PASTE_") === 0) {
    console.warn("[OFF-AIR] 유저스크립트: GitHub 토큰이 아직 안 들어감");
    return;
  }

  setTimeout(run, 4000);

  async function run() {
    try {
      const res = await fetch("/api/league/cutoffs/compare", { credentials: "include" });
      if (!res.ok) return console.warn("[OFF-AIR] 틱두 API", res.status, "— 로그인 확인");
      const compare = await res.json();

      const leagues = new Set();
      for (const ct of Object.keys(compare || {}))
        for (const r of (compare[ct] && compare[ct].today) || []) leagues.add(r.league_tier_id);
      if (leagues.size < 10)
        return console.warn("[OFF-AIR] 리그 수 부족(" + leagues.size + ") — 데이터 이상, 스킵");

      const payload = JSON.stringify({
        savedAtMs: now,
        savedAt: new Date().toISOString(),
        compare,
      });
      const content = b64(payload);

      let sha;
      const cur = await gh("GET", "/contents/" + PATH);
      if (cur.status === 200) { try { sha = JSON.parse(cur.responseText).sha; } catch (e) {} }
      else if (cur.status !== 404) return console.warn("[OFF-AIR] 파일 조회 실패", cur.status, cur.responseText.slice(0, 200));

      const put = await gh("PUT", "/contents/" + PATH, {
        message: "data: 틱두 실시간 컷 (유저스크립트 · " + leagues.size + "개 리그)",
        content: content,
        sha: sha,
      });
      if (put.status === 200 || put.status === 201) {
        localStorage.setItem(LS, String(now));
        toast("틱두 컷 GitHub 업로드 완료 · " + leagues.size + "개 리그");
        console.log("[OFF-AIR] 커밋 완료");
      } else {
        console.warn("[OFF-AIR] 커밋 실패", put.status, put.responseText.slice(0, 300));
        if (put.status === 401 || put.status === 403)
          toast("GitHub 토큰 오류 — 유저스크립트 토큰 확인", true);
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
