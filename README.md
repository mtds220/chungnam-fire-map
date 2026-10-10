# 충청남도 소방력 통합지도 · 도착권역 분석시스템

충남 소방관서 182곳(119안전센터 80 · 119지역대 29 · 전담의용소방대 73)을 카카오맵에 표시한다. **관서를 고르거나 지도의 아무 지점을 클릭하면** 그곳이 분석 목적지가 되고, 다른 관서에서 출발해 기준시간(기본 30분) 안에 도착할 수 있는지를 **실제 도로 이동시간**으로 계산한다.

> 결과는 카카오모빌리티 길찾기의 **예상 도로 이동시간**이다. 출동준비·교통·기상·소방차 주행 특성은 반영하지 않으므로, 공식 판단에 쓰기 전에 실제 출동 기록으로 검증해야 한다.

## 목적지 정하기

| 방법 | 동작 |
|---|---|
| 관서 마커 클릭 | 정보 창이 뜬다 → **"이 관서를 목적지로"** |
| 지도의 빈 곳 클릭 | 그 지점에 빨간 핀이 꽂히고 바로 목적지가 된다. 주소는 자동으로 찾아 표시한다 |
| 왼쪽 검색창 | 관서명, 주소(예: `홍성군 홍북읍 충남대로 21`), 장소명(예: `충남도청`)을 함께 찾는다 |

관서가 목적지면 그 관서 자신은 출발지에서 빠지고, 지점이 목적지면 182곳 모두가 출발지가 된다.

## 계산 방식

1. **반경 10km 안**에 있는 출발 관서는 카카오 **다중 출발지 길찾기**로 30곳씩 묶어 요청한다.
2. **반경 밖** 관서는 **1:1 자동차 길찾기**로 하나씩 요청한다(동시 5건).
3. 직선거리가 `기준시간 × 150km/h`를 넘는 관서는 도로로도 닿을 수 없으므로 호출하지 않고 **"권역 밖(미계산)"**으로 표시한다. 이 직선거리는 *호출 생략*에만 쓰고, 도착 가능 여부를 판정하는 데는 쓰지 않는다.
4. 판정은 `이동시간 ≤ 기준시간`이면 **가능**이다. 정확히 30분(1,800초)도 가능에 들어간다. 경로 계산이 실패하면 **분석 불가**로 따로 세고, 가능 수에는 넣지 않는다.
5. 두 API 모두 **최단시간(`priority=TIME`)** 기준이다. 다중 출발지 API가 "추천경로"를 지원하지 않아 하나로 맞췄다.
6. 기준시간이나 출발 유형을 바꾸면 이미 받은 결과로 즉시 다시 판정한다. 새로 필요해진 관서만 추가로 계산한다.

> **반경 15km를 쓰려면?** 일반 키의 다중 출발지 API는 반경 상한이 10km다. 카카오모빌리티와 **제휴 계약**을 맺으면 제휴 API(반경 20km, 출발지 100곳)를 쓸 수 있고, 그때 `MULTI_ORIGIN_RADIUS_M=15000`과 엔드포인트(`server/kakaoMobility.ts`)를 바꾸면 된다. 지금은 10000을 넘게 넣어도 서버가 10000으로 낮춘다.

## API 키 설정

키는 두 개를 쓴다. **둘 다 소스코드에 넣지 않는다.**

| 키 | 용도 | 어디에 두나 | 보호 방법 |
|---|---|---|---|
| JavaScript 키 | 카카오맵 표시, 주소·장소 검색 | 서버 환경변수 → `/api/config`로 브라우저에 전달 | 지도 SDK가 브라우저에서 써야 하므로 숨길 수 없다. **카카오 콘솔의 도메인 제한**으로 보호한다 |
| REST API 키 | 카카오모빌리티 길찾기 | 서버 환경변수에만 | 브라우저로 나가지 않는다. 화면은 이 서버를 거쳐서만 길찾기를 호출한다 |

1. [Kakao Developers](https://developers.kakao.com) → 내 애플리케이션 → 앱 키에서 **JavaScript 키**와 **REST API 키**를 확인한다.
2. **[앱] → [플랫폼 키] → JavaScript 키 → JavaScript SDK 도메인**에 등록한다: `http://localhost:5173`, `http://localhost:8787`, 그리고 배포 주소. (예전 이름은 "플랫폼 → Web → 사이트 도메인")
3. 카카오맵 사용 설정을 켜고, 카카오모빌리티 길찾기 API 사용 권한이 그 REST 키에 열려 있는지 확인한다.
4. 프로젝트 폴더에 `.env`를 만든다(`.env.example`을 복사). `.env`는 git에 올라가지 않는다.

```ini
KAKAO_JS_KEY=발급받은_JavaScript_키
KAKAO_REST_KEY=발급받은_REST_API_키
MULTI_ORIGIN_RADIUS_M=10000   # 다중 출발지 반경(m), 일반 API 상한 10000
SKIP_SPEED_KMH=150            # 호출 생략 기준 속도
CACHE_TTL_HOURS=24            # 이동시간 캐시 보관 시간 — 카카오모빌리티 약관에 맞춰 조정
ROUTES_PER_MIN=30             # IP 당 분당 분석 요청 수 (요청 1건 = 출발지 최대 30곳)
PATHS_PER_MIN=120             # IP 당 분당 경로선 요청 수
```

키가 없으면 지도나 길찾기 영역에 "설정되지 않음" 안내가 뜬다. **임의의 이동시간은 만들지 않는다.**

## 로컬 실행

Node.js 22.9 이상이 필요하다(`.env`를 읽는 `--env-file-if-exists` 옵션 때문).

```powershell
# 이 PC는 node 가 PATH 에 없다
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
# 회사망 TLS 가로채기 때문에 Windows 인증서 저장소를 쓴다 (설치와 서버 실행 모두 필요)
$env:NODE_OPTIONS = "--use-system-ca"

npm.cmd install
npm.cmd run dev    # http://localhost:5173  (화면 5173 + API 서버 8787 동시 실행)
```

> PowerShell에서는 `npm` 대신 **`npm.cmd`**를 쓴다. 이 PC는 스크립트 실행 정책이 기본값(제한)이라 `npm`을 입력하면 `npm.ps1을 로드할 수 없습니다` 오류가 난다. 아래 표의 `npm` 명령도 모두 `npm.cmd`로 바꿔 입력한다. 실행 중인 창을 닫으면 서버도 꺼진다.

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 모드. 화면(Vite)과 API 서버(tsx watch)를 같이 띄운다 |
| `npm run build` | 타입 검사 → `dist/`(화면) + `dist-server/`(서버) |
| `npm start` | 빌드 결과로 운영 서버 실행. 한 포트에서 화면과 API를 함께 낸다 |
| `npm run check:classify` | 판정 로직 경계값 검사 (1800초 가능, 1801초 초과, 실패 제외 등) |
| `npm run import-data` | 엑셀 → `src/data/stations.json` 다시 만들기 |

## 관서 데이터 바꾸기

```powershell
node scripts/import-xlsx.mjs "새 파일.xlsx"
```

- 엑셀 첫 시트에 `관서`(관할 소방서) · `명칭` · `주소` · `위도` · `경도` 열이 있어야 한다.
- 유형은 이름으로 정한다: `전담의용소방대` / `지역대` / `안전센터`. 그 외(119구조구급센터, 소방정대 등)는 제외하고 개수를 출력한다.
- 좌표가 없거나 충남 범위를 벗어나거나 이름이 겹치면 경고를 낸다.
- 다시 빌드하고 배포하면 반영된다. (화면에서 올리는 업로드 기능은 7단계 예정)

## 외부 배포 (Render 예시)

서버 하나가 화면과 API를 함께 내보내므로 Node 웹 서비스 하나면 된다.

빌드·실행 설정은 저장소의 `render.yaml`에 들어 있다.

1. **GitHub에 올린다.** GitHub에서 새 저장소(비공개 권장)를 만든 뒤 이 폴더에서:
   ```powershell
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
   `.env`(키)는 `.gitignore`에 있어 올라가지 않는다.
2. **Render에서 Blueprint로 만든다.** [Render](https://render.com) → **New → Blueprint** → 저장소 선택. `render.yaml`을 읽어 웹 서비스를 만든다.
   - 빌드: `npm ci --include=dev && npm run build` / 실행: `npm start` / Node 22.12 / 상태 확인: `/api/health`
3. **키를 입력한다.** 만드는 화면(또는 서비스 → Environment)에서 `KAKAO_JS_KEY`, `KAKAO_REST_KEY`를 넣는다. 나머지 값은 `render.yaml`의 기본값이 들어간다. `PORT`는 Render가 넣어 준다.
4. **카카오 도메인을 등록한다.** 배포가 끝나면 나오는 주소(예: `https://chungnam-fire-access-map.onrender.com`)를 카카오 콘솔 **[앱] → [플랫폼 키] → JavaScript 키 → JavaScript SDK 도메인**에 추가한다. 빠뜨리면 지도가 뜨지 않는다.
5. **확인한다.**
   - `https://<주소>/api/health` → `{"ok":true,"stations":182,"mobilityConfigured":true,"mapConfigured":true}`
   - 화면에서 헤더의 "길찾기 연결됨", 지도 표시, 분석 실행

주의:
- 무료 플랜은 쉬고 있으면 잠들어 첫 접속이 느리고, 메모리 캐시도 사라진다.
- 공개 주소는 누구나 열 수 있다. 쿼터를 지키기 위해 IP별 요청 제한(`ROUTES_PER_MIN`)을 걸었지만, 정식 운영에서는 기관 인증(SSO·VPN·IP 허용목록) 뒤에 둘 것.
- 사용량은 `/api/usage`에서 서버 시작 이후 호출 수(다중/단건)로 확인한다.

## 구조

```
server/                    Express — REST 키를 쥐고 길찾기를 대리 호출
  index.ts                 /api/config · /api/routes · /api/route-path · /api/usage + dist 정적 서빙
  routeService.ts          반경 분류 → 다중 출발지 30곳씩 / 단건 동시 5개 → 캐시
  kakaoMobility.ts         카카오모빌리티 호출과 응답 정규화 (실패 시 값 비움)
  cache.ts                 (출발 좌표, 도착 좌표, 기준) 키 메모리 캐시 + 진행 중 요청 공유
src/
  types.ts                 서버·화면 공용 타입. 관서 유형 추가는 STATION_TYPES 에 항목만
  lib/classify.ts          판정·집계 — 지도·카드·표가 모두 이것만 읽는다
  lib/geo.ts               직선거리 (반경 분류·호출 생략 전용)
  store.ts                 목적지·조건·결과 상태, 분할 요청·취소·재시도
  map/                     카카오 SDK 로드, 마커 모양, 주소 검색·역지오코딩
  components/              Header · Sidebar · MapView · InfoCard · MapControls · AnalysisPanel
  data/stations.json       엑셀에서 만든 관서 데이터
scripts/
  import-xlsx.mjs          엑셀 → stations.json
  check-classify.ts        판정 경계값 검사
```

## 지도 표시 규칙

| 표시 | 뜻 |
|---|---|
| 파랑 **방패 + 불꽃** | 119안전센터 — 상시 출동 거점 |
| 주황 **집** | 119지역대 — 안전센터에 딸린 분소 |
| 초록 **원 + 소방 헬멧** | 전담의용소방대 — 의용대원 출동 |
| 빨강 큰 아이콘 · 빨간 핀 | 분석 목적지 (관서 / 지도에서 찍은 지점), 이름 상시 표시 |
| 검은 테두리 + 시간 배지 | 기준시간 안에 도착 가능 |
| 진한 회색 | 기준 초과 (왼쪽 "숨기기"로 감출 수 있다) |
| 흰 바탕 점선 | 권역 밖(미계산) |
| `?` | 분석 불가 |

회색이 되어도 바깥 모양(방패·집·원)은 그대로라 유형을 구분할 수 있다.

## 화면 디자인

[Supanova Design Skill](https://github.com/uxjoseph/supanova-design-skill)의 "Vantablack Luxe"(soft-skill)와 redesign-skill 규칙을 업무용 대시보드에 맞춰 옮겼다. 색·곡률·움직임 값은 `src/index.css`의 `@theme` 한곳에 있다.

- 배경 `#050505` + 옅은 빛 번짐 + 노이즈 질감. 강조색은 하나(`#e65a43`, 분석 목적지와 같은 색)
- 카드는 이중 베젤(`.bezel` > `.bezel-core`), 헤더·지도 컨트롤은 떠 있는 유리(`glass`)
- 글꼴 Pretendard(jsDelivr), 아이콘 Iconify Solar(`iconify-icon` 패키지 — 아이콘 데이터는 실행 중 api.iconify.design에서 받는다)
- 움직임은 `cubic-bezier(0.16,1,0.3,1)` 하나. 처음 나타날 때 한 번 떠오르고, 누를 때만 살짝 반응한다
- 각색: 랜딩 페이지용 큰 여백은 쓰지 않았고(밀도 높은 업무 화면), 원래 요구사항("불필요한 애니메이션 최소화")에 따라 반복 애니메이션은 넣지 않았다

축소하면 가까운 관서를 묶어 보여 준다(오른쪽 위 "묶음"). 분석 결과가 들어오면 판정이 한눈에 보이도록 묶음을 자동으로 푼다. 경로선은 기본으로 그리지 않고, 표나 정보 창의 **경로** 버튼을 누르거나 "가능 관서 경로 모두 보기"를 켤 때만 그린다.

## 다음 단계 (미구현)

- 7단계: 화면에서 엑셀/CSV 업로드·검증·좌표 편집·백업 — `store.stations` 배열만 바꾸면 되는 구조다.
- §11 추가 분석: 전담대 10/20/30분 중첩, 관서 간 비교, 가상 제외·신규 관서 — `classify()`가 `excludeIds`를 이미 받는다.

# Supanova Design Skill

AI가 생성하는 랜딩페이지의 디자인 퀄리티를 극적으로 향상시키는 스킬 모음입니다. 제네릭한 AI 템플릿 대신 $150k 에이전시 수준의 프리미엄 랜딩페이지를 생성합니다.

> **Powered by [supanova.dev](https://supanova.dev)** — AI 랜딩페이지 빌더
>
> Based on [taste-skill](https://github.com/Leonxlnx/taste-skill) by [@lexnlin](https://x.com/lexnlin)

## Skills

4개의 스킬이 각각의 폴더에 `SKILL.md` 파일로 존재합니다.

### 1. taste-skill (Supanova Design Engine)
메인 디자인 스킬. AI가 처음부터 프리미엄 랜딩페이지를 생성하도록 가르칩니다. 레이아웃, 타이포그래피, 컬러, 모션, 한국어 콘텐츠 품질까지 포괄합니다.

### 2. redesign-skill (Supanova Redesign Engine)
기존 랜딩페이지를 업그레이드합니다. 처음부터 다시 만드는 대신, 현재 디자인을 진단하고 가장 임팩트 있는 개선을 우선 적용합니다.

### 3. soft-skill (Supanova Premium Aesthetic)
$150k 에이전시 퀄리티에 집중합니다. Double-Bezel 카드 아키텍처, 스프링 기반 애니메이션, 플로팅 글래스 네비게이션, 한국어 타이포그래피 표준을 정의합니다.

### 4. output-skill (Supanova Full-Output)
AI의 출력 생략을 방지합니다. 플레이스홀더, 스켈레톤, 미완성 출력을 차단하고, 모든 랜딩페이지를 완전한 HTML 파일로 출력하도록 강제합니다.

## Supanova 특화 포인트

원본 taste-skill과의 주요 차이점:

- **Standalone HTML** — React/Next.js가 아닌 단일 HTML 파일 출력 (Tailwind CDN)
- **한국어 퍼스트** — Pretendard 폰트, `word-break: keep-all`, 자연스러운 한국어 카피
- **Iconify Solar** — 일관된 아이콘 시스템
- **랜딩페이지 특화** — 일반 웹앱이 아닌 전환율 중심 랜딩페이지 패턴
- **한국 시장** — 한국 사용자 이름, 한국 기업명, 한국어 CTA 패턴

## 사용법

1. 필요한 스킬의 `SKILL.md` 파일을 프로젝트에 복사합니다.
2. AI 에디터에서 해당 파일을 참조하세요. (예: Cursor에서 `@SKILL.md`)

끝입니다. AI가 파일을 읽고 규칙을 따릅니다.

### 추천 조합

| 상황 | 추천 스킬 |
|------|-----------|
| 새 랜딩페이지 생성 | `taste-skill` + `output-skill` |
| 기존 페이지 업그레이드 | `redesign-skill` |
| 최고 퀄리티가 필요할 때 | `taste-skill` + `soft-skill` + `output-skill` |

## 설정 (taste-skill)

taste-skill 상단의 4개 설정값을 조정할 수 있습니다:

**DESIGN_VARIANCE** — 레이아웃의 실험성
- 1-3: 깔끔하고 정돈된 대칭 그리드
- 4-7: 오버랩, 다양한 사이즈
- 8-10: 비대칭, 넉넉한 여백, 모던

**MOTION_INTENSITY** — 애니메이션 수준
- 1-3: 거의 없음. 호버 효과 정도
- 4-7: 페이드인, 스무스 스크롤
- 8-10: 마그네틱 효과, 스프링 물리, 스크롤 트리거

**VISUAL_DENSITY** — 화면당 콘텐츠 밀도
- 1-3: 넓고 럭셔리. 한 번에 하나의 요소
- 4-7: 일반적인 앱/웹사이트 간격
- 8-10: 촘촘하고 데이터 중심

**LANDING_PURPOSE** — 페이지 목적
- conversion: 전환율 중심 (기본값)
- brand: 브랜드 이미지 중심
- portfolio: 포트폴리오/쇼케이스
- saas: SaaS 제품 소개
- ecommerce: 이커머스/제품 판매

## 기술 스택

이 스킬로 생성되는 페이지의 기본 스택:

```html
<!-- Tailwind CSS (CDN) -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Pretendard 한국어 폰트 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css">

<!-- Iconify Solar 아이콘 -->
<script src="https://code.iconify.design/iconify-icon/2.3.0/iconify-icon.min.js"></script>
```

## 기여 & 피드백

- GitHub Issue 또는 Pull Request
- [supanova.dev](https://supanova.dev)

## 라이선스

원본 [taste-skill](https://github.com/Leonxlnx/taste-skill)의 라이선스를 따릅니다.

