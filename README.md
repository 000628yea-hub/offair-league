# OFF-AIR 리그 승급 시뮬레이터 — 인수인계 문서

TikTok LIVE 크리에이터 리그의 조각/승급 규칙을 계산해 소속 호스트에게 안내하는 단일 파일 웹앱입니다.

- **앱 본체**: `index.html` 하나. 빌드 도구·프레임워크 없음. 더블클릭해도 열리지만, 데이터(`data/*.json`)를 읽으려면 HTTP로 서빙해야 합니다(`file://`는 차단). 로컬은 `npm start`(= `node server.js`, 포트 8777).
- **데이터**: `collect.js`가 tikple에서 리그 랭킹·프로필 사진·호스트 상세를 받아 `data/cuts.json` / `data/avatars.json` / `data/hosts.json`에 씁니다. 앱이 시작할 때 자동으로 읽습니다.
- **개인 입력값**: 계산기 입력, 틱두 컷 붙여넣기, "우리 호스트" 백스테이지 데이터는 전부 보는 사람 브라우저의 `localStorage`에만 저장됩니다. 서버로 안 올라가고 다른 사람에게 안 보입니다.
- **배포**: GitHub Pages + GitHub Actions. Actions가 매시간 `collect.js`를 돌려 최신 데이터로 사이트를 다시 배포합니다. → [5. 배포](#5-배포-github-pages)

---

## 1. 이 앱이 하는 계산

리그 조각 규칙은 **"리그 안에서 상위 몇 %인가"** 하나로 정리됩니다.

| 티어 | +3 조각 | +2 조각 | +1 조각 | 유지(0) | 유지컷 밖 |
|---|---|---|---|---|---|
| A1~A3 | 상위 1% | 상위 10% | 상위 20% | 상위 50% | −1 |
| B1~B5 | 상위 1% | 상위 10% | 상위 20% | 상위 70% | −1 |
| C1~C5 | 없음 | 상위 10% | 상위 20% | 상위 80% | −1 |
| D1 | 없음 | 상위 10% | 상위 20% | 상위 80% | −1 |
| D2~D5 | 없음 | 상위 10% | 상위 20% | 전원 유지 | 차감 없음 |

- 조각 4개를 모으면 승급, 4개를 잃으면 강등. 랭킹 조각은 하루 최대 +3, 가디언 조각은 별도 +1.
- 정산은 매일 00:00 KST 순위로 확정.
- 리그 사다리(아래 → 위): `D5 D4 D3 D2 D1 C5 C4 C3 C2 C1 B5 B4 B3 B2 B1 A3 A2 A1`

### 컷 다이아가 나오는 원리 (중요)

틱톡은 컷 다이아를 공개하지 않습니다. 경쟁 서비스가 숫자를 보여주는 것도 별도 규칙이 있어서가 아니라, **랭킹을 수집해서 그 자리에 앉은 호스트의 점수를 읽는 것**입니다.

```
기준 순위 = 올림(상위 % × 리그 인원)
컷 다이아 = 그 순위 호스트의 현재 다이아
예) C3 99명 · 상위 10% → 올림(0.10 × 99) = 10위 → 10위 호스트 다이아 = +2 조각 컷
```

그래서 이 앱은 두 가지 모드로 동작합니다.

1. **순위로 계산** — 랭킹 데이터가 없어도 됨. 내 순위와 인원만 넣으면 % 규칙으로 판정.
2. **다이아로 계산** — 랭킹을 붙여넣어 컷을 산출한 뒤, 오늘 예상 다이아와 비교.

---

## 2. 파일 구조 (`index.html`)

파일 하나 안에 `<style>` → 마크업 → `<script>` 순으로 들어 있습니다. 주요 위치는 아래와 같습니다(줄 번호는 대략값, 검색해서 찾는 걸 권장).

| 구역 | 찾는 법 | 내용 |
|---|---|---|
| 디자인 토큰 | `:root{` (24행 부근) | 색·간격 변수. 라이트/다크 3세트가 같은 토큰 이름으로 정의됨 |
| 리그 사다리 | `var LADDER` (545행) | 승급/강등 순서. 리그가 늘거나 이름이 바뀌면 여기만 고침 |
| 조각 % 규칙 | `function rulesFor` (548행) | 티어별 `p3/p2/p1/keep` 비율. **정책이 바뀌면 최우선 수정 지점** |
| 구간 정의 | `function specFor` (557행) | `rulesFor`를 `{pct, fragments}` 배열로 변환. 저장 스키마의 기준 |
| 판정 로직 | `judgeByRank` (608행) / `judgeByCut` (625행) | 순위 기준 / 컷 기준 조각 판정 |
| 랭킹 파서 | `function parseScores` (901행) | 붙여넣은 텍스트에서 다이아 숫자만 추출 |
| 컷 산출 | `function buildRows` (917행) | 점수 배열 → `rows[{pct, fragments, rank, score}]` |
| 컷 표 렌더 | `function renderTable` (843행) | 리그별 컷라인 표. 숫자 없으면 기준 순위로 폴백 |
| 리그별 랭킹 렌더 | `function renderRanking` | `cuts[lg].ranking`(collect.js 수집) 배열을 순위표로. 컷 순위 줄·내 순위 줄에 표시. `전체`/`컷 주변만` 토글 |

### 저장 데이터 스키마

`localStorage["offair.league.cuts"]` — 리그별 컷 데이터입니다. `rows`는 틱플 조각컷 값(`pct`는 0.01/0.1/0.2/0.5, `fragments:0` 에 `estimated:true`), `prev`는 어제 마감 컷, `series`는 구간별 7일 마감 추이(스파크라인용), `ranking`은 서브리그 랭킹 전체(순위·핸들·이름·프로필·오늘 다이아·LIVE). 붙여넣기·직접입력 저장 시 `ranking`은 유지만 됩니다.

```json
{
  "C3": {
    "league": "C3", "tier": "C", "count": 99, "top": 221421, "median": 17615,
    "ranking": [
      {"rank": 1, "handle": "s2.bibi", "dToday": 82414, "live": true},
      {"rank": 2, "handle": "jay...young", "dToday": 58637, "live": false}
    ],
    "rows": [
      {"pct": 0.10, "fragments": 2, "rank": 10, "score": 47670},
      {"pct": 0.20, "fragments": 1, "rank": 20, "score": 30477},
      {"pct": 0.80, "fragments": 0, "rank": 80, "score": 11645}
    ],
    "prev": {"f2": 30048, "f1": 21323, "f0": 8599},
    "savedAt": "9월 1일 18:20",
    "source": "paste"
  }
}
```

`localStorage["offair.league.state"]` — 마지막 입력값(리그, 순위, 조각, 실드 등).

> 스키마는 나중에 API를 붙일 것을 염두에 두고 설계했습니다. 서버가 같은 모양의 JSON을 주면 `cuts` 객체에 그대로 넣기만 하면 화면이 동작합니다.

---

## 3. 자주 하게 될 수정

### 규칙이 바뀌었을 때
`rulesFor()`의 비율만 고칩니다. 예를 들어 A 티어 유지컷이 50% → 40%로 바뀌면 `keep:0.50` → `keep:0.40`. 표·시뮬레이터·타임라인이 전부 이 함수를 참조하므로 다른 곳은 건드릴 필요가 없습니다.

### 랭킹 붙여넣기가 잘 안 먹을 때
`parseScores()`는 **100 이상인 숫자만** 다이아로 봅니다(순위 1~99를 걸러내기 위함). `2.8M`, `737.5K` 표기와 콤마를 처리합니다. 문제가 되는 경우:
- 날짜(`2026`)나 코인 수 같은 큰 숫자가 섞이면 오인식될 수 있습니다 → 붙여넣기 전에 그 부분을 지우거나, 파서에 제외 규칙을 추가하세요.
- 앱에서 복사한 포맷이 다르면 `test-parser.js`에 실제 텍스트를 넣고 결과를 확인한 뒤 정규식을 조정하세요.

### 브랜드 색을 바꿀 때
`--brand`(#D6402A), `--brand-hot`, `--shard`(조각 골드), `--danger`. 라이트 모드 값이 세 군데(`:root`, `@media (prefers-color-scheme: light)`, `:root[data-theme="light"]`)에 있으니 **세 곳을 같이** 고쳐야 합니다. 색을 미디어쿼리 안에서만 정의하면 시스템 테마 사용자에게 깨집니다.

---

## 4. 검증

파서 로직만 따로 돌려보는 스크립트가 들어 있습니다. 현재 21개 항목 전부 통과 상태입니다.

```bash
node test-parser.js
```

Node가 없으면 **`test-parser.html`을 더블클릭**하면 같은 검사를 브라우저에서 볼 수 있습니다(상단 막대가 초록=PASS / 빨강=FAIL). `test-parser.js`는 두 방식 모두를 지원하므로, 규칙을 고칠 때 이 파일 하나만 `index.html`과 맞추면 됩니다.

화면 확인은 브라우저에서 `index.html`을 열고 다음을 봅니다.

- [ ] 리그를 바꿔가며 조각 판정이 표의 기준 순위와 일치하는가 (99명 기준 경계값: 1위 / 10위 / 20위 / 50·70·80위)
- [ ] 모바일 폭(375px)에서 하단 고정바가 뜨고, 컷 표가 카드로 바뀌는가
- [ ] 다크/라이트 양쪽에서 글자가 읽히는가 (토글 + OS 테마 변경 둘 다)
- [ ] 랭킹을 붙여넣었을 때 미리보기의 1위·인원이 실제와 맞는가

---

## 5. 배포 (GitHub Pages)

정적 사이트(`index.html` + `data/*.json`)를 GitHub Pages로 공개하고, GitHub Actions가 데이터 수집·재배포를 자동으로 합니다. 서버·비용 없음.

### 처음 한 번만

1. **GitHub 저장소 만들기** (계정 없으면 github.com에서 가입 → 직접)
   ```bash
   git init
   git add .
   git commit -m "OFF-AIR 리그 조각 계산기 v1"
   git branch -M main
   gh repo create offair-league --public --source=. --push
   ```
   `gh`(GitHub CLI)가 없으면: github.com에서 빈 저장소 `offair-league` 생성 후
   ```bash
   git remote add origin https://github.com/<계정>/offair-league.git
   git push -u origin main
   ```
   > 공개(`--public`) 저장소지만 개인 입력값은 안 올라갑니다(위 "개인 입력값" 참고). 코드를 비공개로 하려면 `--private` — 단 **비공개 저장소의 Pages는 GitHub 유료 플랜**이 필요합니다.

2. **Pages 켜기**: 저장소 → Settings → Pages → **Source: GitHub Actions** 선택. (배포 파일 `.github/workflows/deploy.yml`이 이미 들어 있음)

3. **첫 배포 확인**: Actions 탭 → "수집 & 배포" 워크플로가 돌고 나면 `https://<계정>.github.io/offair-league/` 로 열림. 팀에 이 링크 공유.

### 그 다음부터

- **자동**: 매시 07분에 Actions가 `collect.js`를 돌려 tikple 최신 랭킹·사진·호스트 상세를 받고 사이트를 다시 배포합니다. 별도 조작 없음.
- **코드 수정 시**: `index.html` 등을 고쳐서 `main`에 push하면 바로 재배포됩니다.
- **수동 실행**: Actions 탭 → "수집 & 배포" → "Run workflow".
- **틱두 컷**: 로그인이 필요해 자동 수집이 안 됩니다. 매니저가 앱의 "컷 데이터 업데이트 → 붙여넣기"에 `tikdo.kr/league/cutoffs`를 붙여넣으면 그 브라우저에 저장됩니다(사람마다 1회). 팀 전체에 정확한 컷을 공유하려면 아래 "한계" 참고.

### collect.js가 Actions에서 막히면

tikple가 GitHub 데이터센터 IP를 차단하면 Actions 로그에 `403`/`429`가 뜹니다. 그때는:
- **로컬 스케줄**: 매니저 PC에서 `npm run collect:watch`를 띄워 두고, 주기적으로 `git add data && git commit && git push` (또는 그 3줄을 도는 배치/작업 스케줄러). Actions는 배포만 담당.
- 또는 자택 서버에 **self-hosted runner** 등록.

### 로컬에서 미리 보기

```bash
npm run collect      # 데이터 한 번 받기 (data/*.json 생성)
npm start            # http://localhost:8777
```

---

## 6. 알려진 한계 · 다음 작업

- **랭킹·사진·호스트 상세**는 GitHub Actions가 매시간 자동 수집합니다(`collect.js`). tikple가 Actions IP를 막으면 로컬 수집으로 폴백 → [5. 배포](#5-배포-github-pages) 참고.
- **틱두 컷은 여전히 사람이 붙여넣어야** 합니다(로그인 전용). 지금은 붙여넣은 매니저 브라우저에만 저장됩니다. 팀 공유가 필요하면: 매니저가 붙여넣은 뒤 나오는 `localStorage["offair.league.cuts"]`를 `data/cuts.json`에 병합해 커밋하는 스텝을 워크플로에 추가하거나, 앱에 "컷 내보내기/가져오기" 버튼을 만드는 것이 다음 작업.
- **"우리 호스트" 백스테이지 파서**(`parseBackstage`/`parseOverseas`)는 표 텍스트 형식을 **추정**으로 짰습니다. 실제 백스테이지 "크리에이터 데이터" 복사본으로 한 번 맞춰야 정확합니다.
- **강등 시점은 전제 기반 계산입니다.** "실드를 먼저 쓰고 → 가진 조각을 모두 잃고 → 4개를 더 잃으면 강등"으로 계산하며, 화면에도 이 전제를 표시합니다. 실제 운영 데이터와 다르면 `render()`의 `days = state.shield + state.shards + 4` 부분을 조정하세요.
- **어제 대비 증감은 "직전 저장 대비"입니다.** 매일 저장이 쌓여야 의미가 생깁니다. 날짜별 이력을 남기려면 `cuts[lg].history` 배열을 추가하는 것이 다음 단계입니다.
- **컷 숫자: 틱두(TikDo) > 틱플(tikple).** 둘 다 상위 % 규칙은 같지만 계산 모수가 다릅니다.
  - **틱플**은 "상위 99명" 만으로 계산 → 예: A2 +1컷 111K, 유지컷 68K (전부 실제보다 높음). 틱플도 유지컷을 "상위 99명 기준 추정치"라고 명시.
  - **틱두**는 리그 전체 인원으로 계산 → 예: A2 +1컷 45K, 유지컷 18K. **이게 실제와 맞음** (매니저 확인: A2 68,730 다이아면 조각 유지, 45K면 +1). 단 틱두는 조각컷 숫자가 **로그인·회원 전용**이라 `collect.js`(headless)로는 못 가져옴.
  - **운영**: 앱의 **"틱두 전체 붙여넣기"** 탭에 `tikdo.kr/league/cutoffs`(로그인 상태) 페이지를 Ctrl+A→Ctrl+C→붙여넣기 하면 `parseTikdo()`가 18개 리그 컷을 한 번에 저장. `collect.js`는 틱두 컷이 있는 리그는 안 건드리고 랭킹 목록만 갱신, 없는 리그만 틱플 fallback.

### 해볼 만한 개선

1. 리그별 컷 이력 저장 → 7일 추이 스파크라인
2. 여러 호스트를 한 화면에서 보는 매니저용 대시보드
3. 랭킹 파서 포맷 프리셋(앱 복사본 / 스프레드시트 붙여넣기)
4. 컷 데이터 JSON 내보내기·불러오기 (매니저 → 호스트 전달용)

### 완료

- **정식 배포: GitHub Pages + Actions** (2026-09-07). `.github/workflows/deploy.yml` — 매시간(cron `7 * * * *`) + push + 수동. `collect.js --photos 400` 실행 → `actions/cache`로 실행 간 `data/` 보존(avatars 캐시 누적) → `_site/`로 묶어 `deploy-pages`. **데이터는 git에 커밋 안 함**(캐시만). collect 실패해도 배포는 진행. `package.json`(scripts), `.nojekyll`, `robots.txt`(noindex), `<head>` 메타(viewport·og·favicon) 추가. `index.html`에 `LOCAL_MODE`(localhost 판별) — 배포본에서는 "node collect.js 돌려라" 대신 "잠시 후 새로고침" 안내.
- **우리 호스트 대시보드** (2026-09-07). "리그별 랭킹" 섹션 바로 뒤 `#rosterSec`. 백스테이지 "크리에이터 데이터"+"해외 분석" 붙여넣기 → `parseBackstage()`/`parseOverseas()` → `localStorage["offair.roster"]`. `renderRoster()`가 tikple 랭킹(리그·순위·사진, `rEntryCI` 대소문자무시)+`hostDetail`(7일추세)과 교차한 `.rtab` 표: 총다이아·방송h·**K/시간(효율)**·유효일·해외%·7일·플래그(🔴해외고정 oversea≥50% / 🟠저효율 eff<3.5K&h>25 / 🟢기회 eff>10K&(h<20\|\|유효일<7)). 정렬 3종, 행 클릭 → `openHost()`. 백스테이지 API는 봇 차단이라 자동 수집 없음(매니저가 붙여넣음).
- **레이아웃 통합** (2026-09-03). 결과 패널("오늘 결과")에 그 리그의 컷 4칸(+3/+2/+1/유지, 어제 대비, 다이아 모드면 내 위치 하이라이트 + "다음 조각까지 N")을 바로 표시 — `renderCutline()`. "오늘의 컷 데이터" 섹션은 `<details id="cutData">` 로 접힘(요약: `틱두 · 시각 · N개 리그`), 펼치면 틱두/랭킹/직접입력. 규칙 함수는 `renderCutline` 도 `rulesFor()`·`scoreOf()` 참조.
- **리그별 랭킹: 18개 서브리그 탭 + 호스트 클릭 + 전체 프로필 사진** (2026-09-03). 랭킹 섹션 상단 `#rankTabs`(A1~D5) 로 아무 리그나 열람(`rankLg`, null이면 선택 리그 따라감). 호스트 줄(`tr.hostrow`) 클릭/Enter → `https://www.tikple.com/host/{handle}` 새 탭(공개 상세: 오늘·7·30일 다이아, 팔로워, 차트).
  - **프로필 사진**: 틱플 랭킹 페이로드는 라이브·활동 호스트만 `avatarUrl` 을 준다. 나머지는 `collect.js` 가 개별 페이지에서 받아온다: `/host/{handle}` HTML 의 canonical 에서 userId → `/host/u/{userId}` 의 JSON-LD `"image"`. `data/avatars.json` 에 `{handle:{uid,url,at}}` 캐시. userId 영구, 사진 URL ~2일 유효. 한 실행에 최대 250개(`--photos N` 조절, `--no-photos` 로 끔). 첫 채우기: `node collect.js --photos 2000` (~20분). 없는 호스트는 앱에서 이름 첫 글자 표시.
- **리그별 랭킹 표** (2026-09-03). `collect.js`가 서브리그별 랭킹 전체를 `ranking:[{rank,handle,name,avatar,color,dToday,live}]` 배열로 저장하고, `index.html`의 "리그별 랭킹" 섹션이 프로필(사진 없으면 tikple처럼 이름 첫 글자+색 원)·@아이디·이름·오늘 다이아·LIVE를 표로 보여줌. 컷 순위 줄과 (순위 모드일 때) 내 순위 줄에 표시. `전체`/`컷 주변만` 토글. tikple 데이터라 개인 참고용·미배포 원칙 유지.
  - `avatar`는 tikple 서버 페이로드에 라이브 중인 일부만 담겨 옴(A티어 ~30%, D티어 0%). 나머지는 색 원으로 폴백. TikTok CDN 서명 URL이라 몇 시간 뒤 만료 → 재수집 시 갱신.

### collect.js / 파싱 (2026-09-03)

- **랭킹 목록**: `tikple.com/ranking/tier/{A|B|C|D}?league={letter}1` 4요청. `?league=` 안 붙이면 라이브 호스트만 12명씩 옴 → 반드시 붙일 것. `sliceArray(payload,"initialHosts")` → JSON.parse. 부분수집(<85명)이면 이전 ranking 유지.
- **컷 fallback**: `tikple.com/league/cutoffs` → `sliceArray(payload,"leagues")`. `rows[{pct(1/10/20/50)/100, fragments, rank, score}]`, `prev`=yesterdayClose, `series`=closeSeries. `source:"tikple-cutoffs"`. 단 `data/cuts.json[lg].source` 가 `tikdo` 로 시작하면 rows 안 건드리고 `ranking`+`rankingAt` 만 갱신.
- 파서: Next.js flight(`self.__next_f.push([1,"…"])`)는 이중 이스케이프 → `flightPayload()`가 각 조각을 `JSON.parse`로 복원해 이어붙인 뒤 `sliceArray` + `JSON.parse`.
- **틱두 붙여넣기**: `index.html` 의 `parseTikdo(text)` — `tikdo.kr/league/cutoffs` get_page_text 포맷 파싱 (`Top N% <어제> <어제이때>` \n `<실시간>` \n `<조각>`, K/M/`-` 처리, Top 1→f3 / 10→f2 / 20→f1 / 50·70·80→f0). `source:"tikdo-cutoffs"`, rank 없음 → 앱이 랭킹 다이아 임계로 컷 위치 표시.

### 삽질 기록 (2026-09-03)

- 처음엔 상위 99명 랭킹만 긁어 %로 컷 직접 계산 → A2 유지컷 6.5만으로 나옴(틀림). → 틱플 조각컷 페이지 직접 가져오기로 전환했는데 **틱플도 "상위 99명 기준"** 이라 여전히 뻥튀기(A2 +1컷 111K). → 결국 **틱두**가 리그 전체로 계산해 정확(A2 +1컷 45K). 틱두는 로그인 필요 → 앱에 붙여넣기 탭 추가.
- `?league=A1` 안 붙이면 A2·B2 등 12명만 옴.
- 틱플 flight 페이로드 `initialHosts` 는 라이브만 담길 때 있음, `?league=` 로 우회.

---

문의: OFF-AIR E&M 크리에이터 운영팀
