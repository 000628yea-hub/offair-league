# 틱두 실시간 컷 유저스크립트

`tikdo-userscript.js` — tikdo.kr 를 열 때마다 리그 실시간 조각컷을 GitHub(`tikdo-cuts.json`)에
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
