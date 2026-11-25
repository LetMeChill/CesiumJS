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
