# frontend

인하대학교 탄소중립 아카데미 - AI 기반 도시 열환경 디지털 트윈 및 폭염 대응 시뮬레이션 플랫폼 구축

## 로컬 실행

Node.js와 npm 설치 후 `npm ci`로 의존성을 설치하고 `.env.example`을 `.env.local`로 복사합니다. 지도 인증키는 `.env.local`에 입력하고 Git에 올리지 않습니다.

### 로컬 백엔드 사용

```sh
npm run dev
```

기본 `/api` 프록시는 `http://localhost:8080`을 사용합니다. 로컬 DB와 Spring 실행이 필요합니다.

### 원격 백엔드 사용

프로젝트 루트의 `.env.remote.local`에 다음 값을 작성합니다. 주소는 실제 배포한 API 서버의 Nginx 또는 HTTPS 진입점입니다.

```dotenv
API_PROXY_TARGET=http://원격_API_서버_주소
```

```sh
npm run dev:remote
```

기존 개발 서버를 종료한 뒤 실행합니다. 브라우저의 `/api` 요청만 선택한 원격 서버로 전달합니다. 브이월드 키 등 공통 설정은 `.env.local`에서 계속 읽습니다. 환경변수·모드 변경 후에는 개발 서버를 다시 시작합니다.

원격 서버에는 프론트가 사용하는 기본 데이터셋·격자 조회 API와 기준 데이터가 준비돼 있어야 합니다. DB 적재만으로 최신 API가 배포되지는 않습니다. 자동으로 다른 서버로 전환하는 기능은 없으며, 원격 모드의 저장·삭제 요청은 원격 데이터에 영향을 줍니다.

`API_PROXY_TARGET`은 개발 서버용 설정입니다. 운영 배포의 API 주소 설정과 별개이며, Vite 개발 프록시는 배포 산출물에 포함되지 않습니다.

## Vercel 배포

GitHub 저장소를 Vercel에 연결하고 Production Branch를 `develop`으로 설정합니다.
Framework Preset은 Vite, Root Directory는 저장소 루트, Build Command는 `npm run build`, Output Directory는 `dist`입니다.

### 환경변수

Vercel Project Settings의 Environment Variables에서 설정합니다. 로컬 `.env.local`은 Git에 포함되지 않으므로 Vercel에 자동 전달되지 않습니다.

- `VITE_API_BASE_URL`: `/api`
- `VITE_VWORLD_API_KEY`: 배포 도메인에서 사용할 브이월드 WebGL 3D 인증키

현재 기본 지도는 브이월드 SDK를 사용하므로 Cesium Ion 토큰은 이 화면 배포에 필요하지 않습니다.
환경변수는 빌드 시 반영됩니다. 값을 바꾸면 다시 배포해야 하며 `VITE_` 변수는 브라우저에 전달되므로 DB 비밀번호나 서버용 비밀키를 넣지 않습니다.
브이월드 웹 지도 인증키는 프론트에서 사용하는 키이며 실제 배포 도메인의 사용 권한을 확인합니다.

### API 연결

`vercel.json`의 외부 rewrite가 `/api/...` 요청을 기존 OCI 백엔드로 전달합니다.
브라우저는 Vercel의 HTTPS 주소로 API를 요청하므로 Vite 개발 프록시나 브라우저의 교차 출처 요청 설정에 의존하지 않습니다.
현재 Vercel에서 OCI로 전달하는 구간은 기존 HTTP 주소를 사용합니다. 이 구간도 암호화하려면 백엔드 도메인과 HTTPS를 구성하고 rewrite 목적지를 변경합니다.
`API_PROXY_TARGET`은 로컬 Vite 개발 서버 전용으로 Vercel 배포에는 사용하지 않습니다.

Vite가 `index.html`과 `vworld-preview.html`을 함께 빌드하므로 브이월드 iframe 페이지도 별도 파일로 배포됩니다.

### 첫 배포 후 확인

1. 고정 Production 도메인을 확인하고 브이월드 인증키의 서비스 URL을 해당 도메인에 맞춥니다. 개발용 localhost 인증도 필요한 경우 별도 개발 키를 유지합니다.
2. `/api/v1/datasets/default`가 JSON으로 응답하는지 확인합니다.
3. 기본 지도와 실사형 3D 건물, 격자 선택, 정책 예측 결과, 인구 및 시설 모드를 확인합니다.
4. `npm run dev`를 종료한 상태에서도 공개 주소로 접속되는지 확인합니다.

임의 Preview 배포 주소는 브이월드 인증 도메인과 다를 수 있으므로 지도 검증은 등록한 고정 Production 도메인에서 진행합니다.

## 지도 로딩 최적화

브이월드 초기화와 격자 조회를 병렬로 진행합니다. 표시 이미지는 미리 생성할 수 있지만,
관측 자료·좌표·색상 기준·이미지 해상도·건물 LoD를 줄이지 않습니다.

### 사전 이미지 생성 및 검증

처음 한 번 또는 기준 자료가 바뀔 때 실행합니다. 기존 자료를 수정하거나 DB에 쓰지 않고 조회만 합니다.
Windows에서는 설치된 Microsoft Edge를 사용합니다. 다른 환경은 `npx playwright install chromium`이 필요합니다.

```powershell
$env:MAP_ASSET_API_TARGET = 'http://localhost:8080'
npm run map:prepare
npm run map:verify
```

원격 공개 기준 자료를 사용할 때는 `MAP_ASSET_API_TARGET`을 해당 백엔드 주소로 지정합니다.
이 변수는 생성 명령 전용이며 브라우저용 환경변수가 아닙니다. Vercel 빌드 시에는 이미 생성해 커밋한 파일을 검증하며 운영 API를 호출해 재생성하지 않습니다.

- 생성 결과: `public/map-data/prepared-manifest.json`과 해시별 디렉터리의 PNG 3장.
- 기존 브라우저 렌더러로 온도 2048 × 1495, 도로·녹지 4096 × 2991 이미지를 생성합니다. 크기는 현재 데이터의 경계 비율에서 나온 값입니다.
- 원본 PNG와 압축 PNG의 전체 RGBA 및 브라우저 디코딩 픽셀을 대조한 뒤 저장합니다. 색상 수 축소·좌표 반올림·온도 보간은 하지 않습니다.
- 실행 시 실제 API의 데이터셋·전체 격자 해시와 범례·범위를 대조한 뒤 사전 이미지를 사용합니다.
- 자료가 다르거나 이미지가 없거나 손상됐다면 기존 브라우저 생성 방식으로 돌아갑니다.
- 브라우저에는 검증한 공개 PNG만 캐시합니다. API 응답을 오래된 캐시로 대체하지 않습니다.
- 원본 격자는 최신성 검증과 정확한 클릭을 위해 계속 조회합니다. 클릭 공간 인덱스는 후보만 줄이며 최종 판정에는 원본 폴리곤과 내부 구멍을 사용합니다.

### 검사 및 성능 기록

```sh
npm run test:map
npm run lint
npm run build
```

`test:map`은 실제 운영 DB를 변경하지 않는 브라우저 회귀 검사입니다. 사전 이미지 정상·누락·손상, 자료 불일치, 캐시 복구, 요청 취소와 폴리곤 선택을 검사합니다.
`npm run build`는 사전 이미지·토지피복·렌더러의 체크섬을 먼저 검증합니다. 이미지 원본 파일은 포매터로 수정하지 않습니다.

브라우저 개발자 도구에서 지도 iframe을 선택한 후 다음으로 단계별 시간을 확인할 수 있습니다.

```js
performance.getEntriesByType('measure').filter((entry) => entry.name.startsWith('urban-heat:'));
```

`ready`는 자료와 화면 조작 준비 완료 시간입니다. `terrain-idle`은 지형 큐의 일시적인 완료이며 모든 실사형 건물의 로딩 완료를 뜻하지 않습니다.
외부 브이월드 서버 응답·네트워크·GPU에 따른 차이는 남습니다. 사전 PNG는 생성 시간을 줄이는 대신 첫 접속의 전송량이 늘 수 있으며, 재접속에서는 이미지 캐시를 재사용합니다.
