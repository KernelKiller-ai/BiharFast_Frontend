/**
 * BiharFast KB Engine (kb-engine.js)
 * Pure client-side ES module with zero external dependencies.
 *
 * Implements:
 * 1. compressToExactKB(canvas, targetMinKB, targetMaxKB, mimeType)
 *    - Binary search on JPEG/WebP quality (0.05 to 0.98)
 *    - Gradual dimension scaling if quality compression alone cannot meet targetMaxKB
 *    - Automatic padding via increaseToMinKB if resulting file falls below targetMinKB
 * 2. increaseToMinKB(blob, targetMinKB)
 *    - Safely pads JPEG (COM markers) and PNG (tEXt ancillary chunk) bytes
 *    - Guarantees zero corruption of headers, metadata, or image display
 *
 * Returns: { blob, finalKB, width, height }
 */

// CRC-32 table for PNG chunk checksum calculation (ISO 3309)
let crcTableCache = null;

function getCrcTable() {
  if (crcTableCache) return crcTableCache;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  crcTableCache = table;
  return table;
}

function calculateCrc32(uint8Array, offset, length) {
  const table = getCrcTable();
  let c = 0xffffffff;
  const end = offset + length;
  for (let i = offset; i < end; i++) {
    c = table[(c ^ uint8Array[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Converts a Canvas or OffscreenCanvas to a Blob with specified quality and MIME type.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {number} quality (0.0 to 1.0)
 * @param {string} mimeType
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, quality, mimeType = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    if (!canvas) {
      return reject(new Error('Canvas element is required'));
    }

    if (typeof canvas.convertToBlob === 'function') {
      canvas.convertToBlob({ type: mimeType, quality })
        .then(resolve)
        .catch(reject);
      return;
    }

    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create Blob from canvas'));
      }, mimeType, quality);
      return;
    }

    reject(new Error('Canvas does not support blob conversion'));
  });
}

/**
 * Creates a high-quality downscaled copy of a canvas.
 * @param {HTMLCanvasElement|OffscreenCanvas} sourceCanvas
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function scaleCanvas(sourceCanvas, targetWidth, targetHeight) {
  let scaled;
  if (typeof OffscreenCanvas !== 'undefined') {
    scaled = new OffscreenCanvas(targetWidth, targetHeight);
  } else if (typeof document !== 'undefined') {
    scaled = document.createElement('canvas');
    scaled.width = targetWidth;
    scaled.height = targetHeight;
  } else {
    throw new Error('Canvas creation not supported in this environment');
  }

  const ctx = scaled.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return scaled;
}

/**
 * Safely extracts dimensions (width & height) from a Blob.
 * @param {Blob} blob
 * @returns {Promise<{width: number, height: number}>}
 */
async function getBlobDimensions(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return dimensions;
    } catch (_) {}
  }

  if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      img.src = url;
    });
  }

  return { width: 0, height: 0 };
}

/**
 * Safely pads a JPEG Uint8Array using standard COM (Comment - 0xFF 0xFE) marker segments.
 * Placed immediately after SOI (0xFF 0xD8). Decoders and validators treat this as standard
 * comment metadata without altering pixels or corrupting file structure.
 *
 * @param {Uint8Array} uint8
 * @param {number} targetBytes
 * @returns {Uint8Array}
 */
function padJpegBytes(uint8, targetBytes) {
  if (uint8.length >= targetBytes) return uint8;
  const needed = targetBytes - uint8.length;

  // Verify SOI marker (0xFF 0xD8)
  if (uint8[0] !== 0xff || uint8[1] !== 0xd8) {
    // If not standard SOI, append trailing safe zero padding
    const out = new Uint8Array(targetBytes);
    out.set(uint8, 0);
    return out;
  }

  // Build COM segments (Max segment length is 65535, so max payload is 65533)
  const segments = [];
  let remainingNeeded = needed;

  while (remainingNeeded > 0) {
    let segTotalBytes = Math.min(65535, remainingNeeded);
    // Minimum valid COM marker size is 4 bytes (2 marker + 2 length)
    if (segTotalBytes < 4) segTotalBytes = 4;

    const segLengthField = segTotalBytes - 2; // Length field includes its own 2 bytes
    const payloadLen = segLengthField - 2;

    const seg = new Uint8Array(segTotalBytes);
    seg[0] = 0xff; // Marker prefix
    seg[1] = 0xfe; // COM marker
    seg[2] = (segLengthField >> 8) & 0xff;
    seg[3] = segLengthField & 0xff;

    // Fill comment payload with safe spaces (ASCII 0x20)
    for (let i = 0; i < payloadLen; i++) {
      seg[4 + i] = 0x20;
    }

    segments.push(seg);
    remainingNeeded -= segTotalBytes;
  }

  const totalPaddingBytes = segments.reduce((sum, s) => sum + s.length, 0);
  const result = new Uint8Array(uint8.length + totalPaddingBytes);

  // Copy SOI (0xFF 0xD8)
  result.set(uint8.subarray(0, 2), 0);

  // Insert COM segments
  let currentOffset = 2;
  for (const seg of segments) {
    result.set(seg, currentOffset);
    currentOffset += seg.length;
  }

  // Copy the rest of the original JPEG
  result.set(uint8.subarray(2), currentOffset);

  return result;
}

/**
 * Safely pads a PNG Uint8Array using a standard 'tEXt' ancillary chunk.
 * Placed immediately after IHDR (at offset 33). Decoders safely ignore unrecognized
 * text chunks without visual distortion or corruption.
 *
 * @param {Uint8Array} uint8
 * @param {number} targetBytes
 * @returns {Uint8Array}
 */
function padPngBytes(uint8, targetBytes) {
  if (uint8.length >= targetBytes) return uint8;
  const needed = targetBytes - uint8.length;

  // Verify PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  const isPng =
    uint8[0] === 0x89 &&
    uint8[1] === 0x50 &&
    uint8[2] === 0x4e &&
    uint8[3] === 0x47 &&
    uint8[4] === 0x0d &&
    uint8[5] === 0x0a &&
    uint8[6] === 0x1a &&
    uint8[7] === 0x0a;

  if (!isPng) {
    const out = new Uint8Array(targetBytes);
    out.set(uint8, 0);
    return out;
  }

  // A PNG chunk consists of:
  // 4 bytes Length + 4 bytes Type ('tEXt') + Data + 4 bytes CRC = Data + 12 bytes
  // For 'tEXt': keyword "Comment\0" takes 8 bytes. Minimum total chunk = 20 bytes.
  const totalChunkBytes = Math.max(20, needed);
  const dataLen = totalChunkBytes - 12;
  const chunk = new Uint8Array(totalChunkBytes);
  const view = new DataView(chunk.buffer);

  // 1. Data length (big-endian)
  view.setUint32(0, dataLen, false);

  // 2. Chunk type: 'tEXt' (0x74, 0x45, 0x58, 0x74)
  chunk[4] = 0x74;
  chunk[5] = 0x45;
  chunk[6] = 0x58;
  chunk[7] = 0x74;

  // 3. Keyword: "Comment\0"
  const keyword = [0x43, 0x6f, 0x6d, 0x6d, 0x65, 0x6e, 0x74, 0x00];
  chunk.set(keyword, 8);

  // 4. Fill remaining text data with spaces (ASCII 0x20)
  for (let i = 16; i < 4 + 4 + dataLen; i++) {
    chunk[i] = 0x20;
  }

  // 5. CRC-32 over chunk type and chunk data
  const crc = calculateCrc32(chunk, 4, 4 + dataLen);
  view.setUint32(4 + 4 + dataLen, crc, false);

  // Insertion offset: Immediately after IHDR chunk
  // 8 bytes (PNG signature) + 4 (length) + 4 (IHDR) + 13 (IHDR data) + 4 (CRC) = 33 bytes
  const insertOffset = 33;
  const result = new Uint8Array(uint8.length + totalChunkBytes);

  result.set(uint8.subarray(0, insertOffset), 0);
  result.set(chunk, insertOffset);
  result.set(uint8.subarray(insertOffset), insertOffset + totalChunkBytes);

  return result;
}

/**
 * Core Function 2: increaseToMinKB
 * Safely pads JPEG/PNG bytes without corrupting image headers when a file
 * is smaller than the portal's minimum KB requirement.
 *
 * @param {Blob} blob - Original image blob
 * @param {number} targetMinKB - Minimum required file size in KB
 * @param {number|null} [knownWidth=null] - Optional known width in pixels
 * @param {number|null} [knownHeight=null] - Optional known height in pixels
 * @returns {Promise<{ blob: Blob, finalKB: number, width: number, height: number }>}
 */
export async function increaseToMinKB(blob, targetMinKB, knownWidth = null, knownHeight = null) {
  if (!blob) throw new Error('Blob is required');
  const targetBytes = Math.ceil(targetMinKB * 1024);

  // Determine dimensions if not already provided
  let width = knownWidth;
  let height = knownHeight;
  if (width === null || height === null) {
    const dims = await getBlobDimensions(blob);
    width = dims.width;
    height = dims.height;
  }

  // If already larger or equal to minimum requirement, no padding needed
  if (blob.size >= targetBytes) {
    return {
      blob,
      finalKB: Number((blob.size / 1024).toFixed(2)),
      width,
      height
    };
  }

  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const mime = (blob.type || '').toLowerCase();

  let paddedUint8;

  // Check JPEG signature (0xFF 0xD8)
  if (mime.includes('jpeg') || mime.includes('jpg') || (uint8[0] === 0xff && uint8[1] === 0xd8)) {
    paddedUint8 = padJpegBytes(uint8, targetBytes);
  }
  // Check PNG signature (0x89 0x50 0x4E 0x47)
  else if (mime.includes('png') || (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4e && uint8[3] === 0x47)) {
    paddedUint8 = padPngBytes(uint8, targetBytes);
  }
  // Fallback for WebP or other binary streams: append safe trailing zero bytes
  else {
    paddedUint8 = new Uint8Array(targetBytes);
    paddedUint8.set(uint8, 0);
  }

  const paddedBlob = new Blob([paddedUint8], { type: blob.type || 'image/jpeg' });

  return {
    blob: paddedBlob,
    finalKB: Number((paddedBlob.size / 1024).toFixed(2)),
    width,
    height
  };
}

/**
 * Core Function 1: compressToExactKB
 * Uses binary search on JPEG/WebP quality (0.05 to 0.98) and gradual dimension
 * scaling if quality compression alone cannot reach targetMaxKB.
 * Automatically guarantees targetMinKB using increaseToMinKB if file is too small.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - Source canvas
 * @param {number} targetMinKB - Minimum desired file size in KB (e.g. 20)
 * @param {number} targetMaxKB - Maximum desired file size in KB (e.g. 50)
 * @param {string} [mimeType='image/jpeg'] - Output MIME type ('image/jpeg', 'image/webp', 'image/png')
 * @returns {Promise<{ blob: Blob, finalKB: number, width: number, height: number }>}
 */
export async function compressToExactKB(canvas, targetMinKB, targetMaxKB, mimeType = 'image/jpeg') {
  if (!canvas || !canvas.width || !canvas.height) {
    throw new Error('Valid canvas element with non-zero dimensions is required');
  }

  let minKB = Number(targetMinKB) || 10;
  let maxKB = Number(targetMaxKB) || 50;
  if (minKB > maxKB) [minKB, maxKB] = [maxKB, minKB];

  const minBytes = Math.round(minKB * 1024);
  const maxBytes = Math.round(maxKB * 1024);

  let currentCanvas = canvas;
  let currentWidth = canvas.width;
  let currentHeight = canvas.height;

  const isLossy = mimeType === 'image/jpeg' || mimeType === 'image/webp';

  // --- Step 1: PNG / Lossless Handling ---
  if (!isLossy) {
    let blob = await canvasToBlob(currentCanvas, 1.0, mimeType);

    // Gradual downscaling if PNG exceeds maxKB
    while (blob.size > maxBytes && (currentWidth > 50 && currentHeight > 50)) {
      const scale = Math.min(0.9, Math.sqrt((maxBytes * 0.95) / blob.size));
      currentWidth = Math.max(50, Math.round(currentWidth * scale));
      currentHeight = Math.max(50, Math.round(currentHeight * scale));
      currentCanvas = scaleCanvas(canvas, currentWidth, currentHeight);
      blob = await canvasToBlob(currentCanvas, 1.0, mimeType);
    }

    if (blob.size < minBytes) {
      return await increaseToMinKB(blob, minKB, currentWidth, currentHeight);
    }

    return {
      blob,
      finalKB: Number((blob.size / 1024).toFixed(2)),
      width: currentWidth,
      height: currentHeight
    };
  }

  // --- Step 2: Lossy (JPEG / WebP) Handling ---
  // Check highest quality (0.98)
  const highBlob = await canvasToBlob(currentCanvas, 0.98, mimeType);
  if (highBlob.size <= maxBytes) {
    if (highBlob.size >= minBytes) {
      return {
        blob: highBlob,
        finalKB: Number((highBlob.size / 1024).toFixed(2)),
        width: currentWidth,
        height: currentHeight
      };
    }
    // File at maximum quality is still under targetMinKB (e.g. tiny blank signature)
    return await increaseToMinKB(highBlob, minKB, currentWidth, currentHeight);
  }

  // Check lowest quality (0.05)
  let lowBlob = await canvasToBlob(currentCanvas, 0.05, mimeType);

  // If even at quality 0.05 the file exceeds targetMaxKB, perform gradual dimension downscaling
  while (lowBlob.size > maxBytes && (currentWidth > 50 && currentHeight > 50)) {
    const scale = Math.min(0.88, Math.max(0.5, Math.sqrt((maxBytes * 0.92) / lowBlob.size)));
    currentWidth = Math.max(50, Math.round(currentWidth * scale));
    currentHeight = Math.max(50, Math.round(currentHeight * scale));
    currentCanvas = scaleCanvas(canvas, currentWidth, currentHeight);
    lowBlob = await canvasToBlob(currentCanvas, 0.05, mimeType);
  }

  // --- Step 3: Binary Search on Quality (0.05 to 0.98) ---
  let lowQ = 0.05;
  let highQ = 0.98;
  let bestBlob = lowBlob;
  const iterations = 8; // 8 iterations gives precision within ~0.0036 quality step

  for (let i = 0; i < iterations; i++) {
    const midQ = (lowQ + highQ) / 2;
    const testBlob = await canvasToBlob(currentCanvas, midQ, mimeType);

    if (testBlob.size <= maxBytes) {
      bestBlob = testBlob;
      lowQ = midQ; // Try higher quality while staying under maxBytes
    } else {
      highQ = midQ; // Too big, reduce quality
    }
  }

  // --- Step 4: Ensure targetMinKB is satisfied ---
  if (bestBlob.size < minBytes) {
    return await increaseToMinKB(bestBlob, minKB, currentWidth, currentHeight);
  }

  return {
    blob: bestBlob,
    finalKB: Number((bestBlob.size / 1024).toFixed(2)),
    width: currentWidth,
    height: currentHeight
  };
}

// Global browser window attachment for compatibility with non-module scripts
if (typeof window !== 'undefined') {
  window.BiharFastKBEngine = {
    compressToExactKB,
    increaseToMinKB
  };
}

export default {
  compressToExactKB,
  increaseToMinKB
};
