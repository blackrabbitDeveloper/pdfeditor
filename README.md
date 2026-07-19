# PDF Editor

브라우저에서 PDF 페이지를 재정렬하고, 회전하고, 합쳐서 새 파일로 저장하는 정적 웹 도구입니다. 파일은 서버로 업로드되지 않고 현재 브라우저 안에서만 처리됩니다.

## 주요 기능

- PDF 여러 개 열기 및 병합
- 페이지 썸네일 다중 선택
- 드래그 재정렬
- 페이지 회전, 복제, 삭제
- 편집 결과를 새 PDF로 저장
- 모바일 반응형 UI

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 <http://localhost:8000>을 엽니다.

## 테스트

```bash
npm test
npm run test:e2e
```

`test:e2e`는 로컬 Chrome을 이용해 PDF 불러오기부터 저장 결과 검증까지 수행합니다. Chrome 경로가 다르면 `CHROME_PATH` 환경 변수를 지정할 수 있습니다.

## 배포

GitHub 저장소의 **Settings → Pages**에서 **Deploy from a branch**, `main`, `/(root)`를 선택합니다.

배포 주소: <https://blackrabbitdeveloper.github.io/pdfeditor/>

## 사용 라이브러리

- [PDF.js](https://github.com/mozilla/pdf.js) — 미리보기 렌더링
- [pdf-lib](https://github.com/Hopding/pdf-lib) — PDF 문서 생성 및 편집

상세 제품 범위는 [제품 기획 문서](docs/product-plan.md)를 참고하세요.
