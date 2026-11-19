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

  // PDF
  pdfTargetKb: 195,
  pdfOrientation: 'portrait',
  pdfDpiQuality: 2
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

    // PDF Controls
    pdfPresetGrid: document.getElementById('pdfPresetGrid'),
    pdfOrientation: document.getElementById('pdfOrientation'),
    pdfCompressionSlider: document.getElementById('pdfCompressionSlider'),
    pdfDpiDisplay: document.getElementById('pdfDpiDisplay'),
    generatePdfBtn: document.getElementById('generatePdfBtn')
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

  // Render placeholder on canvas
  const canvas = elements.canvas;
  if (canvas) {
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PDF Document Uploaded', 300, 380);
    ctx.fillStyle = '#a4b0c2';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText(`${truncateFilename(file.name)} (${formatBytes(file.size)})`, 300, 415);
    ctx.fillText('RTPS <200KB Compression Ready', 300, 445);
  }

  enableActionButtons(true);
  if (elements.outputSizePill) elements.outputSizePill.textContent = formatBytes(file.size);
  if (elements.targetStatusText) {
    elements.targetStatusText.textContent = 'PDF ready for RTPS compression';
    elements.targetStatusText.style.color = 'var(--cyan)';
  }
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

  // PDF Presets & Generator
  if (elements.pdfPresetGrid) {
    elements.pdfPresetGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (!chip) return;
      elements.pdfPresetGrid.querySelectorAll('.preset-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.pdfTargetKb = parseInt(chip.getAttribute('data-pdfkb'), 10);
    });
  }

  if (elements.generatePdfBtn) {
    elements.generatePdfBtn.addEventListener('click', exportRtpsPdf);
  }

  // Set default preset on startup
  applyPreset('bpsc-photo');
}

/**
 * RTPS PDF Export via jsPDF
 */
function exportRtpsPdf() {
  if (!elements.canvas || !elements.canvas.width) return;

  elements.generatePdfBtn.disabled = true;
  elements.generatePdfBtn.innerHTML = 'Generating RTPS PDF…';

  try {
    const { jsPDF } = window.jspdf || {};
    const orient = (elements.pdfOrientation?.value === 'landscape') ? 'landscape' : 'portrait';

    let targetQuality = 0.65;
    const compressionLevel = parseInt(elements.pdfCompressionSlider?.value || '2', 10);
    if (compressionLevel === 1) targetQuality = 0.45;
    if (compressionLevel === 3) targetQuality = 0.85;

    const imgDataUrl = elements.canvas.toDataURL('image/jpeg', targetQuality);

    if (jsPDF) {
      const doc = new jsPDF({
        orientation: orient,
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2;

      const canvasAspect = elements.canvas.width / elements.canvas.height;
      let imgW = maxW;
      let imgH = imgW / canvasAspect;

      if (imgH > maxH) {
        imgH = maxH;
        imgW = imgH * canvasAspect;
      }

      const posX = (pageWidth - imgW) / 2;
      const posY = (pageHeight - imgH) / 2;

      doc.addImage(imgDataUrl, 'JPEG', posX, posY, imgW, imgH, undefined, 'FAST');
      doc.save(`biharfast_rtps_${state.pdfTargetKb}kb.pdf`);
    } else {
      const a = document.createElement('a');
      a.href = imgDataUrl;
      a.download = 'biharfast_rtps_doc.jpg';
      a.click();
    }
  } catch (err) {
    console.error('PDF error:', err);
    alert('PDF generate karne me dikkat aayi. JPG download karein.');
  } finally {
    elements.generatePdfBtn.disabled = false;
    elements.generatePdfBtn.innerHTML = '<span aria-hidden="true">📄</span> Generate RTPS PDF (<200 KB)';
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
  initStudio
};
