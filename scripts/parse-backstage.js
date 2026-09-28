const fs = require("fs");

function bsNum(s) {
  if (s == null) return 0;
  s = String(s).trim().replace(/,/g, "").replace(/\s/g, "");
  const m = s.match(/^([\d.]+)\s*([KkMm]?)/);
  if (!m) return 0;
  let v = parseFloat(m[1]) || 0;
  if (/[Mm]/.test(m[2])) v *= 1e6;
  else if (/[Kk]/.test(m[2])) v *= 1e3;
  return Math.round(v);
}
function bsMins(s) {
  if (!s) return 0;
  s = String(s);
  let mins = 0, matched = false;
  const h = s.match(/([\d.]+)\s*시간/) || s.match(/([\d.]+)\s*h(?:ours?|rs?)?\b/i);
  const m = s.match(/([\d.]+)\s*분/) || s.match(/([\d.]+)\s*m(?:in(?:ute)?s?)?\b/i);
  if (h) { mins += parseFloat(h[1]) * 60; matched = true; }
  if (m) { mins += parseFloat(m[1]); matched = true; }
  if (!matched) {
    const only = s.match(/^([\d,]+)\s*분?$/);
    if (only) mins = parseFloat(only[1].replace(/,/g, ""));
  }
  return Math.round(mins);
}
function bsPct(s) { const m = String(s).replace(/,/g, "").match(/(-?[\d.]+)\s*%/); return m ? parseFloat(m[1]) / 100 : null; }
function bsHandleLine(s) {
  s = String(s || "").trim();
  if (!s || s === "지난달 대비" || s === "-" || s === "더 보기") return false;
  if (/[가-힣]/.test(s)) return false;
  if (/^-?[\d.,]+\s*[KkMm%]?$/.test(s)) return false;
  if (/(시간|분|초)/.test(s)) return false;
  if (/^\d+\./.test(s)) return false;
  if (/^\d{17,20}$/.test(s)) return false;
  return /^@?[A-Za-z0-9._+-]{2,40}$/.test(s);
}
function parseBackstage(text) {
  const L = String(text || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (let i = 1; i < L.length; i++) {
    if (!/^\d{17,20}$/.test(L[i])) continue;
    const handle = String(L[i - 1] || "").replace(/^@/, "");
    if (!bsHandleLine(handle)) continue;
    const uid = L[i];
    let j = i + 1;
    let status = "";
    if (L[j] && /[가-힣]/.test(L[j]) && /(랭크|졸업|크리에이터)/.test(L[j])) { status = L[j]; j++; }
    const m = [];
    for (let n = 0; n < 12 && j < L.length; n++) {
      if (/^\d{17,20}$/.test(L[j]) || bsHandleLine(L[j])) break;
      let v = L[j++]; let mom = null;
      if (L[j] === "지난달 대비") {
        j++;
        const prev = L[j++];
        if (prev !== "-" && L[j] != null && /%|∞/.test(L[j])) mom = bsPct(L[j++]);
      }
      m.push({ v, mom });
    }
    if (!m.length) continue;
    const g = (k) => (m[k] ? m[k].v : null);
    out.push({
      handle, name: "", uid, status,
      diamonds: bsNum(g(0)), diamondsMom: m[0] && m[0].mom,
      liveMinutes: bsMins(g(1)), hoursMom: m[1] && m[1].mom,
      validDays: g(2) ? (parseInt(String(g(2)).replace(/[^\d]/g, ""), 10) || 0) : 0,
      newFollowers: bsNum(g(3)),
      overseasRatio: g(4) != null ? bsPct(g(4)) : null, overseasMom: m[4] && m[4].mom,
      exposure: bsNum(g(10)), viewers: bsNum(g(11)),
    });
  }
  return out;
}

const text = fs.readFileSync(process.argv[2], "utf8");
const rows = parseBackstage(text);
fs.writeFileSync(process.argv[3], JSON.stringify(rows));
console.log("parsed", rows.length, "hosts");
