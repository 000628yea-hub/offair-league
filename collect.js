/*
 * OFF-AIR 리그 컷 수집기  (개인용 · 미배포)
 *
 *   1회 실행:      node collect.js
 *   첫 사진 채우기: node collect.js --photos 2000   (한 번에 다 받음, ~20분 소요)
 *   계속 실행:      node collect.js --watch 20       (20분 간격, 사진도 조금씩 갱신)
 *   빠르게(사진X):  node collect.js --no-photos
 *
 * 하는 일:
 *   1) tikple.com/ranking/tier/{A|B|C|D} 에서 서브리그별 랭킹 전체
 *      (순위·핸들·이름·프로필사진·오늘다이아·live)를 가져와 ranking 배열로 저장.
 *      호스트 개별 페이지(/host/u/{id})를 한 번 받아
 *        - 프로필사진 → data/avatars.json (userId 영구, URL ~2일)
 *        - 팔로워·7/30일 다이아·일별(다이아·방송분·최고순위)·최근 방송기록
 *          → data/hosts.json  (앱의 호스트 상세 패널이 읽음)
 *      상세 없는 상위권 호스트부터 우선 수집. --photos N 으로 회당 개수 조절.
 *   2) 컷(rows):
 *      - data/cuts.json 에 이미 틱두(tikdo) 컷이 저장돼 있으면 그건 안 건드리고
 *        랭킹 목록만 갱신한다. (틱두가 리그 전체 인원으로 계산해 가장 정확함.
 *        틱두 컷은 로그인이 필요해 이 스크립트로는 못 가져옴 →
 *        앱의 "틱두 전체 붙여넣기" 로 사람이 넣어야 함.)
 *      - 틱두 컷이 없는 리그는 tikple.com/league/cutoffs 값을 fallback 으로 저장.
 *        (틱플은 "상위 99명 기준" 이라 유지컷·조각컷이 실제보다 높게 나올 수 있음)
 *   결과를 data/cuts.json 에 저장하고, index.html 이 시작할 때 자동으로 읽는다.
 *
 * 주의: tikple 데이터를 개인 참고용으로만 사용. 재배포·상업 이용 금지.
 *   tikple 이 페이지 구조를 바꾸면 파싱이 깨질 수 있음 → 그때 파서 수정.
 *   avatar 는 TikTok CDN 서명 URL이라 몇 시간 뒤 만료됨 → 주기적으로 재수집 필요.
 */

"use strict";
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "data", "cuts.json");
const LETTERS = ["A", "B", "C", "D"];
const UA = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "accept-language": "ko-KR,ko;q=0.9",
  "accept": "text/html",
};

/* Next.js flight: self.__next_f.push([1,"…"]) 의 문자열들을 JSON.parse 로
   복원해 이어붙인다. (props JSON 이 이중 이스케이프돼 있어 단순 치환으로는 깨짐) */
function flightPayload(raw) {
  const out = [];
  const re = /__next_f\.push\(\[1,/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    let k = m.index + m[0].length;
    while (raw[k] === " ") k++;
    if (raw[k] !== '"') continue;
    let esc = false, j = k + 1;
    for (; j < raw.length; j++) {
      const c = raw[j];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') break;
    }
    try {
      out.push(JSON.parse(raw.slice(k, j + 1)));
    } catch (e) {}
  }
  return out.join("");
}

/* 문자열 리터럴을 존중하며 key 뒤의 첫 배열( [ … ] )을 통째로 잘라낸다 */
function sliceArray(src, key) {
  const i = src.indexOf('"' + key + '"');
  if (i < 0) return null;
  const start = src.indexOf("[", i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return src.slice(start, j + 1);
  }
  return null;
}

async function getPayload(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  return flightPayload(raw) || raw.replace(/\\"/g, '"');
}
async function getText(url, ms) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms || 12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/* ── 프로필 사진 캐시 (data/avatars.json) ──
   틱플 랭킹 페이로드는 라이브·활동 호스트 사진만 준다. 나머지는 호스트
   개별 페이지에서 가져온다:  /host/{handle} → canonical 의 userId →
   /host/u/{userId} 의 JSON-LD "image".  userId 는 안 바뀌므로 캐시하고,
   사진 URL 은 몇 시간이면 만료되므로 오래된 것부터 갱신한다. */
const AV = path.join(__dirname, "data", "avatars.json");
const HOSTS = path.join(__dirname, "data", "hosts.json");
function loadAvatars() {
  try { return JSON.parse(fs.readFileSync(AV, "utf8")) || {}; } catch { return {}; }
}
function saveAvatars(a) {
  try {
    fs.mkdirSync(path.dirname(AV), { recursive: true });
    fs.writeFileSync(AV, JSON.stringify(a, null, 1));
  } catch (e) {}
}
function loadHosts() {
  try { return JSON.parse(fs.readFileSync(HOSTS, "utf8")) || {}; } catch { return {}; }
}
function saveHosts(h) {
  try {
    fs.mkdirSync(path.dirname(HOSTS), { recursive: true });
    fs.writeFileSync(HOSTS, JSON.stringify(h));
  } catch (e) {}
}
async function resolveUid(handle) {
  const t = await getText("https://www.tikple.com/host/" + encodeURIComponent(handle));
  const m = t.match(/\/host\/u\/(\d+)/);
  return m ? m[1] : null;
}

/* src[startIdx] 가 { 또는 [ 일 때, 문자열을 존중하며 짝 맞는 닫힘까지 잘라낸다 */
function sliceBal(src, startIdx) {
  const open = src[startIdx], close = open === "{" ? "}" : "]";
  let d = 0, ins = false, es = false;
  for (let j = startIdx; j < src.length; j++) {
    const c = src[j];
    if (ins) { if (es) es = false; else if (c === "\\") es = true; else if (c === '"') ins = false; continue; }
    if (c === '"') ins = true;
    else if (c === open) d++;
    else if (c === close && --d === 0) return src.slice(startIdx, j + 1);
  }
  return null;
}
function pick(pay, key) {
  const tag = '"' + key + '":';
  const i = pay.indexOf(tag);
  if (i < 0) return null;
  let k = i + tag.length;
  while (pay[k] === " ") k++;
  if (pay[k] !== "{" && pay[k] !== "[") return null;
  try { return JSON.parse(sliceBal(pay, k)); } catch (e) { return null; }
}

/* /host/u/{uid} 페이지에서 사진 + 상세(팔로워·다이아·일별·방송기록) 뽑기 */
async function fetchHostPage(uid) {
  const pay = await getPayload("https://www.tikple.com/host/u/" + uid);
  const am = pay.match(/"image":"(https:\/\/[^"]+tiktokcdn[^"]+)"/);
  const avatar = am ? am[1].replace(/\\u0026/g, "&") : null;

  let detail = null;
  const h = pick(pay, "host");
  if (h) {
    const days = (pick(pay, "days") || [])
      .filter((d) => d && d.hasData)
      .slice(-14)
      .map((d) => ({ d: d.dayKey, dia: d.diamonds || 0, min: d.liveMinutes || 0, rank: d.bestRank || null }));
    const sessions = (pick(pay, "sessions") || [])
      .slice(0, 12)
      .map((s) => ({ s: s.startedAt, e: s.endedAt, min: s.durationMin || 0, dia: s.diamonds || 0, rank: s.bestRank || null, on: !!s.ongoing }));
    detail = {
      name: h.name || null,
      handle: String(h.handle || "").replace(/^@/, ""),
      league: h.league || null,
      followers: h.followers || 0,
      following: (h.stats && h.stats.following) || 0,
      hearts: (h.stats && h.stats.hearts) || 0,
      videos: (h.stats && h.stats.videos) || 0,
      dToday: h.dToday || 0,
      d7: h.d7 || 0,
      d30: h.d30 || 0,
      week: Array.isArray(h.week) ? h.week : null,
      live: !!h.live,
      days,
      sessions,
    };
  }
  return { avatar, detail };
}

/* out 의 모든 ranking 호스트에 대해 사진을 채운다.
   - 이미 payload 로 받은 사진이 있으면 그대로 둠
   - 캐시에 신선한(FRESH_MS 이내) 사진이 있으면 사용
   - 나머지는 한 번에 MAX 개까지만 새로 받아옴 (없는 것 우선, 그다음 오래된 것) */
async function enrichAvatars(out, opts) {
  opts = opts || {};
  const MAX = opts.max != null ? opts.max : 250;
  const FRESH_MS = 30 * 60 * 60 * 1000; // 30시간 (틱플 사진 URL은 ~2일 유효)
  const DETAIL_MS = 20 * 60 * 60 * 1000; // 상세는 20시간마다 갱신
  const cache = loadAvatars();
  const hosts = loadHosts();
  const now = Date.now();

  // 대상 호스트 모으기. uid 를 랭킹에 붙이고, 리그 내 최고 순위를 기억한다.
  const targets = [];
  const bestRank = {};
  for (const lg of Object.keys(out)) {
    (out[lg].ranking || []).forEach((h) => {
      if (!h.handle) return;
      if (cache[h.handle] && cache[h.handle].uid) h.uid = cache[h.handle].uid;
      if (bestRank[h.handle] == null || h.rank < bestRank[h.handle]) bestRank[h.handle] = h.rank;
      if (targets.indexOf(h.handle) < 0) targets.push(h.handle);
    });
  }

  // 캐시 신선한 것 먼저 적용. 사진·상세 둘 다 최신이면 스킵.
  const stale = [];
  for (const handle of targets) {
    const c = cache[handle];
    const d = hosts[handle];
    const avFresh = c && c.url && now - (c.at || 0) < FRESH_MS;
    const dtFresh = d && now - (d.at || 0) < DETAIL_MS;
    if (avFresh) applyAvatar(out, handle, c.url);
    if (!avFresh || !dtFresh) stale.push(handle);
  }

  // 갱신 우선순위: 상세가 아예 없는 상위권 → 나머지는 순위 순
  stale.sort((a, b) => {
    const na = hosts[a] ? 1 : 0, nb = hosts[b] ? 1 : 0;
    if (na !== nb) return na - nb;                 // 상세 없는 것 먼저
    return (bestRank[a] || 999) - (bestRank[b] || 999); // 순위 높은 것 먼저
  });

  let done = 0, got = 0, gotDetail = 0;
  for (const handle of stale) {
    if (done >= MAX) break;   // MAX<=0 이면 새로 안 받고 캐시만 적용
    done++;
    try {
      let uid = cache[handle] && cache[handle].uid;
      if (!uid) {
        uid = await resolveUid(handle);
        await sleep(120 + Math.random() * 180);
      }
      if (!uid) { cache[handle] = Object.assign(cache[handle] || {}, { at: now }); continue; }
      const { avatar, detail } = await fetchHostPage(uid);
      await sleep(120 + Math.random() * 180);
      cache[handle] = { uid, url: avatar || null, at: now };
      if (avatar) { applyAvatar(out, handle, avatar); got++; }
      if (detail) {
        detail.uid = uid;
        detail.at = now;
        hosts[handle] = detail;
        gotDetail++;
      }
    } catch (e) {
      cache[handle] = Object.assign(cache[handle] || {}, { at: now });
    }
    if (done % 20 === 0) {
      saveAvatars(cache); saveHosts(hosts);
      process.stdout.write(`\r  호스트 수집 중… ${done}/${Math.min(MAX, stale.length)}   `);
    }
  }
  if (done >= 20) process.stdout.write("\n");
  saveAvatars(cache);
  saveHosts(hosts);
  // 최종적으로 사진이 붙은 호스트 수 (payload 사진 + 캐시)
  let withPhoto = 0, total = 0;
  const counted = {};
  for (const lg of Object.keys(out)) {
    (out[lg].ranking || []).forEach((h) => {
      if (!h.handle || counted[h.handle]) return;
      counted[h.handle] = 1; total++;
      if (h.avatar) withPhoto++;
    });
  }
  const leftover = Math.max(0, stale.length - done);
  console.log(
    `  호스트: 사진 ${withPhoto}/${total}명 · 상세 ${Object.keys(hosts).length}명` +
    ` (이번에 사진 ${got} · 상세 ${gotDetail}` +
    (leftover ? `, ${leftover}명 다음 실행` : "") + ")"
  );
}
function applyAvatar(out, handle, url) {
  for (const lg of Object.keys(out)) {
    (out[lg].ranking || []).forEach((h) => {
      if (h.handle === handle && !h.avatar) h.avatar = url;
    });
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 1) 틱플 조각컷 페이지 ── */
async function fetchCutoffs() {
  const pay = await getPayload("https://www.tikple.com/league/cutoffs");
  const arr = sliceArray(pay, "leagues");
  if (!arr) throw new Error("leagues 배열을 못 찾음 (페이지 구조 변경?)");
  const leagues = JSON.parse(arr);
  const bySub = {};
  for (const e of leagues) {
    if (!/^[A-D][1-5]$/.test(e.league || "")) continue;
    bySub[e.league] = e;
  }
  return bySub;
}

/* ── 2) 틱플 티어 랭킹 페이지에서 서브리그별 호스트 목록 ──
   ?league=XX 를 붙여야 그 티어 전 서브리그(각 99명)가 서버에서 완전히 렌더된다.
   안 붙이면 접속 시점 라이브 호스트 위주로만 나와 A2·B2 등이 12명씩만 옴. */
async function fetchLetter(letter) {
  let pay;
  try {
    pay = await getPayload(
      `https://www.tikple.com/ranking/tier/${letter}?league=${letter}1`
    );
  } catch (e) {
    return {};
  }
  const bySub = {};
  const arr = sliceArray(pay, "initialHosts");
  let hosts = null;
  if (arr) {
    try { hosts = JSON.parse(arr); } catch (e) { hosts = null; }
  }
  if (hosts && hosts.length) {
    for (const h of hosts) {
      const lg = h.league;
      if (!/^[A-D][1-5]$/.test(lg || "")) continue;
      (bySub[lg] = bySub[lg] || []).push({
        handle: String(h.handle || "").replace(/^@/, ""),
        name: h.name || null,
        avatar: h.avatarUrl || null,
        color: h.color || null,
        dToday: Number(h.dToday) || 0,
        live: !!h.live,
      });
    }
    return bySub;
  }
  const re =
    /"handle":"@?([A-Za-z0-9._]+)"[^{}]*?"league":"([A-D][1-5])"[^{}]*?"dToday":(\d+)[^{}]*?"live":(true|false)/g;
  let m;
  while ((m = re.exec(pay)) !== null) {
    const [, handle, lg, dToday, live] = m;
    (bySub[lg] = bySub[lg] || []).push({
      handle, name: null, avatar: null, color: null,
      dToday: Number(dToday), live: live === "true",
    });
  }
  return bySub;
}

function loadOld() {
  try {
    return JSON.parse(fs.readFileSync(OUT, "utf8")) || {};
  } catch {
    return {};
  }
}
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const kfmt = (n) => (n == null ? "-" : Number(n).toLocaleString());

async function runOnce() {
  const started = new Date();
  const oldAll = loadOld();

  let cutoffs;
  try {
    cutoffs = await fetchCutoffs();
    process.stdout.write(`  조각컷 ok (${Object.keys(cutoffs).length}개 리그)`);
  } catch (e) {
    console.log(`\n조각컷 수집 실패: ${e.message} — 기존 data/cuts.json 유지`);
    return;
  }

  // 티어별 랭킹 (부가 정보 — 실패해도 컷은 저장)
  const hostsBySub = {};
  for (const L of LETTERS) {
    Object.assign(hostsBySub, await fetchLetter(L));
    process.stdout.write(`  ${L}`);
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
  }
  process.stdout.write("\n");

  const out = {};
  for (const lg of Object.keys(cutoffs).sort()) {
    const c = cutoffs[lg];

    const rows = (c.rows || []).map((r) => ({
      pct: r.pct / 100, // 틱플은 1/10/20/50, 우리는 0.01/0.1/0.2/0.5
      fragments: r.fragments,
      rank: r.rank,
      score: r.score != null ? r.score : null,
      // 틱플이 유지(fragments:0)는 "상위 99명 기준 추정치"라고 명시
      estimated: r.fragments === 0 || undefined,
    }));

    // 어제 마감 컷 → "어제 대비" 증감 칩 기준
    const prev = {};
    (c.rows || []).forEach((r) => {
      if (r.yesterdayClose != null) prev["f" + r.fragments] = r.yesterdayClose;
    });
    // 어제 같은 시각 컷 (참고용)
    const sameTime = {};
    (c.rows || []).forEach((r) => {
      if (r.yesterdaySameTime != null) sameTime["f" + r.fragments] = r.yesterdaySameTime;
    });
    // 7일 마감 추이 (구간별) — 나중에 스파크라인용
    const series = {};
    (c.rows || []).forEach((r) => {
      if (Array.isArray(r.closeSeries)) series["f" + r.fragments] = r.closeSeries;
    });

    const list = (hostsBySub[lg] || [])
      .filter((x) => x.dToday > 0)
      .sort((a, b) => b.dToday - a.dToday);
    let ranking = list.map((x, i) => ({
      rank: i + 1,
      handle: x.handle,
      name: x.name || null,
      avatar: x.avatar || null,
      color: x.color || null,
      dToday: x.dToday,
      live: x.live,
    }));
    // 랭킹이 부분수집이면(라이브만 옴) 이전에 받아둔 걸 유지
    const old = oldAll[lg];
    if (ranking.length < 85 && old && old.ranking && old.ranking.length >= 85) {
      ranking = old.ranking;
    }

    // 이전에 틱두(정확)로 저장한 컷이 있으면 rows/prev 를 건드리지 않고
    // 랭킹 목록만 갱신한다. 없으면 틱플 컷을 fallback 으로.
    if (old && typeof old.source === "string" && old.source.indexOf("tikdo") === 0 && old.rows) {
      out[lg] = Object.assign({}, old, { ranking, rankingAt: stamp(started) });
      console.log(`  ${lg}: 틱두 컷 유지 (${old.savedAt}) · 랭킹만 갱신`);
      continue;
    }

    out[lg] = {
      league: lg,
      tier: lg[0],
      count: c.count != null ? c.count : 99,
      top: c.top != null ? c.top : (rows[0] && rows[0].score) || null,
      median: c.median != null ? c.median : null,
      ranking,
      rows,
      prev: Object.keys(prev).length ? prev : null,
      sameTime: Object.keys(sameTime).length ? sameTime : null,
      series: Object.keys(series).length ? series : null,
      savedAt: stamp(started),
      source: "tikple-cutoffs",
    };

    const g = (f) => {
      const r = rows.find((x) => x.fragments === f);
      return r ? r.score : null;
    };
    console.log(
      `  ${lg}: ${out[lg].count}명 · 1위 ${kfmt(out[lg].top)} · +2 ${kfmt(g(2))} · +1 ${kfmt(
        g(1)
      )} · 유지 ${kfmt(g(0))}${g(0) != null ? " (틱플추정)" : ""}`
    );
  }

  // 프로필 사진: 캐시(data/avatars.json)는 항상 적용하고,
  // --no-photos 가 아니면 부족한 만큼 새로 받아온다.
  try {
    await enrichAvatars(out, { max: ARGS.photos });
  } catch (e) {
    console.log("  사진 갱신 오류:", e.message);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`저장: data/cuts.json  (${Object.keys(out).length}개 리그, ${stamp(started)})`);
}

/* ── 인자 파싱 ──
   node collect.js                  1회 실행 (사진 최대 250개 갱신)
   node collect.js --watch 20       20분마다
   node collect.js --photos 2000    이번에 사진 최대 2000개 (첫 실행 때 한 번에 다 받고 싶을 때)
   node collect.js --no-photos      사진 새로 안 받음 (캐시는 그대로 적용) */
const ARGS = (() => {
  const a = process.argv.slice(2);
  const o = { watch: a.includes("--watch"), everyMin: 20, photos: 250 };
  if (a.includes("--no-photos")) o.photos = 0;
  const pi = a.indexOf("--photos");
  if (pi >= 0 && /^\d+$/.test(a[pi + 1] || "")) o.photos = Number(a[pi + 1]);
  const wi = a.indexOf("--watch");
  if (wi >= 0 && /^\d+$/.test(a[wi + 1] || "")) o.everyMin = Number(a[wi + 1]);
  else {
    const bare = a.find((x, i) => /^\d+$/.test(x) && a[i - 1] !== "--photos");
    if (bare) o.everyMin = Number(bare);
  }
  return o;
})();

/* ── 진입점 ── */
(async () => {
  const everyMs = Math.max(5, ARGS.everyMin) * 60 * 1000;
  await runOnce();
  if (ARGS.watch) {
    console.log(`\n--watch: ${everyMs / 60000}분마다 갱신합니다. (Ctrl+C 로 종료)\n`);
    setInterval(() => {
      console.log("── " + new Date().toLocaleTimeString("ko-KR") + " ──");
      runOnce().catch((e) => console.error("갱신 오류:", e.message));
    }, everyMs);
  }
})();
