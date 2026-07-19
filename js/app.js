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
  viewerOverlay: document.getElementById('viewer-overlay'),
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
  toast: document.getElementById('toast'),
  undo: document.getElementById('undo'), redo: document.getElementById('redo'),
  addText: document.getElementById('add-text'), addWatermark: document.getElementById('add-watermark'),
  addPageNumbers: document.getElementById('add-page-numbers'), addImage: document.getElementById('add-image'),
  addSignature: document.getElementById('add-signature'), imageInput: document.getElementById('image-input'),
  textDialog: document.getElementById('text-dialog'), watermarkDialog: document.getElementById('watermark-dialog'),
  numberDialog: document.getElementById('number-dialog'), signatureDialog: document.getElementById('signature-dialog'),
  signaturePad: document.getElementById('signature-pad')
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
  viewerRenderTask: null,
  annotations: [],
  pageNumbers: null,
  undoStack: [],
  redoStack: [],
  overlayHitboxes: [],
  selectedAnnotationId: null,
  draggingAnnotationId: null
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

function snapshot() {
  return structuredClone({ pages: state.pages, annotations: state.annotations, pageNumbers: state.pageNumbers });
}

function pushHistory() {
  state.undoStack.push(snapshot());
  if (state.undoStack.length > 30) state.undoStack.shift();
  state.redoStack = [];
  updateHistoryControls();
}

function updateHistoryControls() {
  elements.undo.disabled = state.undoStack.length === 0;
  elements.redo.disabled = state.redoStack.length === 0;
}

async function restoreHistory(from, to) {
  if (!from.length) return;
  to.push(snapshot());
  const restored = from.pop();
  state.pages = restored.pages;
  state.annotations = restored.annotations;
  state.pageNumbers = restored.pageNumbers;
  state.selected.clear();
  await renderPages();
  if (!elements.pageViewer.hidden) await renderViewerPage();
  updateHistoryControls();
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

function targetsPage(annotation, entry) {
  return !annotation.pageIds || annotation.pageIds.includes(entry.id);
}

function positionPoint(position, width, height, margin = 34) {
  const map = {
    'top-left': [margin, margin], 'top-center': [width / 2, margin],
    center: [width / 2, height / 2], 'bottom-left': [margin, height - margin],
    'bottom-center': [width / 2, height - margin], 'bottom-right': [width - margin, height - margin]
  };
  return map[position] || map.center;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function drawOverlay(context, width, height, entry, pageIndex, scale = 1, interactive = false) {
  context.clearRect(0, 0, width, height);
  const hitboxes = [];
  for (const annotation of state.annotations) {
    if (!targetsPage(annotation, entry)) continue;
    context.save();
    context.globalAlpha = annotation.opacity ?? 1;
    if (annotation.type === 'text' || annotation.type === 'watermark') {
      const [x, y] = positionPoint(annotation.position, width, height, 34 * scale);
      context.translate(x, y);
      context.rotate((annotation.rotation || 0) * Math.PI / 180);
      context.fillStyle = annotation.color;
      context.font = `600 ${annotation.size * scale}px "Noto Sans KR", sans-serif`;
      context.textAlign = annotation.position?.includes('left') ? 'left' : annotation.position?.includes('right') ? 'right' : 'center';
      context.textBaseline = annotation.position?.startsWith('top') ? 'top' : annotation.position?.startsWith('bottom') ? 'bottom' : 'middle';
      annotation.text.split('\n').forEach((line, lineIndex, lines) => {
        context.fillText(line, 0, (lineIndex - (lines.length - 1) / 2) * annotation.size * scale * 1.25);
      });
    } else if (annotation.type === 'image') {
      const image = await loadImage(annotation.dataUrl);
      const targetWidth = width * annotation.width;
      const targetHeight = targetWidth * image.height / image.width;
      const point = positionPoint(annotation.position, width, height, 34 * scale);
      const x = annotation.x == null ? point[0] : annotation.x * width;
      let y = annotation.y == null ? point[1] : annotation.y * height;
      if (annotation.y == null && annotation.position.startsWith('top')) y += targetHeight / 2;
      if (annotation.y == null && annotation.position.startsWith('bottom')) y -= targetHeight / 2;
      context.drawImage(image, x - targetWidth / 2, y - targetHeight / 2, targetWidth, targetHeight);
      const box = { id: annotation.id, x: x - targetWidth / 2, y: y - targetHeight / 2, width: targetWidth, height: targetHeight };
      hitboxes.push(box);
      if (interactive && annotation.id === state.selectedAnnotationId) {
        context.save();
        context.globalAlpha = 1;
        context.strokeStyle = '#ff5b3d';
        context.lineWidth = Math.max(2, 2 * scale);
        context.setLineDash([7 * scale, 5 * scale]);
        context.strokeRect(box.x, box.y, box.width, box.height);
        context.restore();
      }
    }
    context.restore();
  }
  if (state.pageNumbers) {
    const number = state.pageNumbers.start + pageIndex;
    const label = state.pageNumbers.format === 'total' ? `${number} / ${state.pages.length}` : state.pageNumbers.format === 'page' ? `Page ${number}` : `${number}`;
    const [x, y] = positionPoint(state.pageNumbers.position, width, height, 22 * scale);
    context.save();
    context.fillStyle = '#3b3934';
    context.font = `500 ${state.pageNumbers.size * scale}px "Noto Sans KR", sans-serif`;
    context.textAlign = state.pageNumbers.position.includes('left') ? 'left' : state.pageNumbers.position.includes('right') ? 'right' : 'center';
    context.textBaseline = 'bottom';
    context.fillText(label, x, y);
    context.restore();
  }
  return hitboxes;
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
  const overlay = elements.viewerOverlay;
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  overlay.style.width = canvas.style.width;
  overlay.style.height = canvas.style.height;
  state.overlayHitboxes = await drawOverlay(overlay.getContext('2d'), overlay.width, overlay.height, entry, state.viewerIndex, zoomScale * pixelRatio, true);
  overlay.dataset.hitboxes = JSON.stringify(state.overlayHitboxes);
  overlay.classList.toggle('has-movable', state.overlayHitboxes.length > 0);
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
  state.selectedAnnotationId = null;
  state.draggingAnnotationId = null;
  state.overlayHitboxes = [];
  elements.pageViewer.hidden = true;
  document.body.classList.remove('viewer-open');
}

async function redrawViewerOverlay() {
  if (state.viewerIndex < 0) return;
  const entry = state.pages[state.viewerIndex];
  const overlay = elements.viewerOverlay;
  const canvas = elements.viewerCanvas;
  const scale = canvas.width / Math.max(1, parseFloat(canvas.style.width));
  const viewportScale = 1.35 * state.viewerZoom / 100 * scale;
  state.overlayHitboxes = await drawOverlay(overlay.getContext('2d'), overlay.width, overlay.height, entry, state.viewerIndex, viewportScale, true);
  overlay.dataset.hitboxes = JSON.stringify(state.overlayHitboxes);
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
  pushHistory();
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
    for (const [outputIndex, entry] of state.pages.entries()) {
      const sourceDocument = loaded.get(entry.sourceId);
      const [page] = await output.copyPages(sourceDocument, [entry.sourcePageIndex]);
      const originalRotation = page.getRotation().angle || 0;
      const rotation = ((originalRotation + entry.rotation) % 360 + 360) % 360;
      page.setRotation(degrees(rotation));
      output.addPage(page);
      if (state.annotations.some(annotation => targetsPage(annotation, entry)) || state.pageNumbers) {
        const rawWidth = page.getWidth();
        const rawHeight = page.getHeight();
        const visibleWidth = rotation % 180 ? rawHeight : rawWidth;
        const visibleHeight = rotation % 180 ? rawWidth : rawHeight;
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = Math.ceil(visibleWidth * 2);
        overlayCanvas.height = Math.ceil(visibleHeight * 2);
        await drawOverlay(overlayCanvas.getContext('2d'), overlayCanvas.width, overlayCanvas.height, entry, outputIndex, 2);
        const blob = await new Promise(resolve => overlayCanvas.toBlob(resolve, 'image/png'));
        const overlayImage = await output.embedPng(await blob.arrayBuffer());
        const placement = rotation === 90 ? { x: 0, y: rawHeight, width: rawHeight, height: rawWidth, rotate: degrees(-90) }
          : rotation === 180 ? { x: rawWidth, y: rawHeight, width: rawWidth, height: rawHeight, rotate: degrees(180) }
          : rotation === 270 ? { x: rawWidth, y: 0, width: rawHeight, height: rawWidth, rotate: degrees(90) }
          : { x: 0, y: 0, width: rawWidth, height: rawHeight };
        page.drawImage(overlayImage, placement);
      }
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
  pushHistory();
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
elements.undo.addEventListener('click', () => restoreHistory(state.undoStack, state.redoStack));
elements.redo.addEventListener('click', () => restoreHistory(state.redoStack, state.undoStack));

function targetPageIds(allPages) {
  if (allPages) return null;
  if (state.viewerIndex >= 0) return [state.pages[state.viewerIndex].id];
  if (state.selected.size) return [...state.selected];
  return state.pages[0] ? [state.pages[0].id] : [];
}

async function addAnnotation(annotation, message) {
  pushHistory();
  state.annotations.push({ id: makeId(), ...annotation });
  if (elements.pageViewer.hidden) {
    const targetId = annotation.pageIds?.[0];
    const index = targetId ? state.pages.findIndex(page => page.id === targetId) : 0;
    await openViewer(Math.max(0, index));
  } else {
    await renderViewerPage();
  }
  showToast(message);
}

elements.addText.addEventListener('click', () => elements.textDialog.showModal());
elements.addWatermark.addEventListener('click', () => elements.watermarkDialog.showModal());
elements.addPageNumbers.addEventListener('click', () => elements.numberDialog.showModal());
elements.addImage.addEventListener('click', () => elements.imageInput.click());
elements.addSignature.addEventListener('click', () => elements.signatureDialog.showModal());
document.getElementById('watermark-opacity').addEventListener('input', event => {
  document.getElementById('watermark-opacity-label').textContent = `${event.target.value}%`;
});
document.getElementById('watermark-rotation').addEventListener('input', event => {
  document.getElementById('watermark-rotation-label').textContent = `${event.target.value}°`;
});
document.getElementById('text-apply').addEventListener('click', event => {
  const text = document.getElementById('text-content').value.trim();
  if (!text) { event.preventDefault(); showToast('추가할 텍스트를 입력해 주세요.'); return; }
  addAnnotation({ type: 'text', text, size: Number(document.getElementById('text-size').value), color: document.getElementById('text-color').value, opacity: 1, rotation: 0, position: document.getElementById('text-position').value, pageIds: targetPageIds(document.getElementById('text-all-pages').checked) }, '텍스트를 추가했습니다.');
});
document.getElementById('watermark-apply').addEventListener('click', event => {
  const text = document.getElementById('watermark-text').value.trim();
  if (!text) { event.preventDefault(); showToast('워터마크 텍스트를 입력해 주세요.'); return; }
  addAnnotation({ type: 'watermark', text, size: Number(document.getElementById('watermark-size').value), color: document.getElementById('watermark-color').value, opacity: Number(document.getElementById('watermark-opacity').value) / 100, rotation: Number(document.getElementById('watermark-rotation').value), position: 'center', pageIds: targetPageIds(document.getElementById('watermark-all-pages').checked) }, '워터마크를 추가했습니다.');
});
document.getElementById('number-apply').addEventListener('click', () => {
  pushHistory();
  state.pageNumbers = { start: Number(document.getElementById('number-start').value), size: Number(document.getElementById('number-size').value), format: document.getElementById('number-format').value, position: document.getElementById('number-position').value };
  if (!elements.pageViewer.hidden) renderViewerPage();
  showToast('페이지 번호를 적용했습니다.');
});
document.getElementById('number-remove').addEventListener('click', () => {
  if (!state.pageNumbers) return;
  pushHistory(); state.pageNumbers = null;
  if (!elements.pageViewer.hidden) renderViewerPage();
  showToast('페이지 번호를 제거했습니다.');
});
elements.imageInput.addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => addAnnotation({ type: 'image', dataUrl: reader.result, width: .32, opacity: 1, position: 'center', x: .5, y: .5, pageIds: targetPageIds(false) }, '이미지·도장을 추가했습니다. 페이지 안에서 드래그해 위치를 조정하세요.');
  reader.readAsDataURL(file);
  event.target.value = '';
});

const signatureContext = elements.signaturePad.getContext('2d');
signatureContext.lineWidth = 4;
signatureContext.lineCap = 'round';
signatureContext.strokeStyle = '#171717';
let signing = false;
function signaturePoint(event) {
  const rect = elements.signaturePad.getBoundingClientRect();
  return [(event.clientX - rect.left) * elements.signaturePad.width / rect.width, (event.clientY - rect.top) * elements.signaturePad.height / rect.height];
}
elements.signaturePad.addEventListener('pointerdown', event => {
  signing = true; elements.signaturePad.setPointerCapture(event.pointerId);
  const [x, y] = signaturePoint(event); signatureContext.beginPath(); signatureContext.moveTo(x, y);
});
elements.signaturePad.addEventListener('pointermove', event => {
  if (!signing) return; const [x, y] = signaturePoint(event); signatureContext.lineTo(x, y); signatureContext.stroke();
});
elements.signaturePad.addEventListener('pointerup', () => { signing = false; });
document.getElementById('signature-clear').addEventListener('click', event => { event.preventDefault(); signatureContext.clearRect(0, 0, elements.signaturePad.width, elements.signaturePad.height); });
document.getElementById('signature-apply').addEventListener('click', () => {
  addAnnotation({ type: 'image', dataUrl: elements.signaturePad.toDataURL('image/png'), width: .32, opacity: 1, position: 'bottom-center', x: .5, y: .65, pageIds: targetPageIds(false) }, '서명을 추가했습니다. 페이지 안에서 드래그해 위치를 조정하세요.');
  signatureContext.clearRect(0, 0, elements.signaturePad.width, elements.signaturePad.height);
});

function overlayPoint(event) {
  const rect = elements.viewerOverlay.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * elements.viewerOverlay.width / rect.width,
    y: (event.clientY - rect.top) * elements.viewerOverlay.height / rect.height
  };
}
elements.viewerOverlay.addEventListener('pointerdown', event => {
  const point = overlayPoint(event);
  const hit = [...state.overlayHitboxes].reverse().find(box => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
  state.selectedAnnotationId = hit?.id ?? null;
  if (!hit) { redrawViewerOverlay(); return; }
  pushHistory();
  state.draggingAnnotationId = hit.id;
  elements.viewerOverlay.classList.add('dragging');
  elements.viewerOverlay.setPointerCapture(event.pointerId);
  redrawViewerOverlay();
});
elements.viewerOverlay.addEventListener('pointermove', event => {
  if (!state.draggingAnnotationId) return;
  const point = overlayPoint(event);
  const annotation = state.annotations.find(item => item.id === state.draggingAnnotationId);
  const box = state.overlayHitboxes.find(item => item.id === state.draggingAnnotationId);
  if (!annotation || !box) return;
  const halfWidth = box.width / elements.viewerOverlay.width / 2;
  const halfHeight = box.height / elements.viewerOverlay.height / 2;
  annotation.x = Math.max(halfWidth, Math.min(1 - halfWidth, point.x / elements.viewerOverlay.width));
  annotation.y = Math.max(halfHeight, Math.min(1 - halfHeight, point.y / elements.viewerOverlay.height));
  redrawViewerOverlay();
});
elements.viewerOverlay.addEventListener('pointerup', event => {
  if (!state.draggingAnnotationId) return;
  state.draggingAnnotationId = null;
  elements.viewerOverlay.classList.remove('dragging');
  if (elements.viewerOverlay.hasPointerCapture(event.pointerId)) elements.viewerOverlay.releasePointerCapture(event.pointerId);
  showToast('위치를 변경했습니다.');
});
elements.viewerClose.addEventListener('click', closeViewer);
elements.viewerPrev.addEventListener('click', () => changeViewerPage(-1));
elements.viewerNext.addEventListener('click', () => changeViewerPage(1));
elements.viewerZoomOut.addEventListener('click', () => changeViewerZoom(-25));
elements.viewerZoomIn.addEventListener('click', () => changeViewerZoom(25));
elements.pageViewer.addEventListener('click', event => {
  if (event.target === elements.pageViewer) closeViewer();
});
document.addEventListener('keydown', event => {
  const historyModifier = event.ctrlKey || event.metaKey;
  if (historyModifier && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? restoreHistory(state.redoStack, state.undoStack) : restoreHistory(state.undoStack, state.redoStack);
    return;
  }
  if (historyModifier && event.key.toLowerCase() === 'y') {
    event.preventDefault(); restoreHistory(state.redoStack, state.undoStack); return;
  }
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
