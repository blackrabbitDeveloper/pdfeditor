import { deletePages, duplicatePages, movePages, rotatePages } from './page-operations.js';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs';

const { PDFDocument, degrees } = window.PDFLib;
const elements = {
  welcome: document.getElementById('welcome'),
  workspace: document.getElementById('workspace'),
  dropzone: document.getElementById('dropzone'),
  openButton: document.getElementById('open-button'),
  addButton: document.getElementById('add-button'),
  appendCard: document.getElementById('append-card'),
  fileInput: document.getElementById('file-input'),
  saveButton: document.getElementById('save-button'),
  filename: document.getElementById('filename'),
  pageSummary: document.getElementById('page-summary'),
  selectionStatus: document.getElementById('selection-status'),
  pageGrid: document.getElementById('page-grid'),
  rotateLeft: document.getElementById('rotate-left'),
  rotateRight: document.getElementById('rotate-right'),
  duplicate: document.getElementById('duplicate'),
  delete: document.getElementById('delete'),
  selectAll: document.getElementById('select-all'),
  zoom: document.getElementById('zoom'),
  pageViewer: document.getElementById('page-viewer'),
  viewerTitle: document.getElementById('viewer-title'),
  viewerCanvas: document.getElementById('viewer-canvas'),
  viewerStage: document.getElementById('viewer-stage'),
  viewerClose: document.getElementById('viewer-close'),
  viewerPrev: document.getElementById('viewer-prev'),
  viewerNext: document.getElementById('viewer-next'),
  viewerZoomOut: document.getElementById('viewer-zoom-out'),
  viewerZoomIn: document.getElementById('viewer-zoom-in'),
  viewerZoomLabel: document.getElementById('viewer-zoom-label'),
  viewerPageStatus: document.getElementById('viewer-page-status'),
  viewerSource: document.getElementById('viewer-source'),
  loading: document.getElementById('loading'),
  loadingText: document.getElementById('loading-text'),
  toast: document.getElementById('toast')
};

const state = {
  sources: new Map(),
  pages: [],
  selected: new Set(),
  lastSelected: null,
  nextId: 1,
  nextSourceId: 1,
  filename: 'document.pdf',
  draggingIds: [],
  viewerIndex: -1,
  viewerZoom: 100,
  viewerRenderToken: 0,
  viewerRenderTask: null
};

let toastTimer;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function setLoading(active, message = 'PDF를 준비하고 있어요') {
  elements.loading.hidden = !active;
  elements.loadingText.textContent = message;
}

function makeId() {
  return state.nextId++;
}

function updateControls() {
  const count = state.selected.size;
  const hasSelection = count > 0;
  [elements.rotateLeft, elements.rotateRight, elements.duplicate, elements.delete]
    .forEach(button => { button.disabled = !hasSelection; });
  elements.saveButton.disabled = state.pages.length === 0;
  elements.pageSummary.textContent = `${state.pages.length} 페이지 · ${state.sources.size}개 파일`;
  elements.selectionStatus.textContent = hasSelection
    ? `${count}개 페이지 선택됨`
    : '페이지를 선택해 편집하세요';
}

async function addFiles(fileList) {
  const files = [...fileList].filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
  if (!files.length) {
    showToast('PDF 파일을 선택해 주세요.');
    return;
  }

  setLoading(true, files.length > 1 ? `${files.length}개 PDF를 불러오고 있어요` : 'PDF를 불러오고 있어요');
  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sourceId = state.nextSourceId++;
      const preview = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      state.sources.set(sourceId, { id: sourceId, name: file.name, bytes, preview });
      for (let pageIndex = 0; pageIndex < preview.numPages; pageIndex++) {
        state.pages.push({ id: makeId(), sourceId, sourcePageIndex: pageIndex, rotation: 0 });
      }
      if (state.sources.size === 1) state.filename = file.name.replace(/\.pdf$/i, '') + '-edited.pdf';
    }
    elements.filename.textContent = state.filename;
    elements.welcome.hidden = true;
    elements.workspace.hidden = false;
    state.selected.clear();
    await renderPages();
    showToast(`${files.length}개 PDF를 추가했습니다.`);
  } catch (error) {
    console.error(error);
    showToast('PDF를 열 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인해 주세요.');
  } finally {
    elements.fileInput.value = '';
    setLoading(false);
  }
}

async function renderThumbnail(entry, canvas, sheet) {
  const source = state.sources.get(entry.sourceId);
  const page = await source.preview.getPage(entry.sourcePageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate + entry.rotation });
  const scale = Math.min(2, 320 / baseViewport.width);
  const viewport = page.getViewport({ scale, rotation: page.rotate + entry.rotation });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  sheet.style.setProperty('--ratio', `${viewport.width} / ${viewport.height}`);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
}

async function renderPages() {
  elements.pageGrid.textContent = '';
  const fragment = document.createDocumentFragment();
  const jobs = [];

  state.pages.forEach((entry, index) => {
    const card = document.createElement('article');
    card.className = `page-card${state.selected.has(entry.id) ? ' selected' : ''}`;
    card.draggable = true;
    card.dataset.id = entry.id;
    card.innerHTML = '<span class="selection-check">✓</span><button class="preview-page" type="button" aria-label="이 페이지 크게 보기">크게 보기</button><div class="page-sheet"><canvas></canvas></div><span class="page-number"></span>';
    card.querySelector('.page-number').textContent = `${index + 1}`;
    const sheet = card.querySelector('.page-sheet');
    jobs.push(renderThumbnail(entry, card.querySelector('canvas'), sheet).catch(error => console.error(error)));
    fragment.append(card);
  });
  elements.pageGrid.append(fragment);
  updateControls();
  await Promise.all(jobs);
}

async function renderViewerPage() {
  const entry = state.pages[state.viewerIndex];
  if (!entry) return;
  const renderToken = ++state.viewerRenderToken;
  const source = state.sources.get(entry.sourceId);
  const page = await source.preview.getPage(entry.sourcePageIndex + 1);
  const zoomScale = 1.35 * state.viewerZoom / 100;
  const viewport = page.getViewport({ scale: zoomScale, rotation: page.rotate + entry.rotation });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = elements.viewerCanvas;
  canvas.width = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  if (state.viewerRenderTask) state.viewerRenderTask.cancel();
  const context = canvas.getContext('2d');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  state.viewerRenderTask = page.render({ canvasContext: context, viewport });
  try {
    await state.viewerRenderTask.promise;
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') throw error;
    return;
  } finally {
    if (renderToken === state.viewerRenderToken) state.viewerRenderTask = null;
  }
  if (renderToken !== state.viewerRenderToken) return;
  elements.viewerTitle.textContent = `페이지 ${state.viewerIndex + 1}`;
  elements.viewerPageStatus.textContent = `${state.viewerIndex + 1} / ${state.pages.length}`;
  elements.viewerSource.textContent = source.name;
  elements.viewerZoomLabel.textContent = `${state.viewerZoom}%`;
  elements.viewerPrev.disabled = state.viewerIndex === 0;
  elements.viewerNext.disabled = state.viewerIndex === state.pages.length - 1;
}

async function openViewer(index) {
  state.viewerIndex = index;
  state.viewerZoom = 100;
  elements.pageViewer.hidden = false;
  document.body.classList.add('viewer-open');
  elements.viewerClose.focus();
  await renderViewerPage();
}

function closeViewer() {
  state.viewerRenderToken++;
  if (state.viewerRenderTask) state.viewerRenderTask.cancel();
  state.viewerRenderTask = null;
  state.viewerIndex = -1;
  elements.pageViewer.hidden = true;
  document.body.classList.remove('viewer-open');
}

async function changeViewerPage(amount) {
  const nextIndex = Math.max(0, Math.min(state.pages.length - 1, state.viewerIndex + amount));
  if (nextIndex === state.viewerIndex) return;
  state.viewerIndex = nextIndex;
  elements.viewerStage.scrollTo(0, 0);
  await renderViewerPage();
}

async function changeViewerZoom(amount) {
  const nextZoom = Math.max(50, Math.min(200, state.viewerZoom + amount));
  if (nextZoom === state.viewerZoom) return;
  state.viewerZoom = nextZoom;
  await renderViewerPage();
}

function refreshSelection() {
  elements.pageGrid.querySelectorAll('.page-card').forEach(card => {
    card.classList.toggle('selected', state.selected.has(Number(card.dataset.id)));
  });
  updateControls();
}

function selectPage(id, event) {
  const index = state.pages.findIndex(page => page.id === id);
  if (event.shiftKey && state.lastSelected !== null) {
    const lastIndex = state.pages.findIndex(page => page.id === state.lastSelected);
    const [start, end] = [index, lastIndex].sort((a, b) => a - b);
    if (!event.ctrlKey && !event.metaKey) state.selected.clear();
    state.pages.slice(start, end + 1).forEach(page => state.selected.add(page.id));
  } else if (event.ctrlKey || event.metaKey) {
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  } else {
    state.selected.clear();
    state.selected.add(id);
  }
  state.lastSelected = id;
  refreshSelection();
}

async function applyOperation(operation, message) {
  state.pages = operation(state.pages, [...state.selected]);
  state.selected.clear();
  state.lastSelected = null;
  await renderPages();
  showToast(message);
}

async function savePdf() {
  if (!state.pages.length) return;
  setLoading(true, '새 PDF를 만들고 있어요');
  try {
    const output = await PDFDocument.create();
    const loaded = new Map();
    for (const source of state.sources.values()) {
      loaded.set(source.id, await PDFDocument.load(source.bytes.slice(), { ignoreEncryption: false }));
    }
    for (const entry of state.pages) {
      const sourceDocument = loaded.get(entry.sourceId);
      const [page] = await output.copyPages(sourceDocument, [entry.sourcePageIndex]);
      const originalRotation = page.getRotation().angle || 0;
      page.setRotation(degrees(((originalRotation + entry.rotation) % 360 + 360) % 360));
      output.addPage(page);
    }
    const bytes = await output.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('편집한 PDF를 저장했습니다.');
  } catch (error) {
    console.error(error);
    showToast('PDF 저장 중 문제가 생겼습니다.');
  } finally {
    setLoading(false);
  }
}

function openPicker() { elements.fileInput.click(); }

elements.openButton.addEventListener('click', openPicker);
elements.addButton.addEventListener('click', openPicker);
elements.appendCard.addEventListener('click', openPicker);
elements.dropzone.addEventListener('click', openPicker);
elements.dropzone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') openPicker();
});
elements.fileInput.addEventListener('change', event => addFiles(event.target.files));

for (const type of ['dragenter', 'dragover']) {
  document.addEventListener(type, event => {
    if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
  });
}
elements.dropzone.addEventListener('dragenter', () => elements.dropzone.classList.add('dragging'));
elements.dropzone.addEventListener('dragleave', () => elements.dropzone.classList.remove('dragging'));
elements.dropzone.addEventListener('drop', event => {
  event.preventDefault();
  elements.dropzone.classList.remove('dragging');
  addFiles(event.dataTransfer.files);
});
document.addEventListener('drop', event => {
  if (!elements.workspace.hidden && event.dataTransfer.files.length) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }
});

elements.pageGrid.addEventListener('click', event => {
  const card = event.target.closest('.page-card');
  if (!card) return;
  if (event.target.closest('.preview-page')) {
    openViewer([...elements.pageGrid.children].indexOf(card));
    return;
  }
  selectPage(Number(card.dataset.id), event);
});
elements.pageGrid.addEventListener('dblclick', event => {
  const card = event.target.closest('.page-card');
  if (card) openViewer([...elements.pageGrid.children].indexOf(card));
});
elements.pageGrid.addEventListener('dragstart', event => {
  const card = event.target.closest('.page-card');
  if (!card) return;
  const id = Number(card.dataset.id);
  if (!state.selected.has(id)) {
    state.selected.clear();
    state.selected.add(id);
    refreshSelection();
  }
  state.draggingIds = state.pages.filter(page => state.selected.has(page.id)).map(page => page.id);
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
});
elements.pageGrid.addEventListener('dragover', event => {
  const card = event.target.closest('.page-card');
  if (!card) return;
  event.preventDefault();
  elements.pageGrid.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
  card.classList.add('drag-over');
});
elements.pageGrid.addEventListener('drop', async event => {
  const card = event.target.closest('.page-card');
  if (!card) return;
  event.preventDefault();
  state.pages = movePages(state.pages, state.draggingIds, Number(card.dataset.id));
  await renderPages();
});
elements.pageGrid.addEventListener('dragend', () => {
  state.draggingIds = [];
  elements.pageGrid.querySelectorAll('.dragging, .drag-over').forEach(item => item.classList.remove('dragging', 'drag-over'));
});

elements.rotateLeft.addEventListener('click', () => applyOperation((pages, ids) => rotatePages(pages, ids, -90), '선택 페이지를 왼쪽으로 돌렸습니다.'));
elements.rotateRight.addEventListener('click', () => applyOperation((pages, ids) => rotatePages(pages, ids, 90), '선택 페이지를 오른쪽으로 돌렸습니다.'));
elements.duplicate.addEventListener('click', () => applyOperation((pages, ids) => duplicatePages(pages, ids, makeId), '선택 페이지를 복제했습니다.'));
elements.delete.addEventListener('click', () => {
  if (state.selected.size === state.pages.length) {
    showToast('문서에는 한 페이지 이상이 필요합니다.');
    return;
  }
  applyOperation(deletePages, '선택 페이지를 삭제했습니다.');
});
elements.selectAll.addEventListener('click', () => {
  state.pages.forEach(page => state.selected.add(page.id));
  refreshSelection();
});
elements.zoom.addEventListener('input', event => elements.pageGrid.style.setProperty('--thumb-width', `${event.target.value}px`));
elements.saveButton.addEventListener('click', savePdf);
elements.viewerClose.addEventListener('click', closeViewer);
elements.viewerPrev.addEventListener('click', () => changeViewerPage(-1));
elements.viewerNext.addEventListener('click', () => changeViewerPage(1));
elements.viewerZoomOut.addEventListener('click', () => changeViewerZoom(-25));
elements.viewerZoomIn.addEventListener('click', () => changeViewerZoom(25));
elements.pageViewer.addEventListener('click', event => {
  if (event.target === elements.pageViewer) closeViewer();
});
document.addEventListener('keydown', event => {
  if (!elements.pageViewer.hidden) {
    if (event.key === 'Escape') closeViewer();
    if (event.key === 'ArrowLeft') changeViewerPage(-1);
    if (event.key === 'ArrowRight') changeViewerPage(1);
    if (event.key === '+' || event.key === '=') changeViewerZoom(25);
    if (event.key === '-') changeViewerZoom(-25);
    return;
  }
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === 'a' && !elements.workspace.hidden) {
    event.preventDefault();
    state.pages.forEach(page => state.selected.add(page.id));
    refreshSelection();
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected.size && event.target === document.body) {
    event.preventDefault();
    elements.delete.click();
  }
});
