/*
 * Cloudflare Worker — tikdo.kr 실시간 조각컷 프록시
 *
 * 왜 필요한가:
 *   GitHub Actions 는 수천 명이 공유하는 데이터센터 IP 라, tikdo.kr 앞단의
 *   Cloudflare 가 봇으로 보고 429(Too Many Requests) 로 막는다.
 *   이 Worker 는 Cloudflare 엣지에서 실행되므로 그 차단을 받지 않고,
 *   로그인 쿠키를 붙여 tikdo API 를 대신 호출해 결과만 넘겨준다.
 *
 * 배포 (CLI 불필요, 브라우저 대시보드에서):
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker
 *      이름 예: offair-tikdo   → Deploy
 *   2. 그 Worker → Edit code → 이 파일 내용 전체 붙여넣기 → Deploy
 *   3. Settings → Variables and Secrets → 아래 둘 추가 (둘 다 Type: Secret)
 *        TIKDO_COOKIE  = tikdo.kr 로그인 상태에서 F12 콘솔 `copy(document.cookie)` 한 값
 *        KEY           = 접근키 (아무 문자열. GitHub secret TIKDO_ENDPOINT 의 ?k= 와 동일해야 함)
 *   4. Settings → 위쪽의 Worker URL 확인 (https://offair-tikdo.<계정>.workers.dev)
 *   5. GitHub repo → Settings → Secrets and variables → Actions →
 *        TIKDO_ENDPOINT = https://offair-tikdo.<계정>.workers.dev/cuts?k=<KEY>
 *      (GitHub 의 TIKDO_COOKIE 시크릿은 이제 지워도 됨)
 *
 * 쿠키 만료 시: 3번의 TIKDO_COOKIE 만 새 값으로 교체. 그 사이엔 틱플 폴백으로 버팀.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const TIKDO = "https://tikdo.kr/api/league/cutoffs/compare";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/cuts") return new Response("not found", { status: 404 });
    if (!env.KEY || url.searchParams.get("k") !== env.KEY)
      return new Response("forbidden", { status: 403 });
    if (!env.TIKDO_COOKIE)
      return json({ error: "TIKDO_COOKIE not set on worker" }, 500);

    let r;
    try {
      r = await fetch(TIKDO, {
        headers: {
          cookie: env.TIKDO_COOKIE,
          "user-agent": UA,
          accept: "application/json, text/plain, */*",
          "accept-language": "ko-KR,ko;q=0.9",
          referer: "https://tikdo.kr/league/cutoffs",
          origin: "https://tikdo.kr",
        },
        cf: { cacheTtl: 0 },
      });
    } catch (e) {
      return json({ error: "upstream fetch failed", detail: String(e) }, 502);
    }

    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
