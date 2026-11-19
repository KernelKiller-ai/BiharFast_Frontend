/**
 * BiharFast Studio Core (studio-core.js)
 * High-performance client-side studio controller.
 * Connects tools/studio.html with kb-engine.js.
 *
 * Features:
 * - Drag-and-drop & file picker support (JPG, PNG, WebP, PDF)
 * - Live Before/After pixel dimensions & file size (KB) readout
 * - Custom Min KB and Max KB inputs with live recalculation
 * - 1-Click Bihar / National Exam Presets:
 *   1. BPSC / BSSC / RRB Photo (200x230px, 20-50 KB)
 *   2. BPSC / RRB Signature (140x60px, 10-20 KB)
 *   3. PAN Card NSDL/UTIITSL Photo (213x213px, <30 KB)
 *   4. RTPS Bihar / Voter ID (<50 KB)
 *   5. Bihar Police (CSBC) Photo with DOP
 * - Live Name & Date generator appending crisp white strip (18% height)
 *   with centered bold black text for Candidate Name (Auto-UPPERCASE)
 *   and Date of Photo (DD-MM-YYYY)
 * - Canvas transforms: Rotate 90°, Flip Horizontal (Mirror)
 * - Aspect-Ratio Crop presets: Free, Passport 3.5:4.5, Square 1:1, Signature 3:1
 * - Brightness & Contrast sliders with real-time feedback
 * - 1-Click Signature Paper Cleaner filter that converts off-white / shadowed
 *   mobile photos of signatures into crisp dark ink on pure white (#ffffff) background
 * - Pipes canvas directly through kb-engine.js for 1-click 20-50 KB ready JPG download
 * - Instant client-side download without server upload
 */

import { compressToExactKB, increaseToMinKB } from './kb-engine.js';
import {
  generateA4PdfFromImages,
  downloadPdf,
  loadPdfDocument,
  renderPdfPageToCanvas,
  extractAllPdfPages,
  downloadCanvasAsJpg
} from './pdf-engine.js';

/**
 * Returns today's date formatted as DD-MM-YYYY
 * @returns {string} e.g. "19-11-2026"
 */
export function getTodayDateFormatted() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}-${m}-${y}`;
}

// Predefined 1-Click Exam & Sarkari Portal Specifications
export const EXAM_PRESETS = {
  'bpsc-photo': {
    name: 'BPSC / BSSC / RRB Photo',
    width: 200,
    height: 230,
    minKB: 20,
    maxKB: 50,
    mimeType: 'image/jpeg',
    enableNameDate: false,
    cropRatio: '3.5:4.5',
    filenamePrefix: 'bpsc_bssc_rrb_photo_200x230'
  },
  'bpsc-sign': {
    name: 'BPSC / RRB Signature',
    width: 140,
    height: 60,
    minKB: 10,
    maxKB: 20,
    mimeType: 'image/jpeg',
    enableNameDate: false,
    cropRatio: '3:1',
    filenamePrefix: 'bpsc_rrb_sign_140x60'
  },
  'pan-photo': {
    name: 'PAN Card NSDL/UTIITSL Photo',
    width: 213,
    height: 213,
    minKB: 10,
    maxKB: 30,
    mimeType: 'image/jpeg',
    enableNameDate: false,
    cropRatio: '1:1',
    filenamePrefix: 'pan_card_photo_213x213'
  },
  'pan-sign': {
    name: 'PAN Card Signature',
    width: 400,
    height: 200,
    minKB: 10,
    maxKB: 20,
    mimeType: 'image/jpeg',
    enableNameDate: false,
    cropRatio: '2:1',
    filenamePrefix: 'pan_card_sign_400x200'
  },
  'rtps-voter': {
    name: 'RTPS Bihar / Voter ID',
    width: 350,
    height: 450,
    minKB: 20,
    maxKB: 50,
    mimeType: 'image/jpeg',
    enableNameDate: false,
    cropRatio: '3.5:4.5',
    filenamePrefix: 'rtps_voter_doc'
  },
  'csbc-photo': {
    name: 'Bihar Police (CSBC) Photo + DOP',
    width: 350,
    height: 450,
    minKB: 20,
    maxKB: 50,
    mimeType: 'image/jpeg',
    enableNameDate: true,
    cropRatio: '3.5:4.5',
    filenamePrefix: 'csbc_bihar_police_dop'
  },
  'custom': {
    name: 'Custom Size',
    filenamePrefix: 'biharfast_studio'
  }
};

// Studio State
export const state = {
  originalImage: null,
  loadedFile: null,
  originalWidth: 0,
  originalHeight: 0,
  originalSizeBytes: 0,

  // Current Dimensions & Target KB Range
  currentWidth: 200,
  currentHeight: 230,
  minKB: 20,
  maxKB: 50,
  activePresetKey: 'bpsc-photo',
  aspectRatioLocked: true,
  outputMime: 'image/jpeg',

  // Transforms & Aspect Ratio Crop
  rotation: 0,
  flipH: false,
  cropRatio: 'free', // 'free', '3.5:4.5', '1:1', '3:1'
  zoom: 1,

  // Processed Output
  lastBlob: null,
  lastBlobSize: 0,
  isProcessing: false,

  // Name & Date (DOPO) Generator
  nameDateEnabled: false,
  candidateName: 'ANURAG KUMAR',
  photoDate: getTodayDateFormatted(),
  stripBg: '#ffffff',
  stripMode: 'append', // 'append' (18% below photo) or 'overlay'
  stripHeightPercent: 18, // 18% of image height
  nameFontSize: 22,
  nameUppercase: true,

  // Touch-Up Filters
  brightness: 0,
  contrast: 0,
  grayscale: false,
  signatureCleanerActive: false, // 1-click signature paper cleaner

  // Multi-Page PDF Compiler
  pdfPages: [],
  pdfTargetKb: 200,
  pdfOrientation: 'portrait',

  // PDF to JPG Extractor
  pdfExtractorMode: 'compiler',
  extractedPdfPages: [],
  pdfRenderScale: 2.0
};

// DOM Elements Cache
let elements = {};

function cacheElements() {
  elements = {
    // Dropzone, Workspace Card & Viewport
    workspaceCard: document.getElementById('workspaceCard'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    canvasWrapper: document.getElementById('canvasWrapper'),
    canvas: document.getElementById('studioCanvas'),
    
    // Status Badges
    portalBadge: document.getElementById('portalBadge'),
    portalBadgeText: document.getElementById('portalBadgeText'),
    limitBadge: document.getElementById('limitBadge'),
    limitBadgeText: document.getElementById('limitBadgeText'),
    
    // Readouts (Before / After)
    fileNameTag: document.getElementById('fileNameTag'),
    originalMetaTag: document.getElementById('originalMetaTag') || document.getElementById('originalSizeTag'),
    outputMetaTag: document.getElementById('outputMetaTag') || document.getElementById('dimensionsTag'),
    outputSizePill: document.getElementById('outputSizePill'),
    targetStatusText: document.getElementById('targetStatusText'),
    zoomLevelTag: document.getElementById('zoomLevelTag'),

    // Viewport Buttons
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    rotateBtn: document.getElementById('rotateBtn'),
    flipHBtn: document.getElementById('flipHBtn'),
    resetZoomBtn: document.getElementById('resetZoomBtn'),
    clearBtn: document.getElementById('clearBtn'),
    downloadBtn: document.getElementById('downloadBtn'),

    // KB Resizer Controls
    examPresetsGrid: document.getElementById('examPresetsGrid'),
    targetKbRangeDisplay: document.getElementById('targetKbRangeDisplay') || document.getElementById('targetKbDisplay'),
    minKbInput: document.getElementById('minKbInput'),
    maxKbInput: document.getElementById('maxKbInput') || document.getElementById('targetKbInput'),
    maxKbSlider: document.getElementById('maxKbSlider') || document.getElementById('targetKbSlider'),
    dimWidth: document.getElementById('dimWidth'),
    dimHeight: document.getElementById('dimHeight'),
    lockAspectCheckbox: document.getElementById('lockAspectCheckbox'),
    formatSelect: document.getElementById('formatSelect'),

    // Name & Date Controls
    enableNameDateToggle: document.getElementById('enableNameDateToggle'),
    candidateNameInput: document.getElementById('candidateNameInput'),
    photoDateInput: document.getElementById('photoDateInput'),
    todayDateBtn: document.getElementById('todayDateBtn'),
    stripModeSelect: document.getElementById('stripModeSelect'),
    stripHeightSlider: document.getElementById('stripHeightSlider'),
    stripHeightDisplay: document.getElementById('stripHeightDisplay'),
    nameUppercaseToggle: document.getElementById('nameUppercaseToggle'),
    downloadNameDatePhotoBtn: document.getElementById('downloadNameDatePhotoBtn'),

    // Touch-Up Controls
    cleanSignatureBtn: document.getElementById('cleanSignatureBtn'),
    autoEnhanceBtn: document.getElementById('autoEnhanceBtn'),
    rotateTabBtn: document.getElementById('rotateTabBtn'),
    flipHTabBtn: document.getElementById('flipHTabBtn'),
    brightnessSlider: document.getElementById('brightnessSlider'),
    brightnessDisplay: document.getElementById('brightnessDisplay'),
    contrastSlider: document.getElementById('contrastSlider'),
    contrastDisplay: document.getElementById('contrastDisplay'),
    grayscaleToggle: document.getElementById('grayscaleToggle'),
    cropPresetsGrid: document.getElementById('cropPresetsGrid'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),

    // PDF Multi-Page Controls
    pdfPresetGrid: document.getElementById('pdfPresetGrid'),
    pdfOrientation: document.getElementById('pdfOrientation'),
    pdfMultiFileInput: document.getElementById('pdfMultiFileInput'),
    addPdfPageBtn: document.getElementById('addPdfPageBtn'),
    addCurrentCanvasToPdfBtn: document.getElementById('addCurrentCanvasToPdfBtn'),
    clearAllPdfPagesBtn: document.getElementById('clearAllPdfPagesBtn'),
    pdfPagesList: document.getElementById('pdfPagesList'),
    pdfEmptyState: document.getElementById('pdfEmptyState'),
    pdfPageCount: document.getElementById('pdfPageCount'),
    pdfTargetLimitTag: document.getElementById('pdfTargetLimitTag'),
    pdfProgressBox: document.getElementById('pdfProgressBox'),
    pdfProgressFill: document.getElementById('pdfProgressFill'),
    pdfProgressText: document.getElementById('pdfProgressText'),
    generatePdfBtn: document.getElementById('generatePdfBtn'),
    pdfSuccessNotice: document.getElementById('pdfSuccessNotice'),
    pdfSuccessNoticeText: document.getElementById('pdfSuccessNoticeText'),

    // PDF Mode Switcher & Extractor Controls
    pdfModeCompilerBtn: document.getElementById('pdfModeCompilerBtn'),
    pdfModeExtractorBtn: document.getElementById('pdfModeExtractorBtn'),
    pdfCompilerSection: document.getElementById('pdfCompilerSection'),
    pdfExtractorSection: document.getElementById('pdfExtractorSection'),
    pdfExtractorFileInput: document.getElementById('pdfExtractorFileInput'),
    selectPdfForExtractBtn: document.getElementById('selectPdfForExtractBtn'),
    pdfRenderScaleSelect: document.getElementById('pdfRenderScaleSelect'),
    pdfExtractProgressBox: document.getElementById('pdfExtractProgressBox'),
    pdfExtractProgressFill: document.getElementById('pdfExtractProgressFill'),
    pdfExtractProgressText: document.getElementById('pdfExtractProgressText'),
    pdfExtractedCount: document.getElementById('pdfExtractedCount'),
    downloadAllPagesJpgBtn: document.getElementById('downloadAllPagesJpgBtn'),
    pdfExtractedPagesList: document.getElementById('pdfExtractedPagesList'),
    pdfExtractEmptyState: document.getElementById('pdfExtractEmptyState')
  };
}

/**
 * Handle incoming file (via drag-and-drop or file input picker)
 */
export function handleFile(file) {
  if (!file) return;
  state.loadedFile = file;
  state.originalSizeBytes = file.size;

  // Handle PDF documents
  if (file.type === 'application/pdf') {
    handlePdfFile(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.originalImage = img;
      state.originalWidth = img.naturalWidth || img.width;
      state.originalHeight = img.naturalHeight || img.height;

      // Reset view transforms
      state.rotation = 0;
      state.flipH = false;
      state.cropRatio = 'free';
      state.signatureCleanerActive = false;
      state.zoom = 1;

      // If active preset has fixed dimensions, apply them; otherwise use image dimensions
      const preset = EXAM_PRESETS[state.activePresetKey];
      if (preset && preset.width && preset.height) {
        state.currentWidth = preset.width;
        state.currentHeight = preset.height;
      } else {
        state.currentWidth = state.originalWidth;
        state.currentHeight = state.originalHeight;
      }

      // Update UI Inputs
      if (elements.dimWidth) elements.dimWidth.value = state.currentWidth;
      if (elements.dimHeight) elements.dimHeight.value = state.currentHeight;

      // Update "Before" readout
      updateBeforeReadout();

      // Switch view to canvas & dock sticky preview on mobile
      if (elements.dropzone) elements.dropzone.style.display = 'none';
      if (elements.canvasWrapper) elements.canvasWrapper.style.display = 'block';
      if (elements.workspaceCard) elements.workspaceCard.classList.add('has-file');

      // Enable action buttons
      enableActionButtons(true);

      // Render canvas and run compression
      renderAndCompress();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handlePdfFile(file) {
  if (elements.fileNameTag) {
    elements.fileNameTag.innerHTML = `File: <strong>${truncateFilename(file.name)}</strong>`;
  }
  if (elements.originalMetaTag) {
    elements.originalMetaTag.innerHTML = `Original: <strong>${formatBytes(file.size)} (PDF)</strong>`;
  }
  if (elements.dropzone) elements.dropzone.style.display = 'none';
  if (elements.canvasWrapper) elements.canvasWrapper.style.display = 'block';
  if (elements.workspaceCard) elements.workspaceCard.classList.add('has-file');

  // Activate Tab 3 in Extractor mode and process PDF with PDF.js
  const pdfTabBtn = document.querySelector('.tab-btn[data-target="pane-pdf"]');
  if (pdfTabBtn) pdfTabBtn.click();
  switchPdfMode('extractor');

  handlePdfExtractorFile(file);
}

/**
 * Updates the "Before" (Original) Readout tags
 */
function updateBeforeReadout() {
  if (elements.fileNameTag && state.loadedFile) {
    elements.fileNameTag.innerHTML = `File: <strong>${truncateFilename(state.loadedFile.name)}</strong>`;
  }
  if (elements.originalMetaTag) {
    elements.originalMetaTag.innerHTML = `Original: <strong>${state.originalWidth} × ${state.originalHeight} px (${formatBytes(state.originalSizeBytes)})</strong>`;
  }
}

/**
 * Draws the current image onto the canvas with aspect ratio cropping, rotation,
 * horizontal flip, touch-up filters, and crisp white Name & Date strip
 */
export function renderCanvas() {
  if (!state.originalImage || !elements.canvas) return;

  const canvas = elements.canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const baseW = state.currentWidth;
  const baseH = state.currentHeight;

  // Account for 90° or 270° rotation
  const isRotated = state.rotation % 180 !== 0;
  const photoW = isRotated ? baseH : baseW;
  const photoH = isRotated ? baseW : baseH;

  // Determine strip height if Name & Date is enabled (default 18% of photo height)
  const isNameDateActive = state.nameDateEnabled && (state.candidateName.trim() || state.photoDate.trim());
  const stripH = isNameDateActive ? Math.max(24, Math.round(photoH * (state.stripHeightPercent / 100))) : 0;

  // Total canvas height depends on strip placement mode:
  // 'append' expands the canvas height by stripH (preserving 100% of face); 'overlay' stays within original frame
  const isAppendMode = state.stripMode === 'append';
  const renderW = photoW;
  const renderH = isNameDateActive && isAppendMode ? (photoH + stripH) : photoH;

  canvas.width = renderW;
  canvas.height = renderH;

  ctx.save();
  ctx.clearRect(0, 0, renderW, renderH);

  // Compute source crop coordinates based on cropRatio
  const origW = state.originalWidth;
  const origH = state.originalHeight;
  let sx = 0;
  let sy = 0;
  let sw = origW;
  let sh = origH;

  if (state.cropRatio === '1:1') {
    const size = Math.min(origW, origH);
    sw = size;
    sh = size;
    sx = Math.round((origW - size) / 2);
    sy = Math.round((origH - size) / 2);
  } else if (state.cropRatio === '3.5:4.5') {
    const r = 3.5 / 4.5;
    if (origW / origH > r) {
      sh = origH;
      sw = Math.round(origH * r);
    } else {
      sw = origW;
      sh = Math.round(origW / r);
    }
    sx = Math.round((origW - sw) / 2);
    sy = Math.round((origH - sh) / 2);
  } else if (state.cropRatio === '3:1') {
    const r = 3 / 1;
    if (origW / origH > r) {
      sh = origH;
      sw = Math.round(origH * r);
    } else {
      sw = origW;
      sh = Math.round(origW / r);
    }
    sx = Math.round((origW - sw) / 2);
    sy = Math.round((origH - sh) / 2);
  }

  // Draw the photo with rotation and optional horizontal mirror flip
  ctx.save();
  ctx.translate(photoW / 2, photoH / 2);
  ctx.rotate((state.rotation * Math.PI) / 180);

  if (state.flipH) {
    ctx.scale(-1, 1);
  }

  ctx.drawImage(state.originalImage, sx, sy, sw, sh, -baseW / 2, -baseH / 2, baseW, baseH);
  ctx.restore();

  // Apply Pixel Filters (Brightness, Contrast, Grayscale, or Signature Paper Cleaner)
  applyFilters(ctx, photoW, photoH);

  // Render Crisp White Strip with Centered Bold Black Text (Line 1: Name, Line 2: Date)
  if (isNameDateActive && stripH > 0) {
    const startY = isAppendMode ? photoH : (photoH - stripH);
    drawCrispWhiteStrip(ctx, renderW, startY, stripH);
  }

  // Update viewport scale transform
  if (elements.canvasWrapper) {
    elements.canvasWrapper.style.transform = `scale(${state.zoom})`;
  }
  if (elements.zoomLevelTag) {
    elements.zoomLevelTag.textContent = `${Math.round(state.zoom * 100)}%`;
  }
}

/**
 * Applies Brightness, Contrast, Grayscale, or Signature Paper Cleaner filter
 */
function applyFilters(ctx, width, height) {
  const b = state.brightness;
  const c = state.contrast;
  const gray = state.grayscale;
  const cleanSig = state.signatureCleanerActive;

  if (b === 0 && c === 0 && !gray && !cleanSig) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // If 1-Click Signature Paper Cleaner is active: apply adaptive whitening & ink darkening
  if (cleanSig) {
    applySignaturePaperCleanerToData(data);
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  const factor = (259 * (c + 255)) / (255 * (259 - c));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] + b * 2.55;
    let g = data[i + 1] + b * 2.55;
    let bl = data[i + 2] + b * 2.55;

    r = factor * (r - 128) + 128;
    g = factor * (g - 128) + 128;
    bl = factor * (bl - 128) + 128;

    if (gray) {
      const luma = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = g = bl = luma;
    }

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, bl));
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * 1-Click Signature Paper Cleaner Algorithm
 * Analyzes phone photos of signatures on paper, removes shadows, yellow/gray tint,
 * and sets paper background to pure #ffffff while making ink deep, crisp, and high-contrast.
 */
function applySignaturePaperCleanerToData(data) {
  // Pass 1: Sample luminance to determine background paper brightness
  let totalLuma = 0;
  let sampleCount = 0;
  for (let i = 0; i < data.length; i += 16) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    totalLuma += luma;
    sampleCount++;
  }
  const avgLuma = sampleCount > 0 ? (totalLuma / sampleCount) : 180;
  // Adaptive threshold: accounts for dark room shadows vs bright outdoor lighting
  const threshold = Math.max(120, Math.min(210, avgLuma * 0.84));

  // Pass 2: Clean background to 255 white, deepen ink to crisp dark ink
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    if (luma >= threshold) {
      // Pure white paper background (#ffffff)
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    } else {
      // Ink stroke: non-linear curve to avoid harsh jagged pixel edges
      const normalized = luma / threshold;
      const inkVal = Math.min(255, Math.round(Math.pow(normalized, 1.5) * 40));
      data[i] = inkVal;
      data[i + 1] = inkVal;
      data[i + 2] = inkVal;
    }
  }
}

/**
 * Renders a crisp white strip (18% of photo height) at the bottom of the photo
 * with centered black bold text for Candidate Name (Line 1) and Date of Photo (Line 2).
 */
function drawCrispWhiteStrip(ctx, width, startY, stripH) {
  // 1. Crisp white background (#ffffff)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, startY, width, stripH);

  // 2. Subtle top border line to separate photo from the strip
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(1, Math.round(width / 320));
  ctx.beginPath();
  ctx.moveTo(0, startY);
  ctx.lineTo(width, startY);
  ctx.stroke();

  // 3. Format texts
  let line1 = state.candidateName.trim();
  if (state.nameUppercase) {
    line1 = line1.toUpperCase();
  }
  const line2 = state.photoDate.trim();

  // 4. Calculate optimal bold font size for centered black text
  const maxLen = Math.max(line1.length, line2.length, 10);
  const fontByW = Math.floor((width * 0.88) / (maxLen * 0.56));
  const fontByH = Math.floor(stripH * 0.34);
  const fontSize = Math.max(10, Math.min(fontByW, fontByH, 24));

  ctx.fillStyle = '#000000'; // Pure centered black text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  if (line1 && line2) {
    // Line 1: Candidate Name (centered, black bold)
    ctx.fillText(line1, width / 2, startY + stripH * 0.33);
    // Line 2: Date of Photo DD-MM-YYYY (centered, black bold)
    ctx.font = `bold ${Math.max(9, Math.round(fontSize * 0.92))}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(line2, width / 2, startY + stripH * 0.72);
  } else if (line1) {
    ctx.fillText(line1, width / 2, startY + stripH / 2);
  } else if (line2) {
    ctx.fillText(line2, width / 2, startY + stripH / 2);
  }
}

/**
 * Performs compression using kb-engine and updates the live "After" readout
 */
export async function runCompression() {
  if (!elements.canvas || !state.originalImage || state.isProcessing) return;
  state.isProcessing = true;

  try {
    const result = await compressToExactKB(
      elements.canvas,
      state.minKB,
      state.maxKB,
      state.outputMime
    );

    state.lastBlob = result.blob;
    state.lastBlobSize = result.blob.size;

    // Update "After" Readouts
    if (elements.outputMetaTag) {
      elements.outputMetaTag.innerHTML = `Output: <strong>${result.width} × ${result.height} px</strong>`;
    }

    if (elements.outputSizePill) {
      elements.outputSizePill.textContent = `${result.finalKB} KB`;
      const isWithinTarget = result.finalKB >= state.minKB && result.finalKB <= state.maxKB;

      if (isWithinTarget) {
        elements.outputSizePill.className = 'output-size-pill';
        if (elements.targetStatusText) {
          elements.targetStatusText.textContent = `✓ Target met (${state.minKB} - ${state.maxKB} KB)`;
          elements.targetStatusText.style.color = 'var(--green)';
        }
      } else if (result.finalKB > state.maxKB) {
        elements.outputSizePill.className = 'output-size-pill warning';
        if (elements.targetStatusText) {
          elements.targetStatusText.textContent = `Exceeds max by ${(result.finalKB - state.maxKB).toFixed(1)} KB`;
          elements.targetStatusText.style.color = 'var(--amber)';
        }
      } else {
        elements.outputSizePill.className = 'output-size-pill';
        if (elements.targetStatusText) {
          elements.targetStatusText.textContent = `Padded to minimum ${state.minKB} KB`;
          elements.targetStatusText.style.color = 'var(--cyan)';
        }
      }
    }
  } catch (error) {
    console.error('Compression error:', error);
  } finally {
    state.isProcessing = false;
  }
}

/**
 * Combined render + compress trigger
 */
export function renderAndCompress() {
  renderCanvas();
  runCompression();
}

/**
 * Apply 1-Click Bihar / National Exam Presets
 */
export function applyPreset(presetKey) {
  const preset = EXAM_PRESETS[presetKey];
  if (!preset) return;

  state.activePresetKey = presetKey;

  // Highlight active chip
  if (elements.examPresetsGrid) {
    elements.examPresetsGrid.querySelectorAll('.preset-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.getAttribute('data-preset') === presetKey);
    });
  }

  // Update target dimensions & sizes
  if (preset.width && preset.height) {
    state.currentWidth = preset.width;
    state.currentHeight = preset.height;
    if (elements.dimWidth) elements.dimWidth.value = preset.width;
    if (elements.dimHeight) elements.dimHeight.value = preset.height;
  }

  if (preset.minKB !== undefined) {
    state.minKB = preset.minKB;
    if (elements.minKbInput) elements.minKbInput.value = preset.minKB;
  }

  if (preset.maxKB !== undefined) {
    state.maxKB = preset.maxKB;
    if (elements.maxKbInput) elements.maxKbInput.value = preset.maxKB;
    if (elements.maxKbSlider) elements.maxKbSlider.value = preset.maxKB;
  }

  updateKbRangeDisplay();

  // Name & Date toggle
  if (preset.enableNameDate !== undefined) {
    state.nameDateEnabled = preset.enableNameDate;
    if (elements.enableNameDateToggle) {
      elements.enableNameDateToggle.checked = preset.enableNameDate;
    }
  }

  if (preset.cropRatio) {
    state.cropRatio = preset.cropRatio;
    if (elements.cropPresetsGrid) {
      elements.cropPresetsGrid.querySelectorAll('.aspect-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-ratio') === preset.cropRatio);
      });
    }
  }

  if (preset.mimeType) {
    state.outputMime = preset.mimeType;
    if (elements.formatSelect) elements.formatSelect.value = preset.mimeType;
  }

  renderAndCompress();
}

function updateKbRangeDisplay() {
  if (elements.targetKbRangeDisplay) {
    elements.targetKbRangeDisplay.textContent = `${state.minKB} KB - ${state.maxKB} KB`;
  }
  updateStatusBadges();
}

/**
 * Updates top status badges dynamically (Hinglish/Hindi friendly)
 */
export function updateStatusBadges() {
  if (elements.limitBadgeText) {
    elements.limitBadgeText.textContent = `Under ${state.maxKB} KB`;
  }
  if (elements.portalBadgeText) {
    const key = state.activePresetKey || '';
    if (key.startsWith('bpsc')) {
      elements.portalBadgeText.textContent = 'Ready for BPSC / BSSC';
    } else if (key.startsWith('pan')) {
      elements.portalBadgeText.textContent = 'Ready for PAN Card';
    } else if (key.startsWith('csbc')) {
      elements.portalBadgeText.textContent = 'Ready for CSBC Police';
    } else if (key.startsWith('rtps')) {
      elements.portalBadgeText.textContent = 'Ready for RTPS Bihar';
    } else {
      elements.portalBadgeText.textContent = 'Ready for Exam Portal';
    }
  }
}

/**
 * Dedicated 1-Click Generator & Download for Name & Date Photo (Strict 20-50 KB JPG)
 * Pipes canvas directly through kb-engine.js and triggers ready-to-upload download
 */
export async function downloadNameDateJpg() {
  if (!elements.canvas || !state.originalImage) return;

  const btn = elements.downloadNameDatePhotoBtn;
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⚡ Compressing to 20-50 KB JPG…';
  }

  try {
    // 1. Force 20-50 KB range and JPEG format
    state.minKB = 20;
    state.maxKB = 50;
    state.outputMime = 'image/jpeg';
    state.nameDateEnabled = true;

    if (elements.enableNameDateToggle) elements.enableNameDateToggle.checked = true;
    if (elements.minKbInput) elements.minKbInput.value = 20;
    if (elements.maxKbInput) elements.maxKbInput.value = 50;
    if (elements.maxKbSlider) elements.maxKbSlider.value = 50;
    updateKbRangeDisplay();

    // 2. Render canvas with crisp white strip (18% height)
    renderCanvas();

    // 3. Pipe canvas directly through kb-engine
    const result = await compressToExactKB(elements.canvas, 20, 50, 'image/jpeg');
    state.lastBlob = result.blob;
    state.lastBlobSize = result.blob.size;

    // Update live readout pills
    if (elements.outputMetaTag) {
      elements.outputMetaTag.innerHTML = `Output: <strong>${result.width} × ${result.height} px</strong>`;
    }
    if (elements.outputSizePill) {
      elements.outputSizePill.textContent = `${result.finalKB} KB`;
      elements.outputSizePill.className = 'output-size-pill';
    }
    if (elements.targetStatusText) {
      elements.targetStatusText.textContent = `✓ Compliant (${result.finalKB} KB in 20-50 KB range)`;
      elements.targetStatusText.style.color = 'var(--green)';
    }

    // 4. Instant Download ready-to-upload JPG
    const safeName = (state.candidateName.trim() || 'candidate')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    const filename = `bpsc_csbc_${safeName}_namedate_20_50kb.jpg`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    if (btn) {
      btn.innerHTML = '✓ Downloaded 20-50 KB JPG!';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }, 1800);
    }
  } catch (err) {
    console.error('Error generating Name & Date JPG:', err);
    alert('Error generating JPG: ' + (err.message || 'Please try again'));
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}

/**
 * Instant Client-Side Download
 */
export function downloadFile() {
  if (!state.lastBlob) return;

  const preset = EXAM_PRESETS[state.activePresetKey] || EXAM_PRESETS['custom'];
  const prefix = preset.filenamePrefix || 'biharfast_studio';
  const ext = state.outputMime === 'image/png' ? 'png' : (state.outputMime === 'image/webp' ? 'webp' : 'jpg');
  const filename = `${prefix}_${state.minKB}_${state.maxKB}kb_${Date.now()}.${ext}`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(state.lastBlob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Reset All State
 */
export function resetStudio() {
  state.originalImage = null;
  state.loadedFile = null;
  state.rotation = 0;
  state.flipH = false;
  state.cropRatio = 'free';
  state.signatureCleanerActive = false;
  state.zoom = 1;

  if (elements.canvas) {
    const ctx = elements.canvas.getContext('2d');
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  }

  if (elements.dropzone) elements.dropzone.style.display = 'block';
  if (elements.canvasWrapper) elements.canvasWrapper.style.display = 'none';
  if (elements.workspaceCard) elements.workspaceCard.classList.remove('has-file');

  if (elements.fileNameTag) elements.fileNameTag.innerHTML = 'File: <strong>Chunein</strong>';
  if (elements.originalMetaTag) elements.originalMetaTag.innerHTML = 'Original: <strong>0 × 0 px (0 KB)</strong>';
  if (elements.outputMetaTag) elements.outputMetaTag.innerHTML = 'Output: <strong>0 × 0 px</strong>';
  if (elements.outputSizePill) elements.outputSizePill.textContent = '0 KB';
  if (elements.fileInput) elements.fileInput.value = '';

  enableActionButtons(false);
}

function enableActionButtons(enable) {
  const btns = [
    elements.downloadBtn,
    elements.clearBtn,
    elements.zoomInBtn,
    elements.zoomOutBtn,
    elements.rotateBtn,
    elements.flipHBtn,
    elements.resetZoomBtn,
    elements.generatePdfBtn,
    elements.downloadNameDatePhotoBtn,
    elements.rotateTabBtn,
    elements.flipHTabBtn
  ];
  btns.forEach((btn) => {
    if (btn) btn.disabled = !enable;
  });
}

/**
 * Initialize all Studio listeners and events
 */
export function initStudio() {
  cacheElements();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetPaneId = btn.getAttribute('data-target');
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetPane = document.getElementById(targetPaneId);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Drag and Drop
  if (elements.dropzone) {
    ['dragenter', 'dragover'].forEach((evtName) => {
      elements.dropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((evtName) => {
      elements.dropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropzone.classList.remove('drag-over');
      });
    });

    elements.dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) handleFile(files[0]);
    });

    elements.dropzone.addEventListener('click', () => {
      if (elements.fileInput) elements.fileInput.click();
    });
  }

  if (elements.fileInput) {
    elements.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });
  }

  // 1-Click Exam Presets
  if (elements.examPresetsGrid) {
    elements.examPresetsGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (!chip) return;
      const presetKey = chip.getAttribute('data-preset');
      applyPreset(presetKey);
    });
  }

  // Custom Min KB & Max KB Inputs
  if (elements.minKbInput) {
    elements.minKbInput.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10) || 10;
      val = Math.max(5, Math.min(val, state.maxKB));
      state.minKB = val;
      e.target.value = val;
      updateKbRangeDisplay();
      runCompression();
    });
  }

  if (elements.maxKbInput) {
    elements.maxKbInput.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10) || 50;
      val = Math.max(state.minKB, Math.min(2000, val));
      state.maxKB = val;
      e.target.value = val;
      if (elements.maxKbSlider) elements.maxKbSlider.value = Math.min(500, val);
      updateKbRangeDisplay();
      runCompression();
    });
  }

  if (elements.maxKbSlider) {
    elements.maxKbSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.maxKB = Math.max(state.minKB, val);
      if (elements.maxKbInput) elements.maxKbInput.value = state.maxKB;
      updateKbRangeDisplay();
      runCompression();
    });
  }

  // Pixel Dimensions & Aspect Ratio Lock
  if (elements.dimWidth) {
    elements.dimWidth.addEventListener('input', (e) => {
      const newW = parseInt(e.target.value, 10);
      if (!newW || newW <= 0) return;
      if (state.aspectRatioLocked && state.originalWidth && state.originalHeight) {
        const ratio = state.originalHeight / state.originalWidth;
        const newH = Math.round(newW * ratio);
        state.currentHeight = newH;
        if (elements.dimHeight) elements.dimHeight.value = newH;
      }
      state.currentWidth = newW;
      renderAndCompress();
    });
  }

  if (elements.dimHeight) {
    elements.dimHeight.addEventListener('input', (e) => {
      const newH = parseInt(e.target.value, 10);
      if (!newH || newH <= 0) return;
      if (state.aspectRatioLocked && state.originalWidth && state.originalHeight) {
        const ratio = state.originalWidth / state.originalHeight;
        const newW = Math.round(newH * ratio);
        state.currentWidth = newW;
        if (elements.dimWidth) elements.dimWidth.value = newW;
      }
      state.currentHeight = newH;
      renderAndCompress();
    });
  }

  if (elements.lockAspectCheckbox) {
    elements.lockAspectCheckbox.addEventListener('change', (e) => {
      state.aspectRatioLocked = e.target.checked;
    });
  }

  if (elements.formatSelect) {
    elements.formatSelect.addEventListener('change', (e) => {
      state.outputMime = e.target.value;
      runCompression();
    });
  }

  // Name & Date Strip Listeners (Live Generator)
  if (elements.enableNameDateToggle) {
    elements.enableNameDateToggle.addEventListener('change', (e) => {
      state.nameDateEnabled = e.target.checked;
      renderAndCompress();
    });
  }

  if (elements.candidateNameInput) {
    elements.candidateNameInput.addEventListener('input', (e) => {
      state.candidateName = e.target.value;
      renderAndCompress();
    });
  }

  if (elements.photoDateInput) {
    elements.photoDateInput.addEventListener('input', (e) => {
      state.photoDate = e.target.value;
      renderAndCompress();
    });
  }

  if (elements.todayDateBtn) {
    elements.todayDateBtn.addEventListener('click', () => {
      const today = getTodayDateFormatted();
      state.photoDate = today;
      if (elements.photoDateInput) elements.photoDateInput.value = today;
      renderAndCompress();
    });
  }

  if (elements.stripModeSelect) {
    elements.stripModeSelect.addEventListener('change', (e) => {
      state.stripMode = e.target.value;
      renderAndCompress();
    });
  }

  if (elements.stripHeightSlider) {
    elements.stripHeightSlider.addEventListener('input', (e) => {
      state.stripHeightPercent = parseInt(e.target.value, 10);
      if (elements.stripHeightDisplay) elements.stripHeightDisplay.textContent = `${state.stripHeightPercent}%`;
      renderAndCompress();
    });
  }

  if (elements.nameUppercaseToggle) {
    elements.nameUppercaseToggle.addEventListener('change', (e) => {
      state.nameUppercase = e.target.checked;
      renderAndCompress();
    });
  }

  if (elements.downloadNameDatePhotoBtn) {
    elements.downloadNameDatePhotoBtn.addEventListener('click', downloadNameDateJpg);
  }

  // --- Touch-Up & Filters Listeners ---

  // 1-Click Signature Paper Cleaner
  if (elements.cleanSignatureBtn) {
    elements.cleanSignatureBtn.addEventListener('click', () => {
      state.signatureCleanerActive = true;
      state.grayscale = true;
      state.brightness = 0;
      state.contrast = 0;
      if (elements.grayscaleToggle) elements.grayscaleToggle.checked = true;
      if (elements.brightnessSlider) elements.brightnessSlider.value = 0;
      if (elements.contrastSlider) elements.contrastSlider.value = 0;
      if (elements.brightnessDisplay) elements.brightnessDisplay.textContent = '0%';
      if (elements.contrastDisplay) elements.contrastDisplay.textContent = '0%';
      renderAndCompress();
    });
  }

  if (elements.autoEnhanceBtn) {
    elements.autoEnhanceBtn.addEventListener('click', () => {
      state.signatureCleanerActive = false;
      state.brightness = 15;
      state.contrast = 25;
      if (elements.brightnessSlider) elements.brightnessSlider.value = 15;
      if (elements.contrastSlider) elements.contrastSlider.value = 25;
      if (elements.brightnessDisplay) elements.brightnessDisplay.textContent = '+15%';
      if (elements.contrastDisplay) elements.contrastDisplay.textContent = '+25%';
      renderAndCompress();
    });
  }

  // Rotate 90°
  const handleRotate = () => {
    state.rotation = (state.rotation + 90) % 360;
    renderAndCompress();
  };
  if (elements.rotateBtn) elements.rotateBtn.addEventListener('click', handleRotate);
  if (elements.rotateTabBtn) elements.rotateTabBtn.addEventListener('click', handleRotate);

  // Flip Horizontal (Mirror)
  const handleFlipH = () => {
    state.flipH = !state.flipH;
    renderAndCompress();
  };
  if (elements.flipHBtn) elements.flipHBtn.addEventListener('click', handleFlipH);
  if (elements.flipHTabBtn) elements.flipHTabBtn.addEventListener('click', handleFlipH);

  // Brightness & Contrast
  if (elements.brightnessSlider) {
    elements.brightnessSlider.addEventListener('input', (e) => {
      state.brightness = parseInt(e.target.value, 10);
      state.signatureCleanerActive = false; // Custom slider adjusts manually
      if (elements.brightnessDisplay) {
        elements.brightnessDisplay.textContent = `${state.brightness > 0 ? '+' : ''}${state.brightness}%`;
      }
      renderAndCompress();
    });
  }

  if (elements.contrastSlider) {
    elements.contrastSlider.addEventListener('input', (e) => {
      state.contrast = parseInt(e.target.value, 10);
      state.signatureCleanerActive = false;
      if (elements.contrastDisplay) {
        elements.contrastDisplay.textContent = `${state.contrast > 0 ? '+' : ''}${state.contrast}%`;
      }
      renderAndCompress();
    });
  }

  if (elements.grayscaleToggle) {
    elements.grayscaleToggle.addEventListener('change', (e) => {
      state.grayscale = e.target.checked;
      renderAndCompress();
    });
  }

  // Aspect-Ratio Crop Presets (Free, Passport 3.5:4.5, Square 1:1, Signature 3:1)
  if (elements.cropPresetsGrid) {
    elements.cropPresetsGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.aspect-btn');
      if (!btn) return;
      elements.cropPresetsGrid.querySelectorAll('.aspect-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const ratio = btn.getAttribute('data-ratio');
      state.cropRatio = ratio;

      if (ratio === '3.5:4.5') {
        state.currentWidth = 350;
        state.currentHeight = 450;
      } else if (ratio === '1:1') {
        const side = Math.min(state.currentWidth, state.currentHeight);
        state.currentWidth = side;
        state.currentHeight = side;
      } else if (ratio === '3:1') {
        state.currentWidth = 300;
        state.currentHeight = 100;
      } else if (ratio === 'free') {
        state.currentWidth = state.originalWidth || 200;
        state.currentHeight = state.originalHeight || 230;
      }

      if (elements.dimWidth) elements.dimWidth.value = state.currentWidth;
      if (elements.dimHeight) elements.dimHeight.value = state.currentHeight;

      renderAndCompress();
    });
  }

  // Reset Filters & Transforms
  if (elements.resetFiltersBtn) {
    elements.resetFiltersBtn.addEventListener('click', () => {
      state.brightness = 0;
      state.contrast = 0;
      state.grayscale = false;
      state.signatureCleanerActive = false;
      state.flipH = false;
      state.rotation = 0;
      state.cropRatio = 'free';

      if (elements.brightnessSlider) elements.brightnessSlider.value = 0;
      if (elements.contrastSlider) elements.contrastSlider.value = 0;
      if (elements.grayscaleToggle) elements.grayscaleToggle.checked = false;
      if (elements.brightnessDisplay) elements.brightnessDisplay.textContent = '0%';
      if (elements.contrastDisplay) elements.contrastDisplay.textContent = '0%';

      if (elements.cropPresetsGrid) {
        elements.cropPresetsGrid.querySelectorAll('.aspect-btn').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-ratio') === 'free');
        });
      }

      state.currentWidth = state.originalWidth || 200;
      state.currentHeight = state.originalHeight || 230;
      if (elements.dimWidth) elements.dimWidth.value = state.currentWidth;
      if (elements.dimHeight) elements.dimHeight.value = state.currentHeight;

      renderAndCompress();
    });
  }

  // Viewport Zoom
  if (elements.zoomInBtn) {
    elements.zoomInBtn.addEventListener('click', () => {
      state.zoom = Math.min(2.5, state.zoom + 0.15);
      if (elements.canvasWrapper) elements.canvasWrapper.style.transform = `scale(${state.zoom})`;
      if (elements.zoomLevelTag) elements.zoomLevelTag.textContent = `${Math.round(state.zoom * 100)}%`;
    });
  }

  if (elements.zoomOutBtn) {
    elements.zoomOutBtn.addEventListener('click', () => {
      state.zoom = Math.max(0.3, state.zoom - 0.15);
      if (elements.canvasWrapper) elements.canvasWrapper.style.transform = `scale(${state.zoom})`;
      if (elements.zoomLevelTag) elements.zoomLevelTag.textContent = `${Math.round(state.zoom * 100)}%`;
    });
  }

  if (elements.resetZoomBtn) {
    elements.resetZoomBtn.addEventListener('click', () => {
      state.zoom = 1;
      if (elements.canvasWrapper) elements.canvasWrapper.style.transform = 'scale(1)';
      if (elements.zoomLevelTag) elements.zoomLevelTag.textContent = '100%';
    });
  }

  // Download & Reset Buttons
  if (elements.downloadBtn) {
    elements.downloadBtn.addEventListener('click', downloadFile);
  }

  if (elements.clearBtn) {
    elements.clearBtn.addEventListener('click', resetStudio);
  }

  // PDF Presets & Multi-Page Manager Listeners
  if (elements.pdfPresetGrid) {
    elements.pdfPresetGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (!chip) return;
      elements.pdfPresetGrid.querySelectorAll('.preset-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const kb = parseInt(chip.getAttribute('data-pdfkb'), 10) || 200;
      state.pdfTargetKb = kb;
      if (elements.pdfTargetLimitTag) {
        elements.pdfTargetLimitTag.textContent = `Strict <${kb} KB`;
      }
      if (elements.generatePdfBtn) {
        elements.generatePdfBtn.innerHTML = `<span aria-hidden="true">📄</span> Generate &amp; Download PDF (&lt;${kb} KB)`;
      }
    });
  }

  if (elements.pdfOrientation) {
    elements.pdfOrientation.addEventListener('change', (e) => {
      state.pdfOrientation = e.target.value;
    });
  }

  if (elements.addPdfPageBtn && elements.pdfMultiFileInput) {
    elements.addPdfPageBtn.addEventListener('click', () => {
      elements.pdfMultiFileInput.click();
    });
  }

  if (elements.pdfMultiFileInput) {
    elements.pdfMultiFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        addPdfFiles(e.target.files);
        elements.pdfMultiFileInput.value = ''; // Reset input so same file can be selected again
      }
    });
  }

  if (elements.addCurrentCanvasToPdfBtn) {
    elements.addCurrentCanvasToPdfBtn.addEventListener('click', addCurrentCanvasToPdf);
  }

  if (elements.clearAllPdfPagesBtn) {
    elements.clearAllPdfPagesBtn.addEventListener('click', clearAllPdfPages);
  }

  if (elements.generatePdfBtn) {
    elements.generatePdfBtn.addEventListener('click', compileAndDownloadPdf);
  }

  // PDF Mode Switcher (Compiler vs Extractor)
  if (elements.pdfModeCompilerBtn) {
    elements.pdfModeCompilerBtn.addEventListener('click', () => switchPdfMode('compiler'));
  }
  if (elements.pdfModeExtractorBtn) {
    elements.pdfModeExtractorBtn.addEventListener('click', () => switchPdfMode('extractor'));
  }

  // PDF to JPG Extractor Listeners
  if (elements.selectPdfForExtractBtn && elements.pdfExtractorFileInput) {
    elements.selectPdfForExtractBtn.addEventListener('click', () => {
      elements.pdfExtractorFileInput.click();
    });
  }

  if (elements.pdfExtractorFileInput) {
    elements.pdfExtractorFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePdfExtractorFile(e.target.files[0]);
        elements.pdfExtractorFileInput.value = '';
      }
    });
  }

  if (elements.pdfRenderScaleSelect) {
    elements.pdfRenderScaleSelect.addEventListener('change', (e) => {
      state.pdfRenderScale = parseFloat(e.target.value) || 2.0;
    });
  }

  if (elements.downloadAllPagesJpgBtn) {
    elements.downloadAllPagesJpgBtn.addEventListener('click', downloadAllExtractedPagesJpg);
  }

  // Set default preset on startup
  applyPreset('bpsc-photo');
}

/**
 * Add image files to the PDF Pages collection
 * @param {FileList|Array<File>} files
 */
export function addPdfFiles(files) {
  if (!files || files.length === 0) return;

  const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (validFiles.length === 0) {
    alert('Kripya image file (JPG, PNG, WebP) chunein.');
    return;
  }

  validFiles.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        state.pdfPages.push({
          id: 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name: file.name,
          file: file,
          dataUrl: dataUrl,
          img: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          sizeBytes: file.size
        });
        renderPdfPagesList();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Add the current active workspace photo to the PDF Pages collection
 */
export function addCurrentCanvasToPdf() {
  if (!elements.canvas || !state.originalImage) {
    alert('Pehle Left Workspace me photo upload karein ya yahan "+ Add Photos" button se chunein.');
    return;
  }

  const dataUrl = elements.canvas.toDataURL('image/jpeg', 0.95);
  const img = new Image();
  img.onload = () => {
    const baseName = state.loadedFile ? state.loadedFile.name.replace(/\.[^/.]+$/, '') : 'workspace_photo';
    state.pdfPages.push({
      id: 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: `${baseName}_page.jpg`,
      file: null,
      dataUrl: dataUrl,
      img: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      sizeBytes: Math.round(dataUrl.length * 0.75)
    });
    renderPdfPagesList();
  };
  img.src = dataUrl;
}

/**
 * Renders the visual page cards in Tab 3
 */
export function renderPdfPagesList() {
  if (!elements.pdfPagesList) return;

  const count = state.pdfPages.length;
  if (elements.pdfPageCount) elements.pdfPageCount.textContent = count;

  if (count === 0) {
    elements.pdfPagesList.innerHTML = `
      <div class="pdf-empty-state" id="pdfEmptyState">
        <span>📄 Abhi koi page add nahi hai.<br>Upar button se Aadhaar Front/Back ya Marksheet add karein.</span>
      </div>
    `;
    if (elements.clearAllPdfPagesBtn) elements.clearAllPdfPagesBtn.style.display = 'none';
    if (elements.generatePdfBtn) {
      elements.generatePdfBtn.disabled = !state.originalImage;
    }
    return;
  }

  if (elements.clearAllPdfPagesBtn) elements.clearAllPdfPagesBtn.style.display = 'inline-block';
  if (elements.generatePdfBtn) elements.generatePdfBtn.disabled = false;

  elements.pdfPagesList.innerHTML = '';

  state.pdfPages.forEach((page, index) => {
    const card = document.createElement('div');
    card.className = 'pdf-page-card';
    card.setAttribute('data-id', page.id);

    const isFirst = index === 0;
    const isLast = index === count - 1;

    card.innerHTML = `
      <span class="pdf-page-badge">P${index + 1}</span>
      <img src="${page.dataUrl}" class="pdf-page-thumb" alt="Page ${index + 1}" />
      <div class="pdf-page-details">
        <span class="pdf-page-title" title="${page.name}">${page.name}</span>
        <span class="pdf-page-meta">${page.width}×${page.height} px · ${formatBytes(page.sizeBytes)}</span>
      </div>
      <div class="pdf-page-actions">
        <button type="button" class="pdf-page-action-btn btn-up" title="Move Up (Pehle layein)" ${isFirst ? 'disabled' : ''}>↑</button>
        <button type="button" class="pdf-page-action-btn btn-down" title="Move Down (Baad me layein)" ${isLast ? 'disabled' : ''}>↓</button>
        <button type="button" class="pdf-page-action-btn btn-remove" title="Remove Page">✕</button>
      </div>
    `;

    card.querySelector('.btn-up')?.addEventListener('click', () => movePdfPage(index, -1));
    card.querySelector('.btn-down')?.addEventListener('click', () => movePdfPage(index, 1));
    card.querySelector('.btn-remove')?.addEventListener('click', () => removePdfPage(index));

    elements.pdfPagesList.appendChild(card);
  });
}

/**
 * Reorder page up (-1) or down (+1)
 */
export function movePdfPage(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.pdfPages.length) return;
  const temp = state.pdfPages[index];
  state.pdfPages[index] = state.pdfPages[newIndex];
  state.pdfPages[newIndex] = temp;
  renderPdfPagesList();
}

/**
 * Remove a specific page
 */
export function removePdfPage(index) {
  state.pdfPages.splice(index, 1);
  renderPdfPagesList();
}

/**
 * Clear all PDF pages
 */
export function clearAllPdfPages() {
  state.pdfPages = [];
  renderPdfPagesList();
}

/**
 * High-Performance Client-Side A4 PDF Compiler with Strict KB Guarantee
 */
export async function compileAndDownloadPdf() {
  // If no explicit pages in list but main workspace has an image, auto-add it
  if (state.pdfPages.length === 0 && state.originalImage && elements.canvas) {
    addCurrentCanvasToPdf();
    await new Promise((r) => setTimeout(r, 60));
  }

  if (state.pdfPages.length === 0) {
    alert('Kripya kam se kam ek document photo (Aadhaar, Marksheet) add karein.');
    return;
  }

  const btn = elements.generatePdfBtn;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span aria-hidden="true">⏳</span> Compiling PDF (&lt;${state.pdfTargetKb} KB)…`;
  }

  if (elements.pdfProgressBox) elements.pdfProgressBox.style.display = 'block';
  if (elements.pdfSuccessNotice) elements.pdfSuccessNotice.style.display = 'none';

  try {
    const result = await generateA4PdfFromImages(state.pdfPages, state.pdfTargetKb, {
      orientation: state.pdfOrientation || 'portrait',
      onProgress: (step, total, message) => {
        const percent = Math.round((step / total) * 100);
        if (elements.pdfProgressFill) elements.pdfProgressFill.style.width = `${percent}%`;
        if (elements.pdfProgressText) elements.pdfProgressText.textContent = message;
      }
    });

    // Instant download
    const filename = `biharfast_rtps_${state.pdfTargetKb}kb_${Date.now()}.pdf`;
    downloadPdf(result.blob, filename);

    // Show success feedback
    if (elements.pdfSuccessNotice && elements.pdfSuccessNoticeText) {
      elements.pdfSuccessNotice.style.display = 'flex';
      elements.pdfSuccessNoticeText.innerHTML = `<strong>PDF Safaltapoorvak Download Hua!</strong> Final Size: <strong>${result.finalKB} KB</strong> (${result.pageCount} Pages, Strict &lt;${state.pdfTargetKb} KB).`;
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    alert('PDF generate karne me dikkat aayi: ' + error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span aria-hidden="true">📄</span> Generate &amp; Download PDF (&lt;${state.pdfTargetKb} KB)`;
    }
    setTimeout(() => {
      if (elements.pdfProgressBox) elements.pdfProgressBox.style.display = 'none';
    }, 3000);
  }
}

// ==========================================
// PDF TO JPG EXTRACTOR METHODS (PDF.js)
// ==========================================

/**
 * Switch Tab 3 submode between 'compiler' and 'extractor'
 * @param {'compiler'|'extractor'} mode
 */
export function switchPdfMode(mode) {
  state.pdfExtractorMode = mode;
  if (mode === 'compiler') {
    elements.pdfModeCompilerBtn?.classList.add('active');
    elements.pdfModeExtractorBtn?.classList.remove('active');
    if (elements.pdfCompilerSection) elements.pdfCompilerSection.style.display = 'block';
    if (elements.pdfExtractorSection) elements.pdfExtractorSection.style.display = 'none';
  } else {
    elements.pdfModeCompilerBtn?.classList.remove('active');
    elements.pdfModeExtractorBtn?.classList.add('active');
    if (elements.pdfCompilerSection) elements.pdfCompilerSection.style.display = 'none';
    if (elements.pdfExtractorSection) elements.pdfExtractorSection.style.display = 'block';
  }
}

/**
 * Handles incoming PDF file in Extractor mode: renders all pages with PDF.js
 * @param {File} file
 */
export async function handlePdfExtractorFile(file) {
  if (!file) return;

  switchPdfMode('extractor');

  if (elements.pdfExtractProgressBox) elements.pdfExtractProgressBox.style.display = 'block';
  if (elements.pdfExtractProgressFill) elements.pdfExtractProgressFill.style.width = '10%';
  if (elements.pdfExtractProgressText) elements.pdfExtractProgressText.textContent = `Loading ${truncateFilename(file.name)}…`;

  try {
    const scale = state.pdfRenderScale || 2.0;
    const pages = await extractAllPdfPages(file, {
      scale,
      onProgress: (current, total, message) => {
        const percent = total > 0 ? Math.round((current / total) * 100) : 10;
        if (elements.pdfExtractProgressFill) elements.pdfExtractProgressFill.style.width = `${percent}%`;
        if (elements.pdfExtractProgressText) elements.pdfExtractProgressText.textContent = message;
      }
    });

    state.extractedPdfPages = pages;
    renderExtractedPdfPagesList(file.name);

    // If workspace doesn't have an active image yet, auto-load Page 1
    if (pages.length > 0 && (!state.originalImage || !state.loadedFile || state.loadedFile.type === 'application/pdf')) {
      sendExtractedPageToResizer(pages[0], file.name, false);
    }
  } catch (error) {
    console.error('PDF extraction failed:', error);
    alert('PDF pages extract karne me dikkat aayi: ' + error.message);
  } finally {
    setTimeout(() => {
      if (elements.pdfExtractProgressBox) elements.pdfExtractProgressBox.style.display = 'none';
    }, 1500);
  }
}

/**
 * Renders the visual page cards in the Extractor section
 * @param {string} [pdfFileName='document.pdf']
 */
export function renderExtractedPdfPagesList(pdfFileName = 'document.pdf') {
  if (!elements.pdfExtractedPagesList) return;

  const count = state.extractedPdfPages.length;
  if (elements.pdfExtractedCount) elements.pdfExtractedCount.textContent = count;

  if (count === 0) {
    elements.pdfExtractedPagesList.innerHTML = `
      <div class="pdf-empty-state" id="pdfExtractEmptyState">
        <span>📄 Abhi koi PDF load nahi hai.<br>Upar button se PDF Document upload karein.</span>
      </div>
    `;
    if (elements.downloadAllPagesJpgBtn) elements.downloadAllPagesJpgBtn.style.display = 'none';
    return;
  }

  if (elements.downloadAllPagesJpgBtn) elements.downloadAllPagesJpgBtn.style.display = 'inline-block';
  elements.pdfExtractedPagesList.innerHTML = '';

  const baseName = pdfFileName.replace(/\.[^/.]+$/, '');

  state.extractedPdfPages.forEach((page) => {
    const card = document.createElement('div');
    card.className = 'pdf-extract-card';

    // Thumbnail DataURL
    const thumbUrl = page.toDataUrl(0.7);

    card.innerHTML = `
      <img src="${thumbUrl}" class="pdf-extract-thumb" alt="Page ${page.pageNumber}" />
      <div class="pdf-extract-info">
        <span class="pdf-extract-title">Page ${page.pageNumber}</span>
        <span class="pdf-extract-meta">${page.width} × ${page.height} px · Crisp</span>
      </div>
      <div class="pdf-extract-actions">
        <button type="button" class="aspect-btn btn-send-resizer" title="Send this page directly into KB Resizer">
          ⚡ Send to Resizer
        </button>
        <button type="button" class="aspect-btn btn-download-jpg" title="Download this page as JPG">
          ⬇ Download JPG
        </button>
      </div>
    `;

    card.querySelector('.btn-download-jpg')?.addEventListener('click', () => {
      downloadCanvasAsJpg(page.canvas, `${baseName}_page_${page.pageNumber}.jpg`, 0.92);
    });

    card.querySelector('.btn-send-resizer')?.addEventListener('click', () => {
      sendExtractedPageToResizer(page, pdfFileName, true);
    });

    elements.pdfExtractedPagesList.appendChild(card);
  });
}

/**
 * Sends an extracted PDF canvas page directly into the main workspace & KB Resizer Tab
 * @param {Object} page Extracted page object
 * @param {string} [pdfFileName='document.pdf'] Original PDF file name
 * @param {boolean} [switchTab=true] Whether to auto-switch to Tab 1
 */
export function sendExtractedPageToResizer(page, pdfFileName = 'document.pdf', switchTab = true) {
  if (!page || !page.canvas) return;

  const baseName = pdfFileName.replace(/\.[^/.]+$/, '');
  const dataUrl = page.toDataUrl(0.95);
  const img = new Image();

  img.onload = () => {
    state.originalImage = img;
    state.originalWidth = img.naturalWidth || img.width;
    state.originalHeight = img.naturalHeight || img.height;
    state.currentWidth = state.originalWidth;
    state.currentHeight = state.originalHeight;
    state.rotation = 0;
    state.flipH = false;
    state.cropRatio = 'free';

    // Create a virtual File object for UI tags
    state.loadedFile = {
      name: `${baseName}_page_${page.pageNumber}.jpg`,
      size: Math.round(dataUrl.length * 0.75),
      type: 'image/jpeg'
    };
    state.originalSizeBytes = state.loadedFile.size;

    updateBeforeReadout();

    if (elements.dimWidth) elements.dimWidth.value = state.currentWidth;
    if (elements.dimHeight) elements.dimHeight.value = state.currentHeight;

    // Show workspace canvas
    if (elements.dropzone) elements.dropzone.style.display = 'none';
    if (elements.canvasWrapper) elements.canvasWrapper.style.display = 'block';
    if (elements.workspaceCard) elements.workspaceCard.classList.add('has-file');

    enableActionButtons(true);
    renderAndCompress();

    // Switch to Tab 1 (KB Resizer)
    if (switchTab) {
      const resizerTabBtn = document.querySelector('.tab-btn[data-target="pane-resizer"]');
      if (resizerTabBtn) resizerTabBtn.click();

      if (elements.targetStatusText) {
        elements.targetStatusText.textContent = `✓ Page ${page.pageNumber} loaded! Ab ise 20-50 KB ya Passport Size crop karein.`;
        elements.targetStatusText.style.color = 'var(--green)';
      }
    }
  };

  img.src = dataUrl;
}

/**
 * Downloads all extracted pages sequentially as JPGs
 */
export async function downloadAllExtractedPagesJpg() {
  if (!state.extractedPdfPages || state.extractedPdfPages.length === 0) return;

  const baseName = state.loadedFile ? state.loadedFile.name.replace(/\.[^/.]+$/, '') : 'document';
  for (let i = 0; i < state.extractedPdfPages.length; i++) {
    const page = state.extractedPdfPages[i];
    downloadCanvasAsJpg(page.canvas, `${baseName}_page_${page.pageNumber}.jpg`, 0.92);
    // Pause 350ms between downloads to avoid browser popup blocks
    await new Promise((r) => setTimeout(r, 350));
  }
}

// Utility Helpers
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 KB';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function truncateFilename(name) {
  if (!name) return 'File';
  if (name.length > 20) return name.substring(0, 12) + '…' + name.slice(-5);
  return name;
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStudio);
  } else {
    initStudio();
  }
}

export default {
  state,
  EXAM_PRESETS,
  getTodayDateFormatted,
  handleFile,
  renderCanvas,
  runCompression,
  renderAndCompress,
  applyPreset,
  downloadNameDateJpg,
  downloadFile,
  resetStudio,
  updateStatusBadges,
  addPdfFiles,
  addCurrentCanvasToPdf,
  renderPdfPagesList,
  movePdfPage,
  removePdfPage,
  clearAllPdfPages,
  compileAndDownloadPdf,
  switchPdfMode,
  handlePdfExtractorFile,
  renderExtractedPdfPagesList,
  sendExtractedPageToResizer,
  downloadAllExtractedPagesJpg,
  initStudio
};
