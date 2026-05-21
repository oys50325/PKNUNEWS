# PS1 NEWS NETTER

부경대학교 사회복지학전공 `PS1 NEWS LETTER` PDF를 읽어 웹 뉴스레터로 전시하는 Vite + React 앱입니다.

## 핵심 운영 방식

- 뉴스레터 화면은 URL을 아는 누구나 볼 수 있는 공개 화면입니다.
- 로그인과 신규가입은 제작자용으로만 작게 제공합니다.
- 제작자는 `주 제작자`, `부 제작자`, `공동제작자`로 나뉩니다.
- 제작실은 승인된 제작자만 이용할 수 있습니다.
- 신규가입자는 주 제작자 또는 부 제작자가 승인한 뒤 제작실을 이용할 수 있습니다.
- 신규가입 비밀번호는 숫자 8자리이며, 학번은 2010학번부터 2050학번까지 선택합니다.
- 기본 주 제작자 계정은 이름 `PKNUNEWS`, 비밀번호 `50321004`입니다.
- 주 제작자는 승인된 공동제작자 중 최대 3명을 부 제작자로 지정할 수 있습니다.
- 제작자 승인은 주 제작자와 부 제작자만 할 수 있습니다.
- 강제 탈퇴는 주 제작자만 할 수 있습니다.
- 공동제작자는 비밀번호 찾기 요청을 보낼 수 있고, 주 제작자는 요청한 제작자의 비밀번호만 확인할 수 있습니다.
- 제작자가 PDF를 첨부하면 브라우저 안에서 PDF.js로 텍스트와 페이지 이미지를 추출합니다.
- 원본 PDF는 기본적으로 Firebase Storage에 올리지 않습니다.
- 최종 승인 시 Firestore에는 제목, 호수, 월, 영역별 요약 데이터만 저장합니다.
- Storage에는 압축 JPEG 페이지 이미지만 저장합니다.
- 지난 호는 `지난 뉴스레터 보기` 기록실에서 불러옵니다.

## 뉴스레터 영역

- 전공소식
- 교수동정
- 대학원 소식
- 월별 전공 일정
- 복 들어오는 인터뷰
- 알기 쉬운 사회복지 정보통

## 로컬 실행

```bash
npm install
npm run dev
```

## Firebase 연결

Firebase 콘솔의 `ps1news` 프로젝트에서 웹 앱을 만든 뒤 `.env.example`을 `.env`로 복사하고 값을 채우세요.

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=ps1news.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ps1news
VITE_FIREBASE_STORAGE_BUCKET=ps1news.appspot.com
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_DATABASE_URL=https://ps1news-default-rtdb.firebaseio.com/
```

`VITE_FIREBASE_DATABASE_URL`은 가입자 목록, 승인 상태, 부관리자 지정, 비밀번호 확인 요청을 Realtime Database에 저장하는 데 사용합니다.

현재는 정적 Vercel 배포에서 바로 동작하도록 Realtime Database 규칙을 공개 읽기/쓰기로 두었습니다. 실제 운영 보안을 강화하려면 Firebase Auth나 서버 함수를 붙여 관리자 작업만 제한하는 방식으로 바꾸는 것이 좋습니다.

Firebase Auth에서 관리자 이메일/비밀번호 계정을 하나 만든 뒤 로그인하면 게재와 삭제가 가능합니다.

## 배포

Vercel에서는 GitHub 저장소 `https://github.com/oys50325/PKNUNEWS`를 연결하고 아래처럼 설정하면 됩니다.

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

Firebase Hosting을 쓸 경우:

```bash
firebase login
firebase use ps1news
firebase deploy
```

## 사용량 최소화 메모

- 방문자 첫 화면에서는 PDF.js를 받지 않습니다. PDF 첨부 시에만 별도 청크로 로드됩니다.
- Firebase SDK도 실제 연결 함수가 필요할 때 동적으로 로드됩니다.
- 원본 PDF는 저장하지 않는 구조라 승인 후 삭제할 파일 자체가 남지 않습니다.
- 페이지 이미지는 JPEG 품질 `0.72`, 렌더 스케일 `1.15`로 압축합니다.
- Storage 이미지에는 장기 캐시 헤더를 적용합니다.
