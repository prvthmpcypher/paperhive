import * as pdfjsLib from './assets/vendor/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/vendor/pdf.worker.mjs';

const { jsPDF } = window.jspdf || {};
const JSZip = window.JSZip;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  fileInput: $('#pdf-file'),
  dropZone: $('#drop-zone'),
  fileMeta: $('#file-meta'),
  password: $('#pdf-password'),
  togglePassword: $('#toggle-password'),
  loadBtn: $('#load-pdf'),
  auth: $('#auth-check'),
  autoClear: $('#auto-clear'),
  status: $('#status'),
  progress: $('#progress-bar'),
  pageList: $('#page-list'),
  canvas: $('#pdf-canvas'),
  annotationLayer: $('#annotation-layer'),
  emptyView: $('#empty-view'),
  pageIndicator: $('#page-indicator'),
  prevPage: $('#prev-page'),
  nextPage: $('#next-page'),
  zoomIn: $('#zoom-in'),
  zoomOut: $('#zoom-out'),
  rotateView: $('#rotate-view'),
  downloadUnlocked: $('#download-unlocked'),
  downloadEdited: $('#download-edited'),
  downloadRange: $('#download-range'),
  imageFormat: $('#image-format'),
  exportScale: $('#export-scale'),
  exportScaleLabel: $('#export-scale-label'),
  jpegQuality: $('#jpeg-quality'),
  jpegQualityLabel: $('#jpeg-quality-label'),
  pdfToImages: $('#pdf-to-images'),
  clearBtn: $('#clear-session'),
  deletePage: $('#delete-page'),
  restorePage: $('#restore-page'),
  resetOrder: $('#reset-order'),
  editorModeButtons: $$('.mode-list button'),
  addWatermark: $('#add-watermark'),
  deleteSelected: $('#delete-selected'),
  clearPageAnn: $('#clear-page-ann'),
  clearAllAnn: $('#clear-all-ann'),
  textValue: $('#text-value'),
  textSize: $('#text-size'),
  textColor: $('#text-color'),
  boxWidth: $('#box-width'),
  boxHeight: $('#box-height'),
  signatureInput: $('#signature-input'),
  imageInput: $('#image-input'),
  imagesToPdf: $('#images-to-pdf'),
  textToPdf: $('#text-to-pdf'),
  notesText: $('#notes-text'),
  mobileMenu: $('#mobile-menu'),
  navlinks: $('#navlinks'),
  toast: $('#toast')
};

const state = {
  file: null,
  bytes: null,
  pdf: null,
  pageCount: 0,
  pageNumber: 1,
  zoom: 1.15,
  rotation: 0,
  rendering: false,
  pendingRender: false,
  annotations: new Map(),
  deletedPages: new Set(),
  pageOrder: [],
  mode: 'select',
  drawing: false,
  currentStroke: null,
  selectedAnnotation: null,
  layerDrag: null,
  draggedPageIndex: null,
  signatureDataUrl: '',
  lastRenderViewport: null
};

const PASSWORD_ERROR_CODES = new Set([1, 2]);

function setStatus(message, type = '') {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function setProgress(value) {
  els.progress.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => els.toast.classList.remove('show'), 3600);
}

function bytesToSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function safeName(name, fallback = 'paperhive-document') {
  return (name || fallback).replace(/\.pdf$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function enablePdfActions(enabled) {
  [els.downloadUnlocked, els.downloadEdited, els.pdfToImages, els.deletePage, els.restorePage, els.resetOrder].forEach(btn => {
    if (btn) btn.disabled = !enabled;
  });
  updateSelectedUI();
}

function updateSelectedUI() {
  if (els.deleteSelected) els.deleteSelected.disabled = !state.selectedAnnotation;
}

function renderFileMeta() {
  if (!state.file) {
    els.fileMeta.innerHTML = '';
    return;
  }
  els.fileMeta.innerHTML = `
    <div class="file-pill"><span>${state.file.name}</span><span>${bytesToSize(state.file.size)}</span></div>
    <div class="file-pill"><span>Processing mode</span><span>Local browser only</span></div>
  `;
}

async function handleFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('Please choose a PDF file.', 'err');
    return;
  }
  clearSession({ keepStatus: true });
  state.file = file;
  state.bytes = await file.arrayBuffer();
  renderFileMeta();
  setStatus('PDF selected. Enter a password if it is locked, confirm authorization, then load.', 'warn');
}

async function loadPdf() {
  if (!state.bytes) {
    setStatus('Upload a PDF first.', 'err');
    return;
  }
  if (!els.auth.checked) {
    setStatus('Please confirm you own this file or have permission to unlock/edit it.', 'err');
    return;
  }

  try {
    setProgress(4);
    setStatus('Opening PDF locally with offline PDF.js…');
    const data = new Uint8Array(state.bytes.slice(0));
    const loadingTask = pdfjsLib.getDocument({
      data,
      password: els.password.value || undefined,
      cMapUrl: './assets/vendor/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: './assets/vendor/standard_fonts/',
      wasmUrl: './assets/vendor/wasm/',
      useSystemFonts: true,
      stopAtErrors: false
    });
    loadingTask.onProgress = progress => {
      if (progress.total) setProgress(5 + (progress.loaded / progress.total) * 35);
    };
    state.pdf = await loadingTask.promise;
    state.pageCount = state.pdf.numPages;
    state.pageNumber = 1;
    state.annotations = new Map();
    state.deletedPages = new Set();
    state.pageOrder = Array.from({ length: state.pageCount }, (_, index) => index + 1);
    state.selectedAnnotation = null;
    buildPageList();
    enablePdfActions(true);
    setProgress(55);
    await renderCurrentPage();
    setProgress(100);
    setStatus(`Loaded ${state.pageCount} page${state.pageCount > 1 ? 's' : ''}. You can view, annotate, convert, or export an unlocked sanitized copy.`, 'ok');
    setTimeout(() => setProgress(0), 900);
  } catch (error) {
    console.error(error);
    setProgress(0);
    const isPassword = error?.name === 'PasswordException' || PASSWORD_ERROR_CODES.has(error?.code);
    if (isPassword) {
      setStatus(error?.code === 2 ? 'Incorrect password. Try again.' : 'This PDF is locked. Enter its open password and reload.', 'err');
    } else {
      setStatus(`Unable to open PDF: ${error?.message || error}`, 'err');
    }
  }
}

function buildPageList() {
  els.pageList.innerHTML = '';
  if (!state.pdf) {
    els.pageList.innerHTML = '<p class="muted">No pages loaded yet.</p>';
    return;
  }
  state.pageOrder.forEach((page, orderIndex) => {
    const btn = document.createElement('button');
    btn.className = 'page-chip';
    btn.type = 'button';
    btn.draggable = true;
    btn.dataset.page = String(page);
    btn.dataset.orderIndex = String(orderIndex);
    btn.innerHTML = `<span>Page ${page}</span><small>${state.deletedPages.has(page) ? 'Skipped' : 'Ready'}</small>`;
    btn.addEventListener('click', () => {
      state.pageNumber = page;
      state.selectedAnnotation = null;
      renderCurrentPage();
    });
    btn.addEventListener('dragstart', event => {
      state.draggedPageIndex = orderIndex;
      btn.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    });
    btn.addEventListener('dragend', () => btn.classList.remove('dragging'));
    btn.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    btn.addEventListener('drop', event => {
      event.preventDefault();
      reorderPage(state.draggedPageIndex, orderIndex);
      state.draggedPageIndex = null;
    });
    els.pageList.appendChild(btn);
  });
  updatePageUI();
}

function reorderPage(fromIndex, toIndex) {
  if (fromIndex === null || fromIndex === undefined || fromIndex === toIndex) return;
  const order = [...state.pageOrder];
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  state.pageOrder = order;
  buildPageList();
  toast('Page order updated. Export with an empty range to keep this order.');
}

function updatePageUI() {
  $$('.page-chip', els.pageList).forEach(chip => {
    const page = Number(chip.dataset.page);
    chip.classList.toggle('active', page === state.pageNumber);
    chip.classList.toggle('deleted', state.deletedPages.has(page));
    chip.querySelector('small').textContent = state.deletedPages.has(page) ? 'Skipped' : (page === state.pageNumber ? 'Open' : 'Ready');
  });
  els.pageIndicator.textContent = state.pdf ? `Page ${state.pageNumber} / ${state.pageCount}` : 'No PDF loaded';
}

async function renderCurrentPage() {
  if (!state.pdf) return;
  if (state.rendering) {
    state.pendingRender = true;
    return;
  }
  state.rendering = true;
  els.emptyView.classList.add('hidden');
  els.canvas.classList.remove('hidden');
  els.annotationLayer?.classList.remove('hidden');
  try {
    await drawPdfPageToCanvas(state.pageNumber, els.canvas, state.zoom, { includeAnnotations: false, rotation: state.rotation });
    renderAnnotationLayer();
    updatePageUI();
  } finally {
    state.rendering = false;
    if (state.pendingRender) {
      state.pendingRender = false;
      renderCurrentPage();
    }
  }
}

async function drawPdfPageToCanvas(pageNumber, canvas, scale, options = {}) {
  const page = await state.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation: options.rotation ?? state.rotation });
  const ratio = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  if (options.includeAnnotations !== false) {
    await drawAnnotationsToCanvas(ctx, pageNumber, viewport.width, viewport.height, scale);
  }
  state.lastRenderViewport = { width: viewport.width, height: viewport.height, scale };
  return { width: viewport.width, height: viewport.height, scale };
}

function getAnnotations(pageNumber) {
  if (!state.annotations.has(pageNumber)) state.annotations.set(pageNumber, []);
  return state.annotations.get(pageNumber);
}

function addAnnotation(pageNumber, annotation) {
  const saved = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), ...annotation };
  getAnnotations(pageNumber).push(saved);
  return saved;
}

function drawAnnotations(ctx, pageNumber, width, height, scale) {
  const annotations = state.annotations.get(pageNumber) || [];
  for (const ann of annotations) drawOneAnnotation(ctx, ann, width, height, scale);
}

function drawOneAnnotation(ctx, ann, width, height, scale) {
  ctx.save();
  if (ann.type === 'text') {
    ctx.font = `800 ${(ann.size || 18) * scale}px Inter, Arial, sans-serif`;
    ctx.fillStyle = ann.color || '#111827';
    ctx.textBaseline = 'top';
    ctx.fillText(ann.text || '', (ann.x || 0) * width, (ann.y || 0) * height);
  }
  if (ann.type === 'watermark') {
    ctx.translate((ann.x ?? 0.5) * width, (ann.y ?? 0.5) * height);
    ctx.rotate((-28 * Math.PI) / 180);
    ctx.globalAlpha = 0.18;
    ctx.font = `900 ${(ann.size || 44) * scale}px Inter, Arial, sans-serif`;
    ctx.fillStyle = ann.color || '#7c3aed';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ann.text || 'PaperHive', 0, 0);
  }
  if (ann.type === 'redact') {
    ctx.fillStyle = ann.color || '#111827';
    ctx.fillRect((ann.x || 0) * width, (ann.y || 0) * height, (ann.w || 0.2) * width, (ann.h || 0.08) * height);
  }
  if (ann.type === 'highlight') {
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = ann.color || '#facc15';
    ctx.fillRect((ann.x || 0) * width, (ann.y || 0) * height, (ann.w || 0.2) * width, (ann.h || 0.08) * height);
  }
  if (ann.type === 'stroke') {
    ctx.strokeStyle = ann.color || '#111827';
    ctx.lineWidth = Math.max(1.5, (ann.size || 2) * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    (ann.points || []).forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

async function drawAnnotationsToCanvas(ctx, pageNumber, width, height, scale) {
  const annotations = state.annotations.get(pageNumber) || [];
  for (const ann of annotations) {
    if (ann.type === 'image' && ann.src) {
      try {
        const img = await loadImage(ann.src);
        ctx.save();
        ctx.drawImage(img, (ann.x || 0) * width, (ann.y || 0) * height, (ann.w || 0.2) * width, (ann.h || 0.08) * height);
        ctx.restore();
      } catch (error) {
        console.warn('Could not draw image annotation', error);
      }
    } else {
      drawOneAnnotation(ctx, ann, width, height, scale);
    }
  }
}

function syncAnnotationLayerBounds() {
  if (!els.annotationLayer || els.canvas.classList.contains('hidden')) return;
  els.annotationLayer.style.left = `${els.canvas.offsetLeft}px`;
  els.annotationLayer.style.top = `${els.canvas.offsetTop}px`;
  els.annotationLayer.style.width = `${els.canvas.clientWidth}px`;
  els.annotationLayer.style.height = `${els.canvas.clientHeight}px`;
}

function layerPointerPosition(event) {
  const rect = els.annotationLayer.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  };
}

function findAnnotation(pageNumber, id) {
  return (state.annotations.get(pageNumber) || []).find(ann => ann.id === id);
}

function selectAnnotation(id) {
  state.selectedAnnotation = id ? { page: state.pageNumber, id } : null;
  updateSelectedUI();
  renderAnnotationLayer();
}

function renderAnnotationLayer() {
  if (!els.annotationLayer || !state.pdf) return;
  syncAnnotationLayerBounds();
  const layer = els.annotationLayer;
  const width = layer.clientWidth || 1;
  const height = layer.clientHeight || 1;
  layer.innerHTML = '';
  const annotations = state.annotations.get(state.pageNumber) || [];
  for (const ann of annotations) {
    const node = createAnnotationNode(ann, width, height);
    if (node) layer.appendChild(node);
  }
  updateSelectedUI();
}

function createAnnotationNode(ann, width, height) {
  const selected = state.selectedAnnotation?.page === state.pageNumber && state.selectedAnnotation?.id === ann.id;
  if (ann.type === 'stroke') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('ann-stroke');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', ann.points.map(p => `${p.x * width},${p.y * height}`).join(' '));
    line.setAttribute('stroke', ann.color || '#111827');
    line.setAttribute('stroke-width', String(Math.max(1.5, (ann.size || 2) * state.zoom)));
    svg.appendChild(line);
    return svg;
  }

  const div = document.createElement('div');
  div.className = 'ann';
  div.dataset.id = ann.id;
  div.classList.toggle('selected', selected);
  const place = (x, y, w = 0, h = 0) => {
    div.style.left = `${x * width}px`;
    div.style.top = `${y * height}px`;
    if (w) div.style.width = `${w * width}px`;
    if (h) div.style.height = `${h * height}px`;
  };

  if (ann.type === 'text') {
    div.classList.add('ann-text');
    div.textContent = ann.text;
    div.style.color = ann.color || '#111827';
    div.style.fontSize = `${(ann.size || 18) * state.zoom}px`;
    place(ann.x, ann.y);
  } else if (ann.type === 'redact') {
    div.classList.add('ann-box', 'ann-redact');
    place(ann.x, ann.y, ann.w, ann.h);
  } else if (ann.type === 'highlight') {
    div.classList.add('ann-box', 'ann-highlight');
    place(ann.x, ann.y, ann.w, ann.h);
  } else if (ann.type === 'image') {
    div.classList.add('ann-image');
    place(ann.x, ann.y, ann.w, ann.h);
    const img = document.createElement('img');
    img.src = ann.src;
    img.alt = 'Signature annotation';
    div.appendChild(img);
  } else if (ann.type === 'watermark') {
    div.classList.add('ann-watermark');
    div.textContent = ann.text;
    div.style.color = ann.color || '#7c3aed';
    div.style.fontSize = `${(ann.size || 44) * state.zoom}px`;
    div.style.left = `${(ann.x ?? 0.5) * width}px`;
    div.style.top = `${(ann.y ?? 0.5) * height}px`;
  } else {
    return null;
  }

  div.addEventListener('pointerdown', event => beginAnnotationDrag(event, ann.id));
  if (['redact', 'highlight', 'image'].includes(ann.type)) {
    const resize = document.createElement('span');
    resize.className = 'ann-resize';
    resize.addEventListener('pointerdown', event => beginAnnotationResize(event, ann.id));
    div.appendChild(resize);
  }
  return div;
}

function setMode(mode) {
  state.mode = mode;
  els.editorModeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  const hints = {
    select: 'Select, drag, resize, or delete edits on the page.',
    text: 'Click the page to place editable text.',
    draw: 'Draw directly over the page. The stroke is flattened on export.',
    redact: 'Click to place a movable flattened redaction box.',
    highlight: 'Click to place a movable highlight box.',
    signature: 'Choose a signature image, then click the page to place it.'
  };
  toast(hints[mode] || 'Editor mode changed.');
}

async function handleLayerClick(event) {
  if (!state.pdf || !els.annotationLayer || event.target.closest('.ann')) return;
  if (state.mode === 'select' || state.mode === 'draw') {
    selectAnnotation(null);
    return;
  }
  const pos = layerPointerPosition(event);
  let newAnn = null;
  if (state.mode === 'text') {
    const text = els.textValue.value.trim() || 'PaperHive note';
    newAnn = { type: 'text', x: pos.x, y: pos.y, text, size: Number(els.textSize.value) || 18, color: els.textColor.value || '#111827' };
  }
  if (state.mode === 'redact') {
    const w = Math.max(4, Number(els.boxWidth.value) || 24) / 100;
    const h = Math.max(2, Number(els.boxHeight.value) || 8) / 100;
    newAnn = { type: 'redact', x: Math.max(0, pos.x - w / 2), y: Math.max(0, pos.y - h / 2), w, h, color: '#0f172a' };
  }
  if (state.mode === 'highlight') {
    const w = Math.max(4, Number(els.boxWidth.value) || 24) / 100;
    const h = Math.max(2, Number(els.boxHeight.value) || 8) / 100;
    newAnn = { type: 'highlight', x: Math.max(0, pos.x - w / 2), y: Math.max(0, pos.y - h / 2), w, h, color: '#facc15' };
  }
  if (state.mode === 'signature') {
    if (!state.signatureDataUrl) {
      toast('Choose a signature image first.');
      els.signatureInput?.click();
      return;
    }
    const w = Math.max(10, Number(els.boxWidth.value) || 28) / 100;
    const h = Math.max(5, Number(els.boxHeight.value) || 10) / 100;
    newAnn = { type: 'image', x: Math.max(0, pos.x - w / 2), y: Math.max(0, pos.y - h / 2), w, h, src: state.signatureDataUrl };
  }
  if (newAnn) {
    const saved = addAnnotation(state.pageNumber, newAnn);
    state.selectedAnnotation = { page: state.pageNumber, id: saved.id };
    renderAnnotationLayer();
  }
}

function beginAnnotationDrag(event, id) {
  event.preventDefault();
  event.stopPropagation();
  const ann = findAnnotation(state.pageNumber, id);
  if (!ann) return;
  state.selectedAnnotation = { page: state.pageNumber, id };
  updateSelectedUI();
  $$('.ann', els.annotationLayer).forEach(node => node.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  const start = layerPointerPosition(event);
  state.layerDrag = { type: 'move', id, startX: start.x, startY: start.y, original: { x: ann.x || 0, y: ann.y || 0 } };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function beginAnnotationResize(event, id) {
  event.preventDefault();
  event.stopPropagation();
  const ann = findAnnotation(state.pageNumber, id);
  if (!ann) return;
  state.selectedAnnotation = { page: state.pageNumber, id };
  updateSelectedUI();
  $$('.ann', els.annotationLayer).forEach(node => node.classList.remove('selected'));
  event.currentTarget.closest('.ann')?.classList.add('selected');
  const start = layerPointerPosition(event);
  state.layerDrag = { type: 'resize', id, startX: start.x, startY: start.y, original: { w: ann.w || 0.2, h: ann.h || 0.08 } };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function updateAnnotationDrag(event) {
  if (!state.layerDrag) return;
  event.preventDefault();
  const ann = findAnnotation(state.pageNumber, state.layerDrag.id);
  if (!ann) return;
  const pos = layerPointerPosition(event);
  if (state.layerDrag.type === 'move') {
    const dx = pos.x - state.layerDrag.startX;
    const dy = pos.y - state.layerDrag.startY;
    const maxX = Math.max(0, 1 - (ann.w || 0));
    const maxY = Math.max(0, 1 - (ann.h || 0));
    ann.x = Math.max(0, Math.min(maxX, state.layerDrag.original.x + dx));
    ann.y = Math.max(0, Math.min(maxY, state.layerDrag.original.y + dy));
  } else {
    ann.w = Math.max(0.03, Math.min(1 - (ann.x || 0), state.layerDrag.original.w + (pos.x - state.layerDrag.startX)));
    ann.h = Math.max(0.02, Math.min(1 - (ann.y || 0), state.layerDrag.original.h + (pos.y - state.layerDrag.startY)));
  }
  renderAnnotationLayer();
}

function endAnnotationDrag() {
  state.layerDrag = null;
}

function beginDraw(event) {
  if (!state.pdf || state.mode !== 'draw' || event.target.closest('.ann')) return;
  event.preventDefault();
  state.drawing = true;
  state.currentStroke = { type: 'stroke', points: [layerPointerPosition(event)], color: els.textColor.value || '#111827', size: Math.max(1, (Number(els.textSize.value) || 18) / 12) };
  selectAnnotation(null);
}

function continueDraw(event) {
  if (state.layerDrag) return updateAnnotationDrag(event);
  if (!state.drawing || !state.currentStroke) return;
  event.preventDefault();
  state.currentStroke.points.push(layerPointerPosition(event));
  renderAnnotationLayer();
  const preview = createAnnotationNode({ ...state.currentStroke, id: 'preview-stroke' }, els.annotationLayer.clientWidth || 1, els.annotationLayer.clientHeight || 1);
  if (preview) els.annotationLayer.appendChild(preview);
}

function endDraw() {
  endAnnotationDrag();
  if (!state.drawing || !state.currentStroke) return;
  if (state.currentStroke.points.length > 1) addAnnotation(state.pageNumber, state.currentStroke);
  state.drawing = false;
  state.currentStroke = null;
  renderAnnotationLayer();
}

function deleteSelectedAnnotation() {
  if (!state.selectedAnnotation) return;
  const list = getAnnotations(state.selectedAnnotation.page);
  const index = list.findIndex(ann => ann.id === state.selectedAnnotation.id);
  if (index >= 0) list.splice(index, 1);
  state.selectedAnnotation = null;
  renderAnnotationLayer();
  toast('Selected edit deleted.');
}

function addWatermarkToAllPages() {
  if (!state.pdf) return;
  const text = (els.textValue.value || 'PaperHive').trim();
  for (let page = 1; page <= state.pageCount; page++) {
    addAnnotation(page, { type: 'watermark', x: 0.5, y: 0.5, text, size: Number(els.textSize.value) || 44, color: els.textColor.value || '#7c3aed' });
  }
  renderCurrentPage();
  toast('Watermark added to every page.');
}

function parsePageRange(input) {
  if (!state.pdf) return [];
  const raw = (input || '').trim();
  const result = [];
  const addPage = page => {
    if (page >= 1 && page <= state.pageCount && !result.includes(page) && !state.deletedPages.has(page)) result.push(page);
  };
  if (!raw) {
    for (const page of state.pageOrder.length ? state.pageOrder : Array.from({ length: state.pageCount }, (_, index) => index + 1)) addPage(page);
    return result;
  }
  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!token) continue;
    if (token.includes('-')) {
      const [startText, endText] = token.split('-');
      const start = Number(startText);
      const end = Number(endText);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const step = start <= end ? 1 : -1;
        for (let page = start; step > 0 ? page <= end : page >= end; page += step) addPage(page);
      }
    } else {
      addPage(Number(token));
    }
  }
  return result;
}

async function exportSanitizedPdf({ onlyCurrentRange = false } = {}) {
  if (!state.pdf) return setStatus('Load a PDF first.', 'err');
  if (!els.auth.checked) return setStatus('Confirm authorization first.', 'err');
  const pages = parsePageRange(onlyCurrentRange ? els.downloadRange.value : els.downloadRange.value);
  if (!pages.length) return setStatus('No valid pages to export. Check your page range or skipped pages.', 'err');
  const scale = Number(els.exportScale.value) || 2;
  const imageFormat = els.imageFormat.value === 'PNG' ? 'PNG' : 'JPEG';
  const quality = (Number(els.jpegQuality.value) || 86) / 100;
  let doc = null;

  try {
    setStatus('Rebuilding an unlocked, flattened PDF locally…');
    setProgress(1);
    for (let index = 0; index < pages.length; index++) {
      const pageNumber = pages[index];
      const page = await state.pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale, rotation: state.rotation });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      await drawAnnotationsToCanvas(ctx, pageNumber, viewport.width, viewport.height, scale);
      const widthPt = viewport.width / scale;
      const heightPt = viewport.height / scale;
      const orientation = widthPt > heightPt ? 'landscape' : 'portrait';
      if (!doc) {
        doc = new jsPDF({ orientation, unit: 'pt', format: [widthPt, heightPt], compress: true });
        doc.setProperties({ title: `${safeName(state.file?.name)} unlocked`, subject: 'Flattened, client-side rebuilt PDF', author: 'PaperHive local app', creator: 'PaperHive' });
      } else {
        doc.addPage([widthPt, heightPt], orientation);
      }
      const dataUrl = imageFormat === 'PNG' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
      doc.addImage(dataUrl, imageFormat, 0, 0, widthPt, heightPt, undefined, imageFormat === 'JPEG' ? 'FAST' : undefined);
      canvas.width = canvas.height = 1;
      setProgress(((index + 1) / pages.length) * 100);
    }
    const blob = doc.output('blob');
    downloadBlob(blob, `${safeName(state.file?.name)}-unlocked-paperhive.pdf`);
    setStatus('Unlocked sanitized PDF downloaded. Original file never left this device.', 'ok');
    toast('Download complete.');
    if (els.autoClear.checked) clearSession({ keepStatus: true });
  } catch (error) {
    console.error(error);
    setStatus(`Export failed: ${error?.message || error}`, 'err');
  } finally {
    setTimeout(() => setProgress(0), 1000);
  }
}

async function convertPdfToImages() {
  if (!state.pdf) return setStatus('Load a PDF first.', 'err');
  if (!JSZip) return setStatus('JSZip library missing.', 'err');
  const pages = parsePageRange(els.downloadRange.value);
  if (!pages.length) return setStatus('No valid pages selected for image export.', 'err');
  const format = els.imageFormat.value === 'PNG' ? 'PNG' : 'JPEG';
  const mime = format === 'PNG' ? 'image/png' : 'image/jpeg';
  const quality = (Number(els.jpegQuality.value) || 86) / 100;
  const scale = Number(els.exportScale.value) || 2;
  const zip = new JSZip();
  try {
    setStatus(`Converting ${pages.length} page${pages.length > 1 ? 's' : ''} to ${format} locally…`);
    for (let i = 0; i < pages.length; i++) {
      const pageNumber = pages[i];
      const page = await state.pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale, rotation: state.rotation });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      await drawAnnotationsToCanvas(ctx, pageNumber, viewport.width, viewport.height, scale);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, quality));
      zip.file(`${safeName(state.file?.name)}-page-${String(pageNumber).padStart(3, '0')}.${format.toLowerCase()}`, blob);
      canvas.width = canvas.height = 1;
      setProgress(((i + 1) / pages.length) * 75);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' }, meta => setProgress(75 + meta.percent * 0.25));
    downloadBlob(zipBlob, `${safeName(state.file?.name)}-images-paperhive.zip`);
    setStatus('Image ZIP downloaded.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus(`Image conversion failed: ${error?.message || error}`, 'err');
  } finally {
    setTimeout(() => setProgress(0), 1000);
  }
}

async function imagesToPdf() {
  const files = [...els.imageInput.files].filter(file => file.type.startsWith('image/'));
  if (!files.length) return setStatus('Choose one or more image files first.', 'err');
  try {
    let doc = null;
    for (let index = 0; index < files.length; index++) {
      const dataUrl = await fileToDataUrl(files[index]);
      const img = await loadImage(dataUrl);
      const widthPt = Math.max(180, img.naturalWidth * 0.75);
      const heightPt = Math.max(180, img.naturalHeight * 0.75);
      const orientation = widthPt > heightPt ? 'landscape' : 'portrait';
      if (!doc) doc = new jsPDF({ unit: 'pt', format: [widthPt, heightPt], orientation, compress: true });
      else doc.addPage([widthPt, heightPt], orientation);
      const normalized = imageToJpegDataUrl(img);
      doc.addImage(normalized, 'JPEG', 0, 0, widthPt, heightPt, undefined, 'FAST');
      setProgress(((index + 1) / files.length) * 100);
    }
    doc.setProperties({ title: 'PaperHive image PDF', creator: 'PaperHive' });
    downloadBlob(doc.output('blob'), `paperhive-images-${Date.now()}.pdf`);
    setStatus('Images converted to PDF.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus(`Image to PDF failed: ${error?.message || error}`, 'err');
  } finally {
    setTimeout(() => setProgress(0), 1000);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function imageToJpegDataUrl(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  canvas.width = canvas.height = 1;
  return dataUrl;
}

function textToPdf() {
  const text = els.notesText.value.trim();
  if (!text) return setStatus('Enter text notes first.', 'err');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.setProperties({ title: 'PaperHive notes', creator: 'PaperHive' });
  const margin = 54;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('PaperHive Notes', margin, margin);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
  let y = margin + 34;
  for (const line of lines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 16;
  }
  downloadBlob(doc.output('blob'), `paperhive-notes-${Date.now()}.pdf`);
  setStatus('Text converted to PDF.', 'ok');
}

function clearSession({ keepStatus = false } = {}) {
  if (state.pdf?.destroy) state.pdf.destroy().catch(() => {});
  state.file = null;
  if (state.bytes) {
    try { new Uint8Array(state.bytes).fill(0); } catch (_) {}
  }
  state.bytes = null;
  state.pdf = null;
  state.pageCount = 0;
  state.pageNumber = 1;
  state.zoom = 1.15;
  state.rotation = 0;
  state.annotations = new Map();
  state.deletedPages = new Set();
  state.pageOrder = [];
  state.selectedAnnotation = null;
  state.layerDrag = null;
  state.draggedPageIndex = null;
  state.signatureDataUrl = '';
  if (els.signatureInput) els.signatureInput.value = '';
  els.password.value = '';
  els.fileInput.value = '';
  els.fileMeta.innerHTML = '';
  els.pageList.innerHTML = '<p class="muted">No pages loaded yet.</p>';
  els.canvas.width = els.canvas.height = 1;
  els.canvas.classList.add('hidden');
  if (els.annotationLayer) {
    els.annotationLayer.innerHTML = '';
    els.annotationLayer.classList.add('hidden');
  }
  els.emptyView.classList.remove('hidden');
  updatePageUI();
  enablePdfActions(false);
  setProgress(0);
  if (!keepStatus) setStatus('Session cleared. No PDF data or password is stored.', 'ok');
}

function wireEvents() {
  els.mobileMenu?.addEventListener('click', () => els.navlinks.classList.toggle('open'));
  $$('#navlinks a').forEach(a => a.addEventListener('click', () => els.navlinks.classList.remove('open')));

  els.dropZone.addEventListener('click', event => {
    if (event.target.closest('button')) return;
    els.fileInput.click();
  });
  els.fileInput.addEventListener('change', event => handleFile(event.target.files[0]));
  ['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    els.dropZone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    els.dropZone.classList.remove('drag');
  }));
  els.dropZone.addEventListener('drop', event => handleFile(event.dataTransfer.files[0]));

  els.togglePassword.addEventListener('click', () => {
    els.password.type = els.password.type === 'password' ? 'text' : 'password';
    els.togglePassword.textContent = els.password.type === 'password' ? 'Show' : 'Hide';
  });
  els.loadBtn.addEventListener('click', loadPdf);
  els.clearBtn.addEventListener('click', () => clearSession());
  els.prevPage.addEventListener('click', () => { if (state.pdf && state.pageNumber > 1) { state.pageNumber--; state.selectedAnnotation = null; renderCurrentPage(); } });
  els.nextPage.addEventListener('click', () => { if (state.pdf && state.pageNumber < state.pageCount) { state.pageNumber++; state.selectedAnnotation = null; renderCurrentPage(); } });
  els.zoomIn.addEventListener('click', () => { state.zoom = Math.min(3, state.zoom + 0.15); renderCurrentPage(); });
  els.zoomOut.addEventListener('click', () => { state.zoom = Math.max(0.45, state.zoom - 0.15); renderCurrentPage(); });
  els.rotateView.addEventListener('click', () => { state.rotation = (state.rotation + 90) % 360; renderCurrentPage(); });
  els.downloadUnlocked.addEventListener('click', () => exportSanitizedPdf());
  els.downloadEdited.addEventListener('click', () => exportSanitizedPdf({ onlyCurrentRange: true }));
  els.pdfToImages.addEventListener('click', convertPdfToImages);
  els.deletePage.addEventListener('click', () => { if (state.pdf) { state.deletedPages.add(state.pageNumber); buildPageList(); toast(`Page ${state.pageNumber} marked to skip on export.`); } });
  els.restorePage.addEventListener('click', () => { if (state.pdf) { state.deletedPages.delete(state.pageNumber); buildPageList(); toast(`Page ${state.pageNumber} restored.`); } });
  els.resetOrder?.addEventListener('click', () => { if (state.pdf) { state.pageOrder = Array.from({ length: state.pageCount }, (_, index) => index + 1); buildPageList(); toast('Page order reset.'); } });

  els.exportScale.addEventListener('input', () => els.exportScaleLabel.textContent = `${Number(els.exportScale.value).toFixed(1)}×`);
  els.jpegQuality.addEventListener('input', () => els.jpegQualityLabel.textContent = `${els.jpegQuality.value}%`);

  els.editorModeButtons.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  els.annotationLayer?.addEventListener('click', handleLayerClick);
  els.annotationLayer?.addEventListener('pointerdown', beginDraw);
  window.addEventListener('pointermove', continueDraw);
  window.addEventListener('pointerup', endDraw);
  window.addEventListener('resize', renderAnnotationLayer);
  window.addEventListener('keydown', event => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedAnnotation && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
      event.preventDefault();
      deleteSelectedAnnotation();
    }
  });
  els.signatureInput?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.signatureDataUrl = await fileToDataUrl(file);
    setMode('signature');
    toast('Signature loaded. Click the PDF to place it, then drag or resize.');
  });
  els.addWatermark.addEventListener('click', addWatermarkToAllPages);
  els.deleteSelected?.addEventListener('click', deleteSelectedAnnotation);
  els.clearPageAnn.addEventListener('click', () => { state.annotations.set(state.pageNumber, []); state.selectedAnnotation = null; renderAnnotationLayer(); toast('Current page annotations cleared.'); });
  els.clearAllAnn.addEventListener('click', () => { state.annotations.clear(); state.selectedAnnotation = null; renderAnnotationLayer(); toast('All annotations cleared.'); });
  els.imagesToPdf.addEventListener('click', imagesToPdf);
  els.textToPdf.addEventListener('click', textToPdf);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed', error));
  }
}

wireEvents();
setMode('select');
enablePdfActions(false);
registerServiceWorker();
setStatus('Ready. PaperHive runs offline and never uploads your files.');
