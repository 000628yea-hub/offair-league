/*
 * 랭킹 파서 · 조각 규칙 검증 스크립트
 *   터미널:  node test-parser.js
 *   브라우저: test-parser.html 을 더블클릭  (Node 없이도 결과 확인)
 *
 * index.html 안의 parseScores / rulesFor / cutRank 와 같은 로직을 복사해 둔 것입니다.
 * index.html 쪽을 고쳤다면 이 파일도 같이 맞춰주세요.
 */
(function(){
  "use strict";

  var IS_BROWSER = typeof window !== "undefined" && typeof document !== "undefined";
  var log = [];
  function out(s){ log.push(s); if(!IS_BROWSER && typeof console !== "undefined") console.log(s); }

  /* ── index.html 과 동일한 로직 ── */
  function parseScores(text){
    var out = [];
    var re = /([0-9][0-9,\.]*)([KkMm])?/g, m;
    while((m = re.exec(text)) !== null){
      var v = parseFloat(m[1].replace(/,/g, ""));
      if(!isFinite(v)) continue;
      if(m[2] === "K" || m[2] === "k") v *= 1000;
      else if(m[2] === "M" || m[2] === "m") v *= 1000000;
      v = Math.round(v);
      if(v >= 100) out.push(v);          // 순위(1~99) 같은 작은 수는 버림
    }
    return out.sort(function(a,b){ return b - a; });
  }

  function rulesFor(lg){
    var t = lg[0];
    if(t === "A") return {p3:0.01, p2:0.10, p1:0.20, keep:0.50};
    if(t === "B") return {p3:0.01, p2:0.10, p1:0.20, keep:0.70};
    if(t === "C") return {p3:null, p2:0.10, p1:0.20, keep:0.80};
    if(lg === "D1") return {p3:null, p2:0.10, p1:0.20, keep:0.80};
    return {p3:null, p2:0.10, p1:0.20, keep:null};   // D2~D5 차감 없음
  }

  function cutRank(pct, n){ return Math.max(1, Math.ceil(pct * n)); }

  function judge(lg, rank, n){
    var r = rulesFor(lg);
    if(r.p3 && rank <= cutRank(r.p3, n)) return 3;
    if(rank <= cutRank(r.p2, n)) return 2;
    if(rank <= cutRank(r.p1, n)) return 1;
    if(!r.keep || rank <= cutRank(r.keep, n)) return 0;
    return -1;
  }

  /* ── 검증 ── */
  var pass = 0, fail = 0;
  function eq(label, got, want){
    var ok = JSON.stringify(got) === JSON.stringify(want);
    out((ok ? "  OK  " : "  FAIL") + "  " + label + (ok ? "" : "\n        기대 " + JSON.stringify(want) + " / 실제 " + JSON.stringify(got)));
    ok ? pass++ : fail++;
  }

  out("\n[1] 랭킹 붙여넣기 파서");
  eq("순위·닉네임이 한 줄에 같이",
     parseScores("1위 호스트A 2,778,793\n2위 호스트B 1,204,110\n3위 호스트C 980,004"),
     [2778793, 1204110, 980004]);
  eq("순위와 다이아가 줄로 나뉜 경우",
     parseScores("1\n홍길동\n47,670\n2\n김철수\n44,347\n3\n이영희\n29,873"),
     [47670, 44347, 29873]);
  eq("K·M 축약 표기",
     parseScores("2.8M 737.5K"),
     [2800000, 737500]);
  eq("퍼센트·인원 같은 작은 수는 무시",
     parseScores("18.2% 99명 47,670"),
     [47670]);

  out("\n[2] 조각 판정 (99명 기준 경계값)");
  eq("A1 1위 → +3",  judge("A1", 1, 99), 3);
  eq("A1 2위 → +2",  judge("A1", 2, 99), 2);
  eq("A1 10위 → +2", judge("A1", 10, 99), 2);
  eq("A1 11위 → +1", judge("A1", 11, 99), 1);
  eq("A1 20위 → +1", judge("A1", 20, 99), 1);
  eq("A1 50위 → 유지", judge("A1", 50, 99), 0);
  eq("A1 51위 → −1", judge("A1", 51, 99), -1);
  eq("B2 70위 → 유지", judge("B2", 70, 99), 0);
  eq("B2 71위 → −1", judge("B2", 71, 99), -1);
  eq("C3 1위 → +2 (C티어는 +3 없음)", judge("C3", 1, 99), 2);
  eq("C3 80위 → 유지", judge("C3", 80, 99), 0);
  eq("C3 81위 → −1", judge("C3", 81, 99), -1);
  eq("D1 85위 → −1", judge("D1", 85, 99), -1);
  eq("D5 99위 → 차감 없음", judge("D5", 99, 99), 0);

  out("\n[3] 컷 산출 (랭킹 → 컷 다이아)");
  var scores = [];
  for(var i = 0; i < 99; i++) scores.push(300000 - i * 2500);
  eq("C3 상위 10% = 10위 점수", scores[cutRank(0.10, 99) - 1], 277500);
  eq("C3 상위 20% = 20위 점수", scores[cutRank(0.20, 99) - 1], 252500);
  eq("C3 유지컷 80% = 80위 점수", scores[cutRank(0.80, 99) - 1], 102500);

  var summary = "통과 " + pass + " / 실패 " + fail;
  out("\n" + summary + "\n");

  /* ── 출력 ── */
  if(IS_BROWSER){
    document.body.style.margin = "0";
    document.body.style.background = "#fff";
    var bar = document.createElement("div");
    bar.textContent = (fail ? "FAIL — " : "PASS — ") + summary;
    bar.style.cssText = "font:700 14px/1 system-ui,sans-serif;padding:12px 16px;color:#fff;" +
      "background:" + (fail ? "#C62F2F" : "#12805C");
    var pre = document.createElement("pre");
    pre.textContent = log.join("\n").replace(/^\n/, "");
    pre.style.cssText = "font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;" +
      "padding:8px 16px 24px;white-space:pre-wrap;color:#1f1113";
    document.body.appendChild(bar);
    document.body.appendChild(pre);
    document.title = (fail ? "FAIL " : "PASS ") + summary;
  } else if(typeof process !== "undefined" && process.exit){
    process.exit(fail ? 1 : 0);
  }
})();
