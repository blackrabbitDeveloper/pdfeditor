<div align="center">

# PDF Editor

PDF 페이지를 정리하고 편집한 결과를 새 파일로 저장합니다.

[![Open App](https://img.shields.io/badge/Open_App-E8795A?style=for-the-badge&logo=googlechrome&logoColor=white)](https://blackrabbitdeveloper.github.io/pdfeditor/)
[![Tests](https://img.shields.io/badge/Tests-5_passing-248A5A?style=for-the-badge)](#테스트)

</div>

> PDF는 기기 밖으로 나가지 않으며 현재 브라우저 안에서만 처리됩니다.

## 주요 기능

- 여러 PDF 열기 및 병합
- 페이지 선택, 이동, 회전, 복제, 삭제
- 텍스트, 워터마크, 페이지 번호 추가
- 이미지와 서명 배치
- 실행 취소 및 다시 실행
- 편집 결과를 새 PDF로 저장
- Dark/Light 공통 테마와 모바일 UI

## 사용법

1. [PDF Editor](https://blackrabbitdeveloper.github.io/pdfeditor/)를 엽니다.
2. PDF를 끌어 놓거나 파일 선택 버튼으로 추가합니다.
3. 페이지 순서와 필요한 요소를 편집합니다.
4. **PDF 저장**으로 결과를 내려받습니다.

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

## 기술

- Vanilla HTML, CSS, JavaScript
- PDF.js, pdf-lib
- GitHub Pages

## 개인정보

불러온 PDF와 편집 결과는 별도 서버에 업로드되지 않습니다.

## 라이선스

저장소의 라이선스 정책을 따릅니다.
