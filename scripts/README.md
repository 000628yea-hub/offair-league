# 유저스크립트 2개 — 틱두 컷 + 백스테이지 우리 호스트

둘 다 같은 이유로 존재: 서버(GitHub Actions)에서는 로그인 세션이 필요한 데이터를
못 긁는다(봇 차단). 그래서 형 브라우저가 그 페이지를 열 때 대신 긁어서 GitHub에
커밋해두면, 사이트가 그걸 읽어 자동으로 채운다.

| 스크립트 | 여는 페이지 | 채우는 것 |
|---|---|---|
| `tikdo-userscript.user.js` | tikdo.kr/league/cutoffs | 리그 조각컷(유지·+1·+2·+3) |
| `backstage-userscript.user.js` | LIVE Backstage 크리에이터 데이터 | "우리 호스트" 진단 전체 |

둘 다 GitHub 토큰 **같은 거 재사용**하면 됩니다(Tampermonkey에 스크립트 2개, 토큰 값은 복붙).

---

## 틱두 실시간 컷 유저스크립트

`tikdo-userscript.user.js` — tikdo.kr 를 열 때마다 리그 실시간 조각컷을 GitHub(`tikdo-cuts.json`)에
올려서, 계산기 사이트가 틱두 정확 컷을 쓰게 한다.

## 왜 이렇게 하나

tikdo 는 Vercel 봇 차단이 있어서 데이터센터 IP(GitHub Actions, Cloudflare Worker 등)로는
`/api/league/cutoffs/compare` 를 못 긁는다 (429 + 자바스크립트 챌린지).
집 IP + 진짜 브라우저(로그인 세션)만 통과하므로, 브라우저 유저스크립트로 대신 올린다.

- 틱두 컷을 못 올리는 동안엔 `collect.js` 가 자동으로 **틱플 폴백 컷**을 쓴다 (사이트 안 깨짐).
- `tikdo-cuts.json` 이 72시간보다 오래되면 무시하고 틱플 폴백.

## 설정 (한 번)

### 1. GitHub 토큰 만들기

1. https://github.com/settings/personal-access-tokens/new (Fine-grained token)
2. **Token name**: `offair-tikdo-userscript`
3. **Expiration**: 1 year (또는 원하는 만큼)
4. **Repository access** → Only select repositories → `000628yea-hub/offair-league`
5. **Permissions** → Repository permissions → **Contents: Read and write**
6. Generate token → `github_pat_...` 값 복사 (한 번만 보임)

### 2. Tampermonkey 설치

- Chrome 웹스토어에서 **Tampermonkey** 설치
- Tampermonkey 아이콘 → **Create a new script**
- 기본 내용 다 지우고 `tikdo-userscript.js` 전체 붙여넣기
- 위쪽 `const TOKEN = "PASTE_..."` 를 1번에서 복사한 토큰으로 교체
- Ctrl+S 저장

### 3. 확인

- tikdo.kr/league/cutoffs 열기 → 4초 뒤 왼쪽 아래에 `✓ 틱두 컷 GitHub 업로드 완료` 토스트
- F12 콘솔에 `[OFF-AIR] 커밋 완료` 로그
- GitHub Actions 가 자동으로 돌아 사이트에 반영됨 (1~2분)

## 유지보수

- 토큰 만료되면(1년) 1번 다시 → 스크립트의 TOKEN 교체
- tikdo 로그아웃하면 안 됨 (로그인 세션 필요). 로그아웃했으면 다시 로그인만 하면 됨.
- 55분에 한 번만 올림 (`MIN_GAP_MIN`). 하루에 한 번만 tikdo 를 봐도 그날치는 올라감.

---

## 백스테이지 "우리 호스트" 유저스크립트

`backstage-userscript.user.js` — LIVE Backstage **데이터 › 크리에이터 데이터**
(`https://live-backstage.tiktok.com/portal/data/data`) 를 열 때, 표를 페이지당
100개로 늘리고 자동으로 다음 페이지를 눌러가며(보통 3페이지, 240명 기준) 전체를
긁어 GitHub(`backstage-creator-data.json`)에 올린다. 계산기 사이트의 `parseBackstage()`
파서를 그대로 재사용해서 "우리 호스트" 진단이 **자동으로** 채워진다(더 이상 수동
붙여넣기 불필요 — 붙여넣기 기능 자체는 그대로 남아 있고, 더 최신 쪽이 우선함).

### 설정

Tampermonkey 대시보드 → **"Create a new script"** (또는 아래 raw 링크를 열면 자동 설치 안내):

```
https://raw.githubusercontent.com/000628yea-hub/offair-league/main/scripts/backstage-userscript.user.js
```

편집기에서 `PASTE_GITHUB_FINE_GRAINED_TOKEN_HERE` 를 **tikdo 유저스크립트 때 만든
그 토큰**으로 교체(같은 repo, 같은 Contents 권한이라 그대로 재사용 가능) → Ctrl+S.

### 확인

- 크리에이터 데이터 페이지 열기 → 표가 페이지당 100개로 바뀌고, 자동으로 2·3페이지
  넘어갔다가 다시 1페이지로 두면 정상(넘기는 동안 3~5초 정도 걸림)
- 왼쪽 아래 `✓ 백스테이지 데이터 업로드 완료 · N명` 토스트
- F12 콘솔에 `[OFF-AIR] 백스테이지 커밋 완료`

### 유지보수

- 55분에 한 번만 올림. 이 페이지를 하루 한 번이라도 열면 그날치는 반영됨.
- 기간 필터("이번 달"/"이번 주"/"어제"/맞춤 설정)는 열려 있는 그대로 긁힌다 —
  **"이번 달"**로 두고 여는 걸 권장(대시보드 기본값).
- 로그아웃하면 당연히 안 됨. 재로그인만 하면 다시 작동.
