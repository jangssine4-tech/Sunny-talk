# Sunny Talk — AI 영어 튜터 🌟

## 📁 프로젝트 구조

```
sunny-talk/
├── public/
│   └── index.html          ← 웹앱 (API Key 없음)
├── functions/
│   ├── index.js            ← Cloud Functions (API Key 보관)
│   └── package.json
├── firebase.json
├── .firebaserc
├── .gitignore
└── README.md
```

## 🔐 보안 구조

```
브라우저 (index.html)
    │
    │  POST /getRealtimeToken
    │  Header: x-app-secret: ****   ← API Key 아님!
    │
    ▼
Firebase Cloud Functions (index.js)
    │  API Key는 여기 Secret Manager에만 있음
    │
    │  POST /v1/realtime/sessions
    │  Header: Authorization: Bearer sk-proj-...
    │
    ▼
OpenAI API
    │
    │  ephemeral token (60초 수명, 1회용)
    │
    ▼
Firebase Cloud Functions
    │
    │  { token: "eph_..." }   ← API Key는 절대 반환 안 됨
    │
    ▼
브라우저 → WebRTC 연결 (ephemeral token으로)
```

## 🚀 배포 순서

### 1. Firebase 프로젝트 준비
```bash
npm install -g firebase-tools
firebase login
firebase projects:create sunny-talk-KOR
firebase use sunny-talk-KOR
```

### 2. Functions 의존성 설치
```bash
cd functions
npm install
cd ..
```

### 3. ✅ Secret 등록 (가장 중요)
```bash
# OpenAI API Key 등록
firebase functions:secrets:set OPENAI_API_KEY
# 프롬프트: sk-proj-... 입력 후 엔터

# 앱 식별 Secret 등록
firebase functions:secrets:set APP_SECRET
# 프롬프트: 임의의 문자열 입력 (예: sunnytalk-2024-secret)
```

### 4. .firebaserc 수정
```json
{
  "projects": {
    "default": "sunny-talk-KOR"    ← 본인 프로젝트 ID로 변경
  }
}
```

### 5. firebase.json CORS 도메인 수정
```javascript
// functions/index.js 상단 cors 배열에 본인 도메인 추가
cors: [
  /github\.io$/,
  /localhost:\d+$/,
  "https://yourdomain.com",    ← 본인 도메인
],
```

### 6. 배포
```bash
# Functions만 먼저 배포
firebase deploy --only functions

# 배포 완료 후 출력되는 URL 복사
# 예: https://asia-northeast1-sunny-talk-kor.cloudfunctions.net/getRealtimeToken
```

### 7. 앱 설정
1. `public/index.html` 을 GitHub Pages 또는 Firebase Hosting에 올리기
2. 앱 실행 → **관리자 설정** 탭 이동
3. Functions URL 붙여넣기
4. APP_SECRET 입력 (3번에서 설정한 값)
5. **저장** → **연결 테스트** 클릭
6. 🟢 연결됨 확인 후 사용!

## 📦 GitHub Pages 배포 (public/index.html만)

```bash
# public/index.html → GitHub repo 루트에 index.html로 복사
cp public/index.html ./index.html
git add . && git commit -m "Deploy Sunny Talk"
git push

# GitHub Settings → Pages → main branch 선택
```

## 💰 예상 비용 (월)

| 학생 수 | 일일 사용 | 월 비용 (mini 모델) |
|--------|---------|-------------------|
| 10명   | 각 1세션 | ~$15 (약 22,000원) |
| 20명   | 각 1세션 | ~$30 (약 44,000원) |
| 30명   | 각 1세션 | ~$45 (약 66,000원) |

Firebase Functions 무료 티어: 월 200만 호출 (충분)

## ⚠️ 주의사항

- `.gitignore` 에 `.env`, `.runtimeconfig.json` 포함됨 — 커밋 금지
- Secret은 Firebase Console > Functions > Secrets에서도 관리 가능
- OpenAI 계정에서 월 사용 한도 설정 권장 (Usage Limits)
- 프로덕션 전 CORS 도메인을 정확히 제한할 것
