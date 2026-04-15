// Minimal QR Code generator + desktop overlay controller
// Generates a QR code on a canvas element for the current page URL

(function () {
  'use strict';

  // ---- Tiny QR Code encoder (numeric/alphanumeric/byte, version 1-10, ECC-L) ----
  // Based on the QR spec, stripped to essentials for URL-length strings.

  const EC_LEVEL = 1; // 0=M,1=L,2=H,3=Q

  // Error correction codewords per version (ECC level L)
  const EC_CODEWORDS = [
    , 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
  ];

  // Total data codewords per version (ECC level L)
  const TOTAL_CODEWORDS = [
    , 26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  ];

  // Number of EC blocks per version (ECC level L)
  const NUM_BLOCKS = [, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];

  function getVersion(byteLen) {
    // Data capacity for byte mode, ECC level L
    const caps = [, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
    for (let v = 1; v <= 10; v++) {
      if (byteLen <= caps[v]) return v;
    }
    return 10; // clamp
  }

  function getSize(ver) {
    return ver * 4 + 17;
  }

  // Galois field arithmetic in GF(256)
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x = x * 2 ^ (x >= 128 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function polyMul(a, b) {
    const out = new Uint8Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++)
        out[i + j] ^= gfMul(a[i], b[j]);
    return out;
  }

  function polyDiv(dividend, divisor) {
    let result = new Uint8Array(dividend);
    for (let i = 0; i < dividend.length - divisor.length + 1; i++) {
      if (result[i] === 0) continue;
      const coef = result[i];
      for (let j = 0; j < divisor.length; j++) {
        result[i + j] ^= gfMul(divisor[j], coef);
      }
    }
    return result.slice(dividend.length - divisor.length + 1);
  }

  function getGeneratorPoly(n) {
    let g = new Uint8Array([1]);
    for (let i = 0; i < n; i++) {
      g = polyMul(g, new Uint8Array([1, GF_EXP[i]]));
    }
    return g;
  }

  function encodeData(url) {
    const bytes = new TextEncoder().encode(url);
    const ver = getVersion(bytes.length);
    const totalCW = TOTAL_CODEWORDS[ver];
    const ecCW = EC_CODEWORDS[ver];
    const dataCW = totalCW - ecCW;

    // Build data bitstream: mode(4) + charcount(8) + data + terminator + padding
    const bits = [];
    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    }

    pushBits(0b0100, 4); // byte mode
    pushBits(bytes.length, ver <= 9 ? 8 : 16);
    for (const b of bytes) pushBits(b, 8);

    // Terminator
    const maxBits = dataCW * 8;
    const termLen = Math.min(4, maxBits - bits.length);
    pushBits(0, termLen);

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad bytes
    const pads = [0b11101100, 0b00010001];
    let pi = 0;
    while (bits.length < maxBits) {
      pushBits(pads[pi], 8);
      pi ^= 1;
    }

    // Convert to codewords
    const dataCodewords = new Uint8Array(dataCW);
    for (let i = 0; i < dataCW; i++) {
      let val = 0;
      for (let b = 0; b < 8; b++) val = (val << 1) | (bits[i * 8 + b] || 0);
      dataCodewords[i] = val;
    }

    // Error correction
    const numBlocks = NUM_BLOCKS[ver];
    const blockSize = Math.floor(dataCW / numBlocks);
    const longBlocks = dataCW % numBlocks;
    const ecPerBlock = ecCW / numBlocks;
    const gen = getGeneratorPoly(ecPerBlock);

    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (let b = 0; b < numBlocks; b++) {
      const sz = blockSize + (b >= numBlocks - longBlocks ? 1 : 0);
      const block = dataCodewords.slice(offset, offset + sz);
      offset += sz;
      dataBlocks.push(block);

      const padded = new Uint8Array(sz + ecPerBlock);
      padded.set(block);
      ecBlocks.push(polyDiv(padded, gen));
    }

    // Interleave
    const result = [];
    const maxDataLen = blockSize + (longBlocks > 0 ? 1 : 0);
    for (let i = 0; i < maxDataLen; i++)
      for (let b = 0; b < numBlocks; b++)
        if (i < dataBlocks[b].length) result.push(dataBlocks[b][i]);
    for (let i = 0; i < ecPerBlock; i++)
      for (let b = 0; b < numBlocks; b++)
        result.push(ecBlocks[b][i]);

    return { codewords: new Uint8Array(result), version: ver };
  }

  // ---- QR Matrix placement ----

  function createMatrix(ver) {
    const size = getSize(ver);
    // 0=white, 1=black, -1=unset
    const m = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    return m;
  }

  function setModule(m, r, c, val) {
    if (r >= 0 && r < m.length && c >= 0 && c < m.length) m[r][c] = val ? 1 : 0;
  }

  function placeFinderPattern(m, row, col) {
    for (let dr = -1; dr <= 7; dr++)
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= m.length || c < 0 || c >= m.length) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        if (inInner || (inOuter && onBorder)) setModule(m, r, c, 1);
        else setModule(m, r, c, 0);
      }
  }

  function placeAlignmentPattern(m, row, col) {
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const on = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
        setModule(m, row + dr, col + dc, on ? 1 : 0);
      }
  }

  const ALIGNMENT_POSITIONS = [, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function placePatterns(m, ver) {
    const size = m.length;
    // Finder patterns
    placeFinderPattern(m, 0, 0);
    placeFinderPattern(m, 0, size - 7);
    placeFinderPattern(m, size - 7, 0);

    // Alignment patterns
    const positions = ALIGNMENT_POSITIONS[ver];
    if (positions.length > 1) {
      for (const r of positions)
        for (const c of positions) {
          // Skip if overlapping finder
          if (r <= 8 && c <= 8) continue;
          if (r <= 8 && c >= size - 8) continue;
          if (r >= size - 8 && c <= 8) continue;
          placeAlignmentPattern(m, r, c);
        }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setModule(m, 6, i, i % 2 === 0 ? 1 : 0);
      setModule(m, i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Dark module
    setModule(m, size - 8, 8, 1);

    // Reserve format info areas
    for (let i = 0; i < 8; i++) {
      if (m[8][i] === -1) setModule(m, 8, i, 0);
      if (m[8][size - 1 - i] === -1) setModule(m, 8, size - 1 - i, 0);
      if (m[i][8] === -1) setModule(m, i, 8, 0);
      if (m[size - 1 - i][8] === -1) setModule(m, size - 1 - i, 8, 0);
    }
    if (m[8][8] === -1) setModule(m, 8, 8, 0);

    // Reserve version info (ver >= 7)
    if (ver >= 7) {
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 3; j++) {
          if (m[i][size - 11 + j] === -1) setModule(m, i, size - 11 + j, 0);
          if (m[size - 11 + j][i] === -1) setModule(m, size - 11 + j, i, 0);
        }
    }
  }

  function placeData(m, codewords) {
    const size = m.length;
    let bitIdx = 0;
    const totalBits = codewords.length * 8;

    // Traverse columns right-to-left in pairs, bottom-to-top then top-to-bottom
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip timing column
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (let dx = 0; dx <= 1; dx++) {
          const col = right - dx;
          if (m[row][col] !== -1) continue;
          const bit = bitIdx < totalBits ? (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1 : 0;
          m[row][col] = bit;
          bitIdx++;
        }
      }
      upward = !upward;
    }
  }

  // Masking
  const MASK_FNS = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
  ];

  function applyMask(m, maskIdx, reserved) {
    const fn = MASK_FNS[maskIdx];
    const size = m.length;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (reserved[r][c] === -1 && fn(r, c)) m[r][c] ^= 1;
  }

  // Format info
  const FORMAT_BITS = [
    0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
    0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
    0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed,
    0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b,
  ];

  function placeFormatInfo(m, maskIdx) {
    const size = m.length;
    const ecBits = EC_LEVEL; // L=1
    const formatIdx = ecBits * 8 + maskIdx;
    const bits = FORMAT_BITS[formatIdx];

    const coords1 = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]];
    const coords2 = [[8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4], [8, size - 5], [8, size - 6], [8, size - 7], [8, size - 8], [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8], [size - 3, 8], [size - 2, 8], [size - 1, 8]];

    for (let i = 0; i < 15; i++) {
      const bit = (bits >> i) & 1;
      m[coords1[i][0]][coords1[i][1]] = bit;
      m[coords2[i][0]][coords2[i][1]] = bit;
    }
  }

  function scoreMask(m) {
    const size = m.length;
    let penalty = 0;

    // Rule 1: runs of 5+ same-color
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) run++;
        else { if (run >= 5) penalty += run - 2; run = 1; }
      }
      if (run >= 5) penalty += run - 2;
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) run++;
        else { if (run >= 5) penalty += run - 2; run = 1; }
      }
      if (run >= 5) penalty += run - 2;
    }

    // Rule 2: 2x2 blocks
    for (let r = 0; r < size - 1; r++)
      for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) penalty += 3;
      }

    return penalty;
  }

  function generateQR(url) {
    const { codewords, version } = encodeData(url);

    let bestMatrix = null;
    let bestScore = Infinity;

    for (let mask = 0; mask < 8; mask++) {
      const m = createMatrix(version);
      placePatterns(m, version);
      const reserved = m.map(row => new Int8Array(row));
      placeData(m, codewords);
      applyMask(m, mask, reserved);
      placeFormatInfo(m, mask);

      const score = scoreMask(m);
      if (score < bestScore) {
        bestScore = score;
        bestMatrix = m;
      }
    }

    return bestMatrix;
  }

  // ---- Canvas rendering ----

  function drawQR(canvas, matrix) {
    const size = matrix.length;
    const scale = Math.floor(canvas.width / (size + 8)); // quiet zone of 4 on each side
    const offset = Math.floor((canvas.width - size * scale) / 2);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (matrix[r][c] === 1)
          ctx.fillRect(offset + c * scale, offset + r * scale, scale, scale);
  }

  // ---- Init ----

  function init() {
    const overlay = document.getElementById('desktop-overlay');
    const canvas = document.getElementById('qr-canvas');
    const dismiss = document.getElementById('desktop-overlay-dismiss');
    if (!overlay || !canvas) return;

    // Check if already dismissed this session
    if (sessionStorage.getItem('ipodfolio-desktop-dismissed')) {
      overlay.classList.add('dismissed');
      return;
    }

    // Generate QR from current URL
    try {
      const url = window.location.href;
      const matrix = generateQR(url);
      drawQR(canvas, matrix);
    } catch (e) {
      console.warn('[iPodfolio] QR generation failed:', e);
      // Hide the QR canvas on failure, still show the message
      canvas.style.display = 'none';
    }

    // Dismiss button
    if (dismiss) {
      dismiss.addEventListener('click', () => {
        overlay.classList.add('dismissed');
        sessionStorage.setItem('ipodfolio-desktop-dismissed', '1');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
