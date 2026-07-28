/*
 * GenPI.org DNA Morphogenetic Engine v2.10.0
 * Copyright (c) GECORP. All rights reserved.
 *
 * Browser-first, local-only, deterministic personal-genotype-to-art engine.
 *
 * Scientific design:
 * canonical sparse genotype -> multiscale Shannon/von Neumann fields ->
 * chromosomal graph wavelet bands -> open Hamiltonian-inspired dynamics ->
 * Gray-Scott morphogenesis -> fractal antenna backbone -> Mandelbrot-forward DNA-deformed rendering.
 *
 * This is a generative-art model inspired by Garcia (2026), not a clinical,
 * diagnostic, ancestry, trait, or literal molecular quantum-state analysis.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GenPiDNA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENGINE_VERSION = '2.10.0';
  const ENGINE_NAMESPACE = 'GENPI-DNA-MORPHOGENETIC-v2.10';
  // Preserve the exact private seed contract of Nahuel's approved rc.1 images.
  // Release promotion must not silently redesign an already-approved artwork.
  const SEED_CONTRACT = 'GENPI-DNA-MORPHOGENETIC-v2.10-visual-rc1|2.10.0-visual-rc.1';
  const SUPPORTED_SOURCES = Object.freeze(['23andMe', 'Ancestry.com']);
  const CHROMOSOMES = Object.freeze([
    '1','2','3','4','5','6','7','8','9','10','11','12',
    '13','14','15','16','17','18','19','20','21','22','X','Y','MT'
  ]);
  const CHR_INDEX = new Map(CHROMOSOMES.map((c, i) => [c, i]));
  const BASES = Object.freeze(['A', 'C', 'G', 'T']);
  const BASE_INDEX = Object.freeze({ A: 0, C: 1, G: 2, T: 3 });
  const GENOTYPES = Object.freeze(['AA','AC','AG','AT','CC','CG','CT','GG','GT','TT']);
  const GENOTYPE_INDEX = new Map(GENOTYPES.map((g, i) => [g, i]));

  const DEFAULTS = Object.freeze({
    width: 3600,
    height: 5400,
    dpi: 300,
    renderWidth: 1800,
    renderHeight: 2700,
    fieldWidth: 320,
    fieldHeight: 480,
    binsPerChromosome: 48,
    dynamicsSteps: 160,
    morphogenesisSteps: 96,
    minVariants: 100,
    maxFileBytes: 100 * 1024 * 1024,
    maxCgrRecords: 800000,
    includeMetadata: false
  });
  let config = { ...DEFAULTS };

  class GenPiDNAError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'GenPiDNAError';
      this.code = code;
    }
  }

  function configure(options) {
    const next = { ...config, ...(options || {}) };
    const ints = ['width','height','dpi','renderWidth','renderHeight','fieldWidth','fieldHeight','binsPerChromosome','dynamicsSteps','morphogenesisSteps','minVariants','maxFileBytes','maxCgrRecords'];
    for (const key of ints) {
      if (!Number.isInteger(next[key]) || next[key] <= 0) throw new GenPiDNAError('GENPI_CONFIG', `${key} must be a positive integer.`);
    }
    if (Math.abs(next.width / next.height - 2 / 3) > 0.002) throw new GenPiDNAError('GENPI_CONFIG', 'Master output must keep a 2:3 portrait aspect ratio.');
    if (Math.abs(next.renderWidth / next.renderHeight - 2 / 3) > 0.002) throw new GenPiDNAError('GENPI_CONFIG', 'Render surface must keep a 2:3 portrait aspect ratio.');
    if (Math.abs(next.fieldWidth / next.fieldHeight - 2 / 3) > 0.002) throw new GenPiDNAError('GENPI_CONFIG', 'Morphogenetic field must keep a 2:3 portrait aspect ratio.');
    if (next.width < next.renderWidth || next.height < next.renderHeight) throw new GenPiDNAError('GENPI_CONFIG', 'Master output cannot be smaller than the render surface.');
    if (next.dpi < 72 || next.dpi > 1200) throw new GenPiDNAError('GENPI_CONFIG', 'dpi must be between 72 and 1200.');
    if (next.binsPerChromosome < 4 || next.binsPerChromosome > 64) throw new GenPiDNAError('GENPI_CONFIG', 'binsPerChromosome must be between 4 and 64.');
    if (next.fieldWidth * next.fieldHeight > 1000000) throw new GenPiDNAError('GENPI_CONFIG', 'Morphogenetic field is too large for safe browser execution.');
    config = next;
    return { ...config };
  }

  function resetConfig() {
    config = { ...DEFAULTS };
    return { ...config };
  }

  function normalizeSource(source) {
    const s = String(source || '').trim().toLowerCase();
    if (s === '23andme' || s === '23&me' || s === '23 and me') return '23andMe';
    if (s === 'ancestry' || s === 'ancestrydna' || s === 'ancestry.com') return 'Ancestry.com';
    return null;
  }

  function supports(source) {
    return Boolean(normalizeSource(source));
  }

  function splitCsvLine(line) {
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        out.push(current.trim());
        current = '';
      } else current += ch;
    }
    out.push(current.trim());
    return out;
  }

  function normalizeChromosome(value) {
    let c = String(value || '').trim().replace(/^chr/i, '').toUpperCase();
    if (c === 'M' || c === 'MITO' || c === 'MTDNA') c = 'MT';
    return CHR_INDEX.has(c) ? c : '';
  }

  function normalizePosition(value) {
    const s = String(value || '').trim();
    if (!/^\d+$/.test(s)) return 0;
    const n = Number(s);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  }

  function normalizeRsid(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function normalizeGenotype(value) {
    const compact = String(value || '').toUpperCase().replace(/[\s/|]/g, '');
    if (!compact || compact === '--' || compact === '00' || /^-+$/.test(compact)) return '--';
    const clean = compact.replace(/[^ACGTID]/g, '');
    if (!clean) return '--';
    if (/^[ACGT]{2}$/.test(clean)) return clean.split('').sort().join('');
    if (/^[ACGT]$/.test(clean)) return clean;
    if (/^[ID]{1,2}$/.test(clean)) return clean.split('').sort().join('');
    return clean.slice(0, 4);
  }

  function looksLikeHeader(parts) {
    const joined = parts.join(' ').toLowerCase();
    return joined.includes('rsid') && (joined.includes('chromosome') || joined.includes('position'));
  }

  function chromosomeSort(a, b) {
    const ca = CHR_INDEX.get(a.chromosome);
    const cb = CHR_INDEX.get(b.chromosome);
    return ca - cb || a.position - b.position || a.rsid.localeCompare(b.rsid) || a.genotype.localeCompare(b.genotype);
  }

  function bucketVariantCount(n) {
    if (n < 10000) return '<10k';
    if (n < 100000) return '10k-100k';
    if (n < 500000) return '100k-500k';
    return '500k+';
  }

  function parseDNA(text, source) {
    const normalizedSource = normalizeSource(source);
    if (!normalizedSource) throw new GenPiDNAError('GENPI_UNSUPPORTED_SOURCE', 'DNA source must be 23andMe or Ancestry.com.');
    if (typeof text !== 'string' || !text.trim()) throw new GenPiDNAError('GENPI_EMPTY_FILE', 'The DNA file is empty.');

    const records = [];
    let malformed = 0;
    let missing = 0;
    const lines = text.split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const raw = lines[lineIndex].trim();
      if (!raw || raw.startsWith('#')) continue;
      const parts = raw.includes('\t') ? raw.split('\t').map(v => v.trim()) : splitCsvLine(raw);
      if (looksLikeHeader(parts)) continue;

      let rsid, chromosome, position, genotype;
      if (normalizedSource === '23andMe') {
        if (parts.length < 4) { malformed++; continue; }
        [rsid, chromosome, position, genotype] = parts;
      } else {
        if (parts.length < 5) { malformed++; continue; }
        [rsid, chromosome, position] = parts;
        genotype = `${parts[3]}${parts[4]}`;
      }

      rsid = normalizeRsid(rsid);
      chromosome = normalizeChromosome(chromosome);
      position = normalizePosition(position);
      genotype = normalizeGenotype(genotype);

      if (!rsid || !chromosome || !position || !genotype) { malformed++; continue; }
      if (genotype === '--') missing++;
      records.push({ rsid, chromosome, position, genotype });
    }

    records.sort(chromosomeSort);
    if (records.length < config.minVariants) {
      throw new GenPiDNAError('GENPI_TOO_FEW_VARIANTS', `Only ${records.length} valid variant rows were found; at least ${config.minVariants} are required.`);
    }

    const called = records.filter(r => /^[ACGT]{1,2}$/.test(r.genotype));
    if (called.length < config.minVariants) throw new GenPiDNAError('GENPI_NO_CALLS', 'The file does not contain enough A/C/G/T genotype calls.');

    const canonicalText = records.map(r => `${r.rsid}|${r.chromosome}|${r.position}|${r.genotype}`).join('\n');
    return {
      source: normalizedSource,
      records,
      calledRecords: called,
      canonicalText,
      variantCount: records.length,
      calledCount: called.length,
      malformedCount: malformed,
      missingRate: records.length ? missing / records.length : 0
    };
  }

  function sha256Fallback(bytes) {
    const K = new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]);
    const bitLength = bytes.length * 8;
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const message = new Uint8Array(paddedLength);
    message.set(bytes);
    message[bytes.length] = 0x80;
    const view = new DataView(message.buffer);
    const hi = Math.floor(bitLength / 0x100000000);
    const lo = bitLength >>> 0;
    view.setUint32(paddedLength - 8, hi, false);
    view.setUint32(paddedLength - 4, lo, false);
    const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let t = 0; t < 16; t++) W[t] = view.getUint32(offset + t * 4, false);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
        const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        h=g; g=f; f=e; e=(d+temp1)>>>0; d=c; c=b; b=a; a=(temp1+temp2)>>>0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i], false);
    return out;
  }

  async function sha256Bytes(value) {
    const bytes = new TextEncoder().encode(value);
    if (globalThis.crypto && globalThis.crypto.subtle) {
      return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    }
    return sha256Fallback(bytes);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function deriveSeed(parsed) {
    const domainSeparated = `${SEED_CONTRACT}|${parsed.source}\n${parsed.canonicalText}`;
    const seedBytes = await sha256Bytes(domainSeparated);
    return { seedBytes, seedHash: bytesToHex(seedBytes) };
  }

  function makePrng(seedBytes) {
    let a = ((seedBytes[0] << 24) | (seedBytes[1] << 16) | (seedBytes[2] << 8) | seedBytes[3]) >>> 0;
    let b = ((seedBytes[4] << 24) | (seedBytes[5] << 16) | (seedBytes[6] << 8) | seedBytes[7]) >>> 0;
    let c = ((seedBytes[8] << 24) | (seedBytes[9] << 16) | (seedBytes[10] << 8) | seedBytes[11]) >>> 0;
    let d = ((seedBytes[12] << 24) | (seedBytes[13] << 16) | (seedBytes[14] << 8) | seedBytes[15]) >>> 0;
    return function random() {
      const t = (a + b + d) >>> 0;
      d = (d + 1) >>> 0;
      a = (b ^ (b >>> 9)) >>> 0;
      b = (c + (c << 3)) >>> 0;
      c = ((c << 21) | (c >>> 11)) >>> 0;
      c = (c + t) >>> 0;
      return t / 4294967296;
    };
  }

  function expandSeedBytes(seedBytes, length) {
    // SHA-256 provides 32 bytes. v2.8.0 incorrectly indexed past that boundary,
    // producing undefined/NaN colour and geometry parameters. This deterministic
    // stream uses all digest bytes and never reads outside the cryptographic seed.
    const out = new Uint8Array(length);
    out.set(seedBytes.subarray(0, Math.min(seedBytes.length, length)));
    let state = 0x9E3779B9;
    for (let i = 0; i < seedBytes.length; i++) {
      state = Math.imul(state ^ seedBytes[i] ^ Math.imul(i + 1, 0x45D9F3B), 0x85EBCA6B) >>> 0;
      state = (state ^ (state >>> 13)) >>> 0;
    }
    for (let i = seedBytes.length; i < length; i++) {
      state = (state + 0x6D2B79F5 + Math.imul(seedBytes[i % seedBytes.length] + 1, i + 1)) >>> 0;
      let z = state;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      z = (z ^ (z >>> 14)) >>> 0;
      out[i] = (z >>> ((i & 3) * 8)) & 255;
    }
    return out;
  }

  function entropy4(counts) {
    const total = counts[0] + counts[1] + counts[2] + counts[3];
    if (!total) return 0;
    let h = 0;
    for (let i = 0; i < 4; i++) {
      if (counts[i] > 0) {
        const p = counts[i] / total;
        h -= p * Math.log2(p);
      }
    }
    return h / 2;
  }

  const INV_SQRT2 = 1 / Math.sqrt(2);
  const QUBIT = Object.freeze({
    A: [1, 0],
    T: [0, 1],
    C: [INV_SQRT2, INV_SQRT2],
    G: [INV_SQRT2, -INV_SQRT2]
  });
  const COMPLEX_BASE = Object.freeze({
    A: [1, 0],
    C: [0, 1],
    G: [-INV_SQRT2, -INV_SQRT2],
    T: [-INV_SQRT2, INV_SQRT2]
  });

  function vonNeumannEntropy2(r00, r01, r11) {
    const trace = r00 + r11;
    if (!(trace > 0)) return 0;
    r00 /= trace; r01 /= trace; r11 /= trace;
    const determinant = Math.max(0, r00 * r11 - r01 * r01);
    const delta = Math.sqrt(Math.max(0, 1 - 4 * determinant));
    const l1 = Math.max(0, Math.min(1, (1 + delta) / 2));
    const l2 = Math.max(0, Math.min(1, (1 - delta) / 2));
    let h = 0;
    if (l1 > 1e-12) h -= l1 * Math.log2(l1);
    if (l2 > 1e-12) h -= l2 * Math.log2(l2);
    return h;
  }

  function median(values) {
    if (!values.length) return 0;
    const copy = Array.from(values).sort((a, b) => a - b);
    const m = copy.length >> 1;
    return copy.length % 2 ? copy[m] : (copy[m - 1] + copy[m]) / 2;
  }

  function normalizeArray(values, robust) {
    const out = new Float64Array(values.length);
    if (!values.length) return out;
    let lo, hi;
    if (robust) {
      const sorted = Array.from(values).sort((a, b) => a - b);
      lo = sorted[Math.floor((sorted.length - 1) * 0.05)];
      hi = sorted[Math.floor((sorted.length - 1) * 0.95)];
    } else {
      lo = Infinity; hi = -Infinity;
      for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    const span = Math.max(1e-12, hi - lo);
    for (let i = 0; i < values.length; i++) out[i] = Math.max(0, Math.min(1, (values[i] - lo) / span));
    return out;
  }

  function meanAndStd(values) {
    if (!values.length) return { mean: 0, std: 0 };
    let mean = 0;
    for (const value of values) mean += value;
    mean /= values.length;
    let variance = 0;
    for (const value of values) {
      const d = value - mean;
      variance += d * d;
    }
    return { mean, std: Math.sqrt(variance / values.length) };
  }

  function adjacentCorrelation(values, blockSize) {
    let pairs = 0;
    let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
    for (let i = 0; i < values.length - 1; i++) {
      if (blockSize && Math.floor(i / blockSize) !== Math.floor((i + 1) / blockSize)) continue;
      const a = values[i], b = values[i + 1];
      pairs++;
      sumA += a; sumB += b;
      sumAA += a * a; sumBB += b * b; sumAB += a * b;
    }
    if (pairs < 2) return 0;
    const cov = sumAB - sumA * sumB / pairs;
    const varA = sumAA - sumA * sumA / pairs;
    const varB = sumBB - sumB * sumB / pairs;
    return cov / Math.sqrt(Math.max(1e-18, varA * varB));
  }

  function extractFeatures(parsed) {
    // Dense commercial reports can sustain a much finer chromosome partition
    // than the small synthetic smoke fixtures. Keep at least the historical
    // 16-bin representation, then scale deterministically up to the configured
    // ceiling while retaining roughly 12 called variants per bin.
    const dataSupportedBins = Math.floor(
      parsed.calledRecords.length / Math.max(1, CHROMOSOMES.length * 12)
    );
    const B = Math.max(16, Math.min(config.binsPerChromosome, dataSupportedBins));
    const N = CHROMOSOMES.length * B;
    const bins = Array.from({ length: N }, () => ({
      alleles: new Uint32Array(4),
      called: 0,
      hetero: 0,
      count: 0,
      r00: 0,
      r01: 0,
      r11: 0,
      phaseRe: 0,
      phaseIm: 0,
      gapLogSum: 0,
      gapCount: 0
    }));

    const chrMin = new Map();
    const chrMax = new Map();
    for (const r of parsed.calledRecords) {
      if (!chrMin.has(r.chromosome)) chrMin.set(r.chromosome, r.position);
      chrMax.set(r.chromosome, r.position);
    }

    const prevPos = new Map();
    for (const r of parsed.calledRecords) {
      const chrIdx = CHR_INDEX.get(r.chromosome);
      const minPos = chrMin.get(r.chromosome) || r.position;
      const maxPos = chrMax.get(r.chromosome) || r.position;
      const span = Math.max(1, maxPos - minPos + 1);
      const local = Math.min(B - 1, Math.floor(((r.position - minPos) / span) * B));
      const bin = bins[chrIdx * B + local];
      bin.count++;

      const alleles = r.genotype.match(/[ACGT]/g) || [];
      if (alleles.length) {
        bin.called++;
        if (alleles.length === 2 && alleles[0] !== alleles[1]) bin.hetero++;
        let gr = 0, gi = 0;
        for (const base of alleles) {
          bin.alleles[BASE_INDEX[base]]++;
          const q = QUBIT[base];
          bin.r00 += q[0] * q[0] / alleles.length;
          bin.r01 += q[0] * q[1] / alleles.length;
          bin.r11 += q[1] * q[1] / alleles.length;
          const z = COMPLEX_BASE[base];
          gr += z[0] / alleles.length;
          gi += z[1] / alleles.length;
        }
        bin.phaseRe += gr;
        bin.phaseIm += gi;
      }

      if (prevPos.has(r.chromosome)) {
        const gap = Math.max(1, r.position - prevPos.get(r.chromosome));
        bin.gapLogSum += Math.log1p(gap);
        bin.gapCount++;
      }
      prevPos.set(r.chromosome, r.position);
    }

    const shannon = new Float64Array(N);
    const vonNeumann = new Float64Array(N);
    const heterozygosity = new Float64Array(N);
    const gcBalance = new Float64Array(N);
    const densityRaw = new Float64Array(N);
    const gapRaw = new Float64Array(N);
    const phase = new Float64Array(N);
    const phaseStrength = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      const b = bins[i];
      shannon[i] = entropy4(b.alleles);
      vonNeumann[i] = b.called ? vonNeumannEntropy2(b.r00 / b.called, b.r01 / b.called, b.r11 / b.called) : 0;
      heterozygosity[i] = b.called ? b.hetero / b.called : 0;
      const totalAlleles = b.alleles[0] + b.alleles[1] + b.alleles[2] + b.alleles[3];
      gcBalance[i] = totalAlleles ? (b.alleles[1] + b.alleles[2]) / totalAlleles : 0.5;
      densityRaw[i] = Math.log1p(b.count);
      gapRaw[i] = b.gapCount ? b.gapLogSum / b.gapCount : 0;
      phase[i] = Math.atan2(b.phaseIm, b.phaseRe);
      phaseStrength[i] = b.called ? Math.hypot(b.phaseRe, b.phaseIm) / b.called : 0;
    }

    const density = normalizeArray(densityRaw, true);
    const gap = normalizeArray(gapRaw, true);
    const shannonStats = meanAndStd(shannon);
    const vonNeumannStats = meanAndStd(vonNeumann);
    const heterozygosityStats = meanAndStd(heterozygosity);
    const gcStats = meanAndStd(gcBalance);
    const densityStats = meanAndStd(density);
    const chromosomeCounts = CHROMOSOMES.map((_, chrIndex) => {
      let total = 0;
      for (let local = 0; local < B; local++) total += bins[chrIndex * B + local].count;
      return total;
    });
    const chromosomeDensityStats = meanAndStd(chromosomeCounts);
    const aggregate = {
      shannonMean: shannonStats.mean,
      shannonStd: shannonStats.std,
      vonNeumannMean: vonNeumannStats.mean,
      vonNeumannStd: vonNeumannStats.std,
      heterozygosityMean: heterozygosityStats.mean,
      heterozygosityStd: heterozygosityStats.std,
      gcMean: gcStats.mean,
      gcStd: gcStats.std,
      densityMedian: median(density),
      densityStd: densityStats.std,
      chromosomeDensityCv: chromosomeDensityStats.std / Math.max(1e-9, chromosomeDensityStats.mean),
      structuralClustering: Math.max(-1, Math.min(1, adjacentCorrelation(density, B))),
      gapMedian: median(gap)
    };

    return { N, B, bins, shannon, vonNeumann, heterozygosity, gcBalance, density, gap, phase, phaseStrength, aggregate };
  }

  function neighborIndices(i, N, B) {
    const chr = Math.floor(i / B);
    const bin = i % B;
    const prev = chr * B + Math.max(0, bin - 1);
    const next = chr * B + Math.min(B - 1, bin + 1);
    const mirror = chr * B + (B - 1 - bin);
    const cross = ((chr + 1) % CHROMOSOMES.length) * B + bin;
    return [prev, next, mirror, cross];
  }

  function graphDiffuse(signal, features, alpha, iterations) {
    const N = signal.length;
    const B = features.B;
    let current = Float64Array.from(signal);
    let next = new Float64Array(N);
    for (let step = 0; step < iterations; step++) {
      for (let i = 0; i < N; i++) {
        const neigh = neighborIndices(i, N, B);
        let weighted = 0;
        let weightSum = 0;
        for (let n = 0; n < neigh.length; n++) {
          const j = neigh[n];
          const similarity = Math.exp(-2.5 * Math.abs(features.shannon[i] - features.shannon[j]) - 1.7 * Math.abs(features.vonNeumann[i] - features.vonNeumann[j]));
          const baseW = n < 2 ? 1 : (n === 2 ? 0.35 : 0.22);
          const w = baseW * (0.35 + 0.65 * similarity);
          weighted += current[j] * w;
          weightSum += w;
        }
        const mean = weightSum ? weighted / weightSum : current[i];
        next[i] = current[i] + alpha * (mean - current[i]);
      }
      const swap = current; current = next; next = swap;
    }
    return current;
  }

  function graphWaveletBands(features) {
    const N = features.N;
    const signal = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      signal[i] = 0.29 * features.shannon[i]
        + 0.24 * features.vonNeumann[i]
        + 0.18 * features.heterozygosity[i]
        + 0.12 * features.density[i]
        + 0.10 * features.phaseStrength[i]
        + 0.07 * (1 - features.gap[i]);
    }
    const low1 = graphDiffuse(signal, features, 0.36, 2);
    const low2 = graphDiffuse(low1, features, 0.34, 5);
    const low3 = graphDiffuse(low2, features, 0.31, 11);
    const high = new Float64Array(N);
    const mid = new Float64Array(N);
    const broad = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      high[i] = signal[i] - low1[i];
      mid[i] = low1[i] - low2[i];
      broad[i] = low2[i] - low3[i];
    }
    return { signal, high, mid, broad, low: low3 };
  }

  function evolveOpenHamiltonian(features, bands, seedBytes) {
    const N = features.N;
    const B = features.B;
    const steps = config.dynamicsSteps;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    const initialRe = new Float64Array(N);
    const initialIm = new Float64Array(N);
    const eps = new Float64Array(N);
    const gamma = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      const amplitude = 0.15 + 0.85 * Math.sqrt(Math.max(0, bands.signal[i]));
      const theta = features.phase[i] + 0.9 * bands.high[i] + 0.45 * bands.mid[i];
      re[i] = initialRe[i] = amplitude * Math.cos(theta);
      im[i] = initialIm[i] = amplitude * Math.sin(theta);
      eps[i] = 0.45 * (features.gcBalance[i] - 0.5)
        + 0.38 * (features.shannon[i] - 0.5)
        + 0.31 * (features.vonNeumann[i] - 0.5)
        + 0.24 * bands.broad[i];
      gamma[i] = 0.006 + 0.026 * (0.55 * features.shannon[i] + 0.45 * features.vonNeumann[i]);
    }
    normalizeComplex(re, im);
    initialRe.set(re); initialIm.set(im);

    const nextRe = new Float64Array(N);
    const nextIm = new Float64Array(N);
    const ampSum = new Float64Array(N);
    const ampSqSum = new Float64Array(N);
    const phaseCos = new Float64Array(N);
    const phaseSin = new Float64Array(N);
    const response = new Float64Array(N);
    const globalSignal = new Float64Array(steps);

    const dt = 0.075;
    const f0 = 1.2 + seedBytes[16] / 255 * 2.6;
    const chirp = 0.35 + seedBytes[17] / 255 * 1.3;
    const driveStrength = 0.035 + seedBytes[18] / 255 * 0.075;
    const couplingBase = 0.09 + seedBytes[19] / 255 * 0.07;
    const warmup = Math.floor(steps * 0.22);
    let samples = 0;

    for (let step = 0; step < steps; step++) {
      const tau = step / Math.max(1, steps - 1);
      const drivePhase = 2 * Math.PI * (f0 * tau + 0.5 * chirp * tau * tau);
      let globalRe = 0;
      let globalIm = 0;

      for (let i = 0; i < N; i++) {
        const neigh = neighborIndices(i, N, B);
        let hRe = eps[i] * re[i];
        let hIm = eps[i] * im[i];
        for (let n = 0; n < neigh.length; n++) {
          const j = neigh[n];
          const similarity = Math.exp(-2.0 * Math.abs(features.shannon[i] - features.shannon[j]) - 1.4 * Math.abs(features.phaseStrength[i] - features.phaseStrength[j]));
          const edgeClass = n < 2 ? 1 : (n === 2 ? 0.31 : 0.18);
          const J = couplingBase * edgeClass * (0.42 + 0.58 * similarity);
          hRe += J * (re[j] - re[i]);
          hIm += J * (im[j] - im[i]);
        }
        const localDrive = driveStrength * (0.35 + 0.65 * features.density[i]) * Math.cos(drivePhase + features.phase[i] + 2.4 * bands.low[i]);
        hRe += localDrive * re[i];
        hIm += localDrive * im[i];

        const damping = Math.exp(-gamma[i] * dt);
        nextRe[i] = (re[i] + dt * hIm) * damping;
        nextIm[i] = (im[i] - dt * hRe) * damping;
        globalRe += nextRe[i];
        globalIm += nextIm[i];
      }

      normalizeComplex(nextRe, nextIm);
      re.set(nextRe); im.set(nextIm);
      globalSignal[step] = Math.hypot(globalRe / N, globalIm / N);

      if (step >= warmup) {
        samples++;
        for (let i = 0; i < N; i++) {
          const a = Math.hypot(re[i], im[i]);
          ampSum[i] += a;
          ampSqSum[i] += a * a;
          const p = Math.atan2(im[i], re[i]);
          phaseCos[i] += Math.cos(p);
          phaseSin[i] += Math.sin(p);
          response[i] += Math.hypot(re[i] - initialRe[i], im[i] - initialIm[i]);
        }
      }
    }

    const ampMean = new Float64Array(N);
    const ampVar = new Float64Array(N);
    const coherence = new Float64Array(N);
    const phaseMean = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      ampMean[i] = ampSum[i] / Math.max(1, samples);
      const meanSq = ampSqSum[i] / Math.max(1, samples);
      ampVar[i] = Math.sqrt(Math.max(0, meanSq - ampMean[i] * ampMean[i]));
      coherence[i] = Math.hypot(phaseCos[i], phaseSin[i]) / Math.max(1, samples);
      phaseMean[i] = Math.atan2(phaseSin[i], phaseCos[i]);
      response[i] /= Math.max(1, samples);
    }

    const spectral = spectralBands(globalSignal);
    return {
      ampMean: normalizeArray(ampMean, true),
      ampVar: normalizeArray(ampVar, true),
      coherence,
      phaseMean,
      response: normalizeArray(response, true),
      spectral,
      finalRe: re,
      finalIm: im
    };
  }

  function normalizeComplex(re, im) {
    let norm2 = 0;
    for (let i = 0; i < re.length; i++) norm2 += re[i] * re[i] + im[i] * im[i];
    const inv = 1 / Math.sqrt(Math.max(norm2, 1e-24));
    for (let i = 0; i < re.length; i++) { re[i] *= inv; im[i] *= inv; }
  }

  function spectralBands(signal) {
    const N = signal.length;
    const powers = new Float64Array(Math.floor(N / 2));
    for (let k = 1; k < powers.length; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / Math.max(1, N - 1));
        const angle = -2 * Math.PI * k * n / N;
        const value = signal[n] * w;
        re += value * Math.cos(angle);
        im += value * Math.sin(angle);
      }
      powers[k] = re * re + im * im;
    }
    const bands = [0, 0, 0, 0];
    for (let k = 1; k < powers.length; k++) {
      const q = Math.min(3, Math.floor((k / powers.length) * 4));
      bands[q] += powers[k];
    }
    const total = bands.reduce((a, b) => a + b, 0) || 1;
    return bands.map(v => v / total);
  }

  function blurField(field, w, h, passes) {
    let current = field;
    let next = new Float32Array(field.length);
    for (let pass = 0; pass < passes; pass++) {
      for (let y = 0; y < h; y++) {
        const ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
        for (let x = 0; x < w; x++) {
          const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
          const i = y * w + x;
          next[i] = (current[i] * 4
            + current[y * w + xm] + current[y * w + xp]
            + current[ym * w + x] + current[yp * w + x]
            + 0.5 * (current[ym * w + xm] + current[ym * w + xp] + current[yp * w + xm] + current[yp * w + xp])) / 10;
        }
      }
      const swap = current; current = next; next = swap;
    }
    return current;
  }

  function splat(field, w, h, x, y, value, radius) {
    const cx = Math.round(x), cy = Math.round(y);
    const r = Math.max(1, Math.round(radius));
    const r2 = r * r;
    for (let yy = Math.max(0, cy - r); yy <= Math.min(h - 1, cy + r); yy++) {
      const dy = yy - cy;
      for (let xx = Math.max(0, cx - r); xx <= Math.min(w - 1, cx + r); xx++) {
        const dx = xx - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) field[yy * w + xx] += value * Math.exp(-2.5 * d2 / Math.max(1, r2));
      }
    }
  }

  function drawSegment(field, w, h, x0, y0, x1, y1, value, r0, r1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist * 1.45));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const radius = r0 + (r1 - r0) * t;
      const localValue = value * (1 - 0.32 * t);
      splat(field, w, h, x, y, localValue, radius);
    }
  }

  function recursiveAntenna(field, w, h, x, y, angle, length, depth, scale, spread, curve, value, radius) {
    if (depth <= 0 || length < 1.15 || radius < 0.32) return;
    const bend = curve * (0.45 + 0.55 / Math.max(1, depth));
    const x1 = x + Math.cos(angle + bend) * length;
    const y1 = y + Math.sin(angle + bend) * length;
    drawSegment(field, w, h, x, y, x1, y1, value, radius, Math.max(0.3, radius * 0.74));

    const nextLength = length * scale;
    const nextValue = value * 0.84;
    const nextRadius = radius * 0.77;
    recursiveAntenna(field, w, h, x1, y1, angle + curve, nextLength, depth - 1, scale, spread, curve, nextValue, nextRadius);
    recursiveAntenna(field, w, h, x1, y1, angle - spread, nextLength * (0.90 + 0.05 * Math.cos(angle * 2.3)), depth - 1, scale, spread * 0.96, curve * 0.92, nextValue * 0.96, nextRadius * 0.92);
    recursiveAntenna(field, w, h, x1, y1, angle + spread, nextLength * (0.90 + 0.05 * Math.sin(angle * 1.9)), depth - 1, scale, spread * 0.96, curve * 0.92, nextValue * 0.96, nextRadius * 0.92);
  }

  function buildFractalAntennaField(features, dynamics, seedBytes, centerX, centerY) {
    const w = config.fieldWidth;
    const h = config.fieldHeight;
    const field = new Float32Array(w * h);
    const arms = 2 + (seedBytes[34] % 4);
    const symmetry = 1 + (seedBytes[35] % 3);
    const baseAngle = seedBytes[36] / 255 * Math.PI * 2;
    const depth = 5 + (seedBytes[37] % 3);
    const scale = 0.58 + 0.10 * features.aggregate.gcMean + 0.05 * dynamics.spectral[2];
    const spread = 0.36 + 0.58 * features.aggregate.heterozygosityMean + 0.18 * dynamics.spectral[1];
    const curve = (seedBytes[38] / 255 - 0.5) * (0.35 + 0.25 * features.aggregate.vonNeumannMean);
    const baseLength = Math.min(w, h) * (0.10 + 0.06 * features.aggregate.shannonMean + 0.07 * dynamics.spectral[3]);
    const baseRadius = 2.8 + 4.5 * features.aggregate.densityMedian;

    for (let arm = 0; arm < arms; arm++) {
      const angle = baseAngle + arm * 2 * Math.PI / arms;
      recursiveAntenna(field, w, h, centerX, centerY, angle, baseLength, depth, scale, spread, curve, 0.85, baseRadius);
      if (symmetry > 1) {
        for (let s = 1; s < symmetry; s++) {
          const rotated = angle + s * 2 * Math.PI / symmetry;
          recursiveAntenna(field, w, h, centerX, centerY, rotated, baseLength * 0.92, depth, scale, spread, -curve, 0.68, baseRadius * 0.88);
        }
      }
    }

    const islands = 96 + (seedBytes[39] % 96);
    let px = centerX, py = centerY;
    for (let i = 0; i < islands; i++) {
      const t = i / Math.max(1, islands - 1);
      const branch = i % 3;
      let nx, ny;
      if (branch === 0) {
        nx = centerX + (px - centerX) * 0.55;
        ny = centerY + (py - centerY) * 0.55;
      } else if (branch === 1) {
        nx = centerX + (px - centerX) * 0.48 + Math.cos(baseAngle + t * 6.283) * w * 0.12;
        ny = centerY + (py - centerY) * 0.48 + Math.sin(baseAngle + t * 6.283) * h * 0.10;
      } else {
        nx = centerX + (px - centerX) * 0.52 - Math.sin(baseAngle + t * 4.712) * w * 0.10;
        ny = centerY + (py - centerY) * 0.52 + Math.cos(baseAngle + t * 4.712) * h * 0.08;
      }
      px = nx; py = ny;
      splat(field, w, h, px, py, 0.12 + 0.15 * Math.sin(t * Math.PI), 1.2 + 1.0 * t);
    }

    const out = blurField(field, w, h, 2);
    let max = 0;
    for (let i = 0; i < out.length; i++) if (out[i] > max) max = out[i];
    const inv = max > 0 ? 1 / max : 1;
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(1, out[i] * inv));
    return out;
  }

  function combineNormalizedFields(a, aw, b, bw) {
    const out = new Float32Array(a.length);
    let max = 0;
    for (let i = 0; i < a.length; i++) {
      const v = aw * a[i] + bw * b[i];
      out[i] = v;
      if (v > max) max = v;
    }
    const inv = max > 0 ? 1 / max : 1;
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(1, out[i] * inv));
    return out;
  }

  function makeGenotypeMicroField(raw, w, h) {
    const compressed = new Float32Array(raw.length);
    let max = 0;
    for (let i = 0; i < raw.length; i++) {
      const value = Math.log1p(raw[i] * 8.0);
      compressed[i] = value;
      if (value > max) max = value;
    }
    const inv = max > 0 ? 1 / max : 1;
    for (let i = 0; i < compressed.length; i++) compressed[i] *= inv;

    // Difference-of-scales preserves fine genotype transition structure without
    // retaining a reversible SNP-to-pixel representation.
    const fine = blurField(Float32Array.from(compressed), w, h, 1);
    const coarse = blurField(Float32Array.from(fine), w, h, 4);
    const out = new Float32Array(raw.length);
    max = 0;
    for (let i = 0; i < out.length; i++) {
      const high = Math.max(0, fine[i] - 0.72 * coarse[i]);
      const value = 0.52 * compressed[i] + 0.78 * high + 0.16 * fine[i];
      out[i] = value;
      if (value > max) max = value;
    }
    const outInv = max > 0 ? 1 / max : 1;
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(1, out[i] * outInv));
    return out;
  }

  function buildGenomicSubstrate(parsed, features, dynamics, seedBytes) {
    const w = config.fieldWidth;
    const h = config.fieldHeight;
    const macroField = new Float32Array(w * h);
    const microRaw = new Float32Array(w * h);
    const B = features.B;
    const N = features.N;
    const centerX = w * (0.5 + (seedBytes[20] / 255 - 0.5) * 0.08);
    const centerY = h * (0.5 + (seedBytes[21] / 255 - 0.5) * 0.06);
    const turns = 1.65 + seedBytes[22] / 255 * 1.8;
    const phase0 = seedBytes[23] / 255 * Math.PI * 2;
    const symmetry = [1, 2, 3, 5][seedBytes[24] % 4];

    for (let i = 0; i < N; i++) {
      const chr = Math.floor(i / B);
      const bin = i % B;
      const theta = phase0 + 2 * Math.PI * (chr / CHROMOSOMES.length) + turns * 2 * Math.PI * (bin / Math.max(1, B - 1)) / CHROMOSOMES.length;
      const radialBase = 0.15 + 0.76 * (bin / Math.max(1, B - 1));
      const radialMod = 0.82 + 0.18 * Math.sin(symmetry * theta + dynamics.phaseMean[i]);
      const rx = w * 0.39 * radialBase * radialMod;
      const ry = h * 0.35 * radialBase * radialMod;
      const x = centerX + rx * Math.cos(theta + 0.35 * dynamics.response[i]);
      const y = centerY + ry * Math.sin(theta - 0.45 * dynamics.phaseMean[i]);
      const value = 0.25 + 0.75 * (0.38 * dynamics.ampMean[i] + 0.27 * dynamics.response[i] + 0.20 * features.shannon[i] + 0.15 * dynamics.coherence[i]);
      const radius = 2.2 + 7.0 * (0.5 * features.density[i] + 0.5 * dynamics.ampVar[i]);
      splat(macroField, w, h, x, y, value, radius);

      if (symmetry > 1) {
        for (let s = 1; s < symmetry; s++) {
          const a = theta + s * 2 * Math.PI / symmetry;
          const sx = centerX + rx * Math.cos(a + 0.35 * dynamics.response[i]);
          const sy = centerY + ry * Math.sin(a - 0.45 * dynamics.phaseMean[i]);
          splat(macroField, w, h, sx, sy, value * (0.68 + 0.32 * dynamics.coherence[i]), radius * 0.82);
        }
      }
    }

    // Sparse personal-genotype chaos-game texture. The genotype path is spatially
    // transformed and later passed through non-linear dynamics, so no SNP-to-pixel
    // correspondence is retained in the final image.
    const vertices = GENOTYPES.map((g, i) => {
      const a = phase0 + 2 * Math.PI * i / GENOTYPES.length;
      const ring = 0.36 + 0.08 * ((i + seedBytes[25]) % 3);
      return [centerX + w * ring * Math.cos(a), centerY + h * ring * 0.82 * Math.sin(a)];
    });
    let px = centerX, py = centerY;
    const records = parsed.calledRecords;
    const stride = Math.max(1, Math.ceil(records.length / config.maxCgrRecords));
    let cgrRecordsUsed = 0;
    let lastChr = records.length ? records[0].chromosome : '1';
    let lastPos = records.length ? records[0].position : 1;
    for (let rIndex = 0; rIndex < records.length; rIndex += stride) {
      const r = records[rIndex];
      if (r.chromosome !== lastChr) {
        const ci = CHR_INDEX.get(r.chromosome);
        px = centerX + Math.cos(phase0 + ci * 2 * Math.PI / CHROMOSOMES.length) * w * 0.08;
        py = centerY + Math.sin(phase0 + ci * 2 * Math.PI / CHROMOSOMES.length) * h * 0.07;
        lastChr = r.chromosome;
        lastPos = r.position;
      }
      const gi = GENOTYPE_INDEX.get(r.genotype);
      if (gi === undefined) continue;
      const gap = Math.max(1, r.position - lastPos);
      const alpha = 0.42 + 0.18 * Math.exp(-Math.log1p(gap) / 10);
      px = (1 - alpha) * px + alpha * vertices[gi][0];
      py = (1 - alpha) * py + alpha * vertices[gi][1];
      const ix = Math.max(0, Math.min(w - 1, Math.round(px)));
      const iy = Math.max(0, Math.min(h - 1, Math.round(py)));
      const localWeight = 0.44
        + 0.18 * ((gi + seedBytes[26]) % 4)
        + 0.16 * Math.exp(-Math.log1p(gap) / 11);
      const index = iy * w + ix;
      microRaw[index] += localWeight;
      if (ix > 0) microRaw[index - 1] += localWeight * 0.16;
      if (ix + 1 < w) microRaw[index + 1] += localWeight * 0.16;
      if (iy > 0) microRaw[index - w] += localWeight * 0.12;
      if (iy + 1 < h) microRaw[index + w] += localWeight * 0.12;
      cgrRecordsUsed++;
      lastPos = r.position;
    }

    const blurred = blurField(macroField, w, h, 2);
    let max = 0;
    for (let i = 0; i < blurred.length; i++) if (blurred[i] > max) max = blurred[i];
    const inv = max > 0 ? 1 / max : 1;
    for (let i = 0; i < blurred.length; i++) blurred[i] = Math.max(0, Math.min(1, blurred[i] * inv));
    const micro = makeGenotypeMicroField(microRaw, w, h);
    const microSoft = blurField(Float32Array.from(micro), w, h, 2);
    const antenna = buildFractalAntennaField(features, dynamics, seedBytes, centerX, centerY);
    const macroCombined = combineNormalizedFields(blurred, 0.64, antenna, 0.50);
    const combined = combineNormalizedFields(macroCombined, 0.82, microSoft, 0.28);
    return {
      field: combined,
      antenna,
      micro,
      centerX,
      centerY,
      cgrRecordsUsed,
      cgrStride: stride
    };
  }

  const RD_REGIMES = Object.freeze([
    [0.0367, 0.0649, 0.16, 0.08],
    [0.0300, 0.0620, 0.16, 0.08],
    [0.0220, 0.0510, 0.16, 0.08],
    [0.0140, 0.0470, 0.16, 0.08],
    [0.0260, 0.0550, 0.18, 0.09],
    [0.0420, 0.0590, 0.14, 0.07],
    [0.0180, 0.0500, 0.20, 0.10],
    [0.0500, 0.0650, 0.15, 0.075]
  ]);

  function runMorphogenesis(substrateBundle, features, dynamics, seedBytes) {
    const w = config.fieldWidth;
    const h = config.fieldHeight;
    const size = w * h;
    const substrate = substrateBundle.field;
    const antenna = substrateBundle.antenna;
    const micro = substrateBundle.micro;
    let u = new Float32Array(size);
    let v = new Float32Array(size);
    let un = new Float32Array(size);
    let vn = new Float32Array(size);
    const regime = RD_REGIMES[seedBytes[27] % RD_REGIMES.length];
    const spectralBias = dynamics.spectral[2] - dynamics.spectral[0];
    const F0 = Math.max(0.010, Math.min(0.060, regime[0] + 0.006 * (features.aggregate.shannonMean - 0.5) + 0.004 * spectralBias));
    const K0 = Math.max(0.042, Math.min(0.070, regime[1] + 0.005 * (features.aggregate.vonNeumannMean - 0.5) - 0.003 * spectralBias));
    const Du = regime[2] * (0.90 + 0.18 * features.aggregate.gcMean);
    const Dv = regime[3] * (0.92 + 0.18 * features.aggregate.heterozygosityMean);
    const phase = seedBytes[28] / 255 * Math.PI * 2;

    for (let i = 0; i < size; i++) {
      const s = substrate[i];
      const q = micro[i];
      u[i] = 1 - 0.38 * s - 0.06 * q;
      v[i] = 0.07 + 0.58 * Math.pow(s, 1.30) + 0.16 * Math.pow(q, 1.15);
    }

    const dt = 0.92;
    const steps = config.morphogenesisSteps;
    for (let step = 0; step < steps; step++) {
      const t = step / Math.max(1, steps - 1);
      for (let y = 0; y < h; y++) {
        const ym = y === 0 ? 0 : y - 1;
        const yp = y === h - 1 ? h - 1 : y + 1;
        const row = y * w, rowM = ym * w, rowP = yp * w;
        for (let x = 0; x < w; x++) {
          const xm = x === 0 ? 0 : x - 1;
          const xp = x === w - 1 ? w - 1 : x + 1;
          const i = row + x;
          const lapU = -u[i]
            + 0.20 * (u[row + xm] + u[row + xp] + u[rowM + x] + u[rowP + x])
            + 0.05 * (u[rowM + xm] + u[rowM + xp] + u[rowP + xm] + u[rowP + xp]);
          const lapV = -v[i]
            + 0.20 * (v[row + xm] + v[row + xp] + v[rowM + x] + v[rowP + x])
            + 0.05 * (v[rowM + xm] + v[rowM + xp] + v[rowP + xm] + v[rowP + xp]);
          const uvv = u[i] * v[i] * v[i];
          const local = substrate[i] - 0.5;
          const antennaBias = antenna[i] - 0.5;
          const microBias = micro[i] - 0.5;
          const wave = Math.sin(phase + 5.5 * t + x / w * Math.PI * 2 + y / h * Math.PI * 1.5);
          const F = F0 + 0.0020 * local + 0.0015 * antennaBias + 0.0011 * microBias + 0.0009 * wave * dynamics.spectral[1];
          const K = K0 - 0.0017 * local - 0.0011 * antennaBias - 0.0009 * microBias + 0.0008 * wave * dynamics.spectral[3];
          un[i] = Math.max(0, Math.min(1.25, u[i] + (Du * lapU - uvv + F * (1 - u[i])) * dt));
          vn[i] = Math.max(0, Math.min(1.25, v[i] + (Dv * lapV + uvv - (F + K) * v[i]) * dt));
        }
      }
      let swap = u; u = un; un = swap;
      swap = v; v = vn; vn = swap;
    }

    const pattern = new Float32Array(size);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < size; i++) {
      const value = v[i] - 0.55 * u[i]
        + 0.16 * substrate[i]
        + 0.18 * antenna[i]
        + 0.14 * micro[i];
      pattern[i] = value;
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    }
    const span = Math.max(1e-9, hi - lo);
    for (let i = 0; i < size; i++) pattern[i] = (pattern[i] - lo) / span;
    return { pattern, u, v, params: { F: F0, K: K0, Du, Dv } };
  }

  const PASTEL_PALETTE_SETS = Object.freeze([
    { name:'lavender-blue-peach-gold', families:['#A9A1D4','#9FC5DF','#E7AF9A','#CDB56D'], paper:'#F3EEE5', mist:'#E7E4F0', shadow:'#554F73' },
    { name:'sage-powder-blush-cream', families:['#A9BDA6','#9EBED3','#D6A6AD','#D8C7A3'], paper:'#F4F0E7', mist:'#E6ECE5', shadow:'#4F6664' },
    { name:'periwinkle-apricot-mint-rose', families:['#9FAFDC','#E7B38F','#A9CEBD','#C895A8'], paper:'#F5EEE3', mist:'#E5E9F2', shadow:'#585D7A' },
    { name:'turquoise-lilac-butter-ivory', families:['#87BFC0','#B6A4CF','#D9C77F','#D7B7A5'], paper:'#F6F1E5', mist:'#E3ECEB', shadow:'#466A70' },
    { name:'denim-mauve-clay-parchment', families:['#8CA8C5','#B09AB7','#D39C86','#C9B789'], paper:'#F1ECE2', mist:'#E2E6EC', shadow:'#4F5C72' },
    { name:'seafoam-cornflower-coral-oat', families:['#9CCBBB','#91AEDA','#D9A093','#CABB94'], paper:'#F5EFE6', mist:'#E3EDE9', shadow:'#496A69' },
    { name:'aqua-wisteria-salmon-sand', families:['#8EBFC8','#A69BCB','#D9A09B','#D4BC93'], paper:'#F4EEE5', mist:'#E2E8EE', shadow:'#4C6177' },
    { name:'slate-apricot-pistachio-orchid', families:['#8E9FBE','#E2AD8D','#B7C89D','#B89BBE'], paper:'#F4EFE5', mist:'#E5E8E4', shadow:'#555E76' },
    { name:'celadon-sky-rose-honey', families:['#A5C4AF','#96BAD5','#C99AAA','#CEB374'], paper:'#F5F0E6', mist:'#E5ECE8', shadow:'#506C6A' },
    { name:'cyan-lilac-clay-butter', families:['#8CBBC5','#B2A3D0','#D3A08A','#D4C27E'], paper:'#F3EEE6', mist:'#E3E9ED', shadow:'#4B6472' },
    { name:'cobalt-clay-teal-pink', families:['#93A9CF','#D1A087','#8FBEAF','#C9A0B2'], paper:'#F5EFE7', mist:'#E2E8EB', shadow:'#505E78' },
    { name:'fog-wisteria-apricot-sage', families:['#A0B8C7','#B2A4C8','#DFAD8D','#A9BEA3'], paper:'#F2EEE5', mist:'#E5E8EC', shadow:'#56656D' },
    { name:'lavender-sky-butter-salmon', families:['#AFA4D1','#9EC1DB','#D4C079','#D7A091'], paper:'#F5F0E5', mist:'#E8E5EF', shadow:'#5C5676' },
    { name:'teal-powder-plum-beige', families:['#8BB7B1','#9DB9D1','#B29CB6','#D0B594'], paper:'#F4EEE5', mist:'#E2EBE8', shadow:'#4C676B' },
    { name:'eucalyptus-periwinkle-blush-amber', families:['#9EBBA7','#9DAED4','#CEA0AA','#C8AD72'], paper:'#F4F0E7', mist:'#E4EAE6', shadow:'#52696B' },
    { name:'ice-orchid-mint-peach', families:['#9CC1D0','#B5A2C9','#A8C9B9','#DFAC91'], paper:'#F5EEE6', mist:'#E4EAEE', shadow:'#526477' }
  ]);

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mixRgb(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs(hp % 2 - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp < 1) [r1, g1, b1] = [c, x, 0];
    else if (hp < 2) [r1, g1, b1] = [x, c, 0];
    else if (hp < 3) [r1, g1, b1] = [0, c, x];
    else if (hp < 4) [r1, g1, b1] = [0, x, c];
    else if (hp < 5) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    const m = l - c / 2;
    return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
  }


  function lerpRgb(a, b, t) {
    const u = Math.max(0, Math.min(1, t));
    return [
      a[0] + (b[0] - a[0]) * u,
      a[1] + (b[1] - a[1]) * u,
      a[2] + (b[2] - a[2]) * u
    ];
  }

  function positiveModulo(value, modulus) {
    return ((value % modulus) + modulus) % modulus;
  }

  function cyclicPastelColor(colors, t, transitionWidth) {
    const x = positiveModulo(t, 1) * colors.length;
    const i = Math.floor(x) % colors.length;
    const f = x - Math.floor(x);
    const width = Math.max(0.04, Math.min(0.42, transitionWidth));
    const lo = 0.5 - width / 2;
    const hi = 0.5 + width / 2;
    const u = Math.max(0, Math.min(1, (f - lo) / Math.max(1e-9, hi - lo)));
    const eased = u * u * (3 - 2 * u);
    return lerpRgb(colors[i], colors[(i + 1) % colors.length], eased);
  }

  function makePalettePlan(features, seedBytes) {
    const a = features.aggregate;
    const featureCode = Math.floor(a.gcMean * 31)
      + 3 * Math.floor(a.heterozygosityMean * 29)
      + 5 * Math.floor(a.shannonMean * 23)
      + 7 * Math.floor(Math.min(2, a.chromosomeDensityCv) * 17);
    const index = positiveModulo(seedBytes[29] + seedBytes[63] + seedBytes[71] + featureCode, PASTEL_PALETTE_SETS.length);
    const selected = PASTEL_PALETTE_SETS[index];
    const colors = selected.families.map(hexRgb);
    const rotation = positiveModulo(seedBytes[30] + Math.floor(a.structuralClustering * 11), colors.length);
    const rotated = colors.slice(rotation).concat(colors.slice(0, rotation));
    if ((seedBytes[31] ^ seedBytes[64]) & 1) rotated.reverse();
    return {
      name: selected.name,
      index,
      families: rotated,
      paper: hexRgb(selected.paper),
      mist: hexRgb(selected.mist),
      shadow: hexRgb(selected.shadow),
      phase: seedBytes[65] / 255,
      spatialFrequency: 2 + (seedBytes[66] % 4),
      transitionWidth: 0.14 + 0.10 * (seedBytes[67] / 255)
    };
  }

  function sampleField(field, w, h, x, y) {
    const fx = Math.max(0, Math.min(w - 1.001, x));
    const fy = Math.max(0, Math.min(h - 1.001, y));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const a = field[y0 * w + x0] * (1 - tx) + field[y0 * w + x1] * tx;
    const b = field[y1 * w + x0] * (1 - tx) + field[y1 * w + x1] * tx;
    return a * (1 - ty) + b * ty;
  }

  function seededNoise(x, y, seed) {
    let n = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(seed + 1, 69069)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function makeCanvas(width, height) {
    if (typeof document === 'undefined' || !document.createElement) throw new GenPiDNAError('GENPI_BROWSER_REQUIRED', 'Artwork rendering requires a browser document and canvas.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    if (canvas.width !== width || canvas.height !== height) throw new GenPiDNAError('GENPI_CANVAS_LIMIT', 'This device cannot allocate the required artwork canvas. Use a desktop browser for print-master generation.');
    return canvas;
  }

  function renderArtwork(morph, substrateBundle, features, dynamics, seedBytes) {
    const width = config.renderWidth;
    const height = config.renderHeight;
    const fieldW = config.fieldWidth;
    const fieldH = config.fieldHeight;
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new GenPiDNAError('GENPI_CANVAS_CONTEXT', 'A 2D canvas context could not be created.');
    const image = ctx.createImageData(width, height);
    const data = image.data;
    const substrate = substrateBundle.field;
    const antenna = substrateBundle.antenna;
    const micro = substrateBundle.micro;
    const palettePlan = makePalettePlan(features, seedBytes);
    const aggregate = features.aggregate;
    const compositionMode = seedBytes[68] % 8;
    const viewPresets = [
      [-0.74364,  0.13183, 0.26],
      [-1.25066,  0.02012, 0.31],
      [-0.39054,  0.58679, 0.34],
      [-0.74530,  0.11270, 0.28],
      [-0.74364, -0.13183, 0.27],
      [-0.77631,  0.13664, 0.26],
      [-0.74364,  0.13183, 0.24],
      [-0.77631,  0.13664, 0.24]
    ];
    const preset = viewPresets[compositionMode];
    const maxIter = 196 + (seedBytes[8] % 92);
    const rotation = (seedBytes[70] / 255 - 0.5) * 1.05
      + 0.18 * aggregate.structuralClustering;
    const ca = Math.cos(rotation), sa = Math.sin(rotation);
    const zoom = 0.92 + 0.62 * (seedBytes[72] / 255)
      + 0.18 * aggregate.gcMean
      + 0.12 * dynamics.spectral[0];
    const scaleX = 1.72 * preset[2] / zoom;
    const scaleY = scaleX * height / width;
    const baseCx = preset[0]
      + 0.035 * (aggregate.gcMean - 0.5)
      + 0.020 * (seedBytes[0] / 255 - 0.5);
    const baseCy = preset[1]
      + 0.042 * (aggregate.heterozygosityMean - 0.35)
      + 0.016 * Math.sin(seedBytes[1] / 255 * Math.PI * 2);
    const warp = 0.035
      + 0.060 * (seedBytes[4] / 255)
      + 0.025 * Math.min(1, aggregate.chromosomeDensityCv);
    const cubicMix = 0.010
      + 0.045 * (seedBytes[73] / 255)
      + 0.020 * Math.min(1, aggregate.shannonStd * 3);
    const initialOrbit = 0.025 + 0.085 * (seedBytes[74] / 255);
    const mirrorX = (seedBytes[71] & 1) ? -1 : 1;
    const mirrorY = (seedBytes[71] & 2) ? -1 : 1;
    const compositionPhase = seedBytes[75] / 255 * Math.PI * 2;
    const fractalInfluence = 0.64 + 0.24 * (seedBytes[69] / 255);
    const lightAngle = -2.40 + 0.80 * (seedBytes[78] / 255);
    const lightTilt = 0.48 + 0.16 * (seedBytes[79] / 255);
    const lightX = Math.cos(lightAngle) * Math.sqrt(1 - lightTilt * lightTilt);
    const lightY = Math.sin(lightAngle) * Math.sqrt(1 - lightTilt * lightTilt);
    const lightZ = lightTilt;
    const reliefStrength = 1.45
      + 1.35 * (seedBytes[80] / 255)
      + 0.65 * Math.min(1, aggregate.chromosomeDensityCv);

    let ptr = 0;
    for (let y = 0; y < height; y++) {
      const fy = y / Math.max(1, height - 1) * (fieldH - 1);
      const bgGrad = y / Math.max(1, height - 1);
      for (let x = 0; x < width; x++) {
        const fx = x / Math.max(1, width - 1) * (fieldW - 1);
        const m = sampleField(morph.pattern, fieldW, fieldH, fx, fy);
        const s = sampleField(substrate, fieldW, fieldH, fx, fy);
        const aField = sampleField(antenna, fieldW, fieldH, fx, fy);
        const qField = sampleField(micro, fieldW, fieldH, fx, fy);
        const gx = sampleField(morph.pattern, fieldW, fieldH, fx + 1, fy) - sampleField(morph.pattern, fieldW, fieldH, fx - 1, fy);
        const gy = sampleField(morph.pattern, fieldW, fieldH, fx, fy + 1) - sampleField(morph.pattern, fieldW, fieldH, fx, fy - 1);
        const ax = sampleField(antenna, fieldW, fieldH, fx + 1, fy) - sampleField(antenna, fieldW, fieldH, fx - 1, fy);
        const ay = sampleField(antenna, fieldW, fieldH, fx, fy + 1) - sampleField(antenna, fieldW, fieldH, fx, fy - 1);
        const qx = sampleField(micro, fieldW, fieldH, fx + 1, fy) - sampleField(micro, fieldW, fieldH, fx - 1, fy);
        const qy = sampleField(micro, fieldW, fieldH, fx, fy + 1) - sampleField(micro, fieldW, fieldH, fx, fy - 1);

        const nx = (x / width - 0.5) * 2 * mirrorX;
        const ny = (y / height - 0.5) * 2 * mirrorY;
        let wx = nx + warp * (0.72 * gx + 0.34 * (aField - 0.5));
        let wy = ny + warp * (0.72 * gy - 0.34 * (aField - 0.5));
        const radius = Math.hypot(wx, wy);
        const theta = Math.atan2(wy, wx);
        if (compositionMode === 1) {
          wx += 0.085 * Math.sin(2.2 * theta + compositionPhase) * (0.35 + 0.65 * radius);
          wy += 0.045 * Math.cos(3.0 * theta - compositionPhase) * (m - 0.5);
        } else if (compositionMode === 2) {
          wy += 0.105 * Math.sin(2.6 * wx + compositionPhase) * (0.35 + 0.65 * aField);
        } else if (compositionMode === 3) {
          const twist = 0.30 * (1 - Math.min(1, radius)) + 0.12 * (m - 0.5);
          wx = radius * Math.cos(theta + twist + compositionPhase * 0.08);
          wy = radius * Math.sin(theta + twist + compositionPhase * 0.08);
        } else if (compositionMode === 4) {
          wx += 0.075 * Math.sin(3.4 * wy + compositionPhase);
          wy += 0.075 * Math.sin(2.2 * wx - compositionPhase);
        } else if (compositionMode === 5) {
          const fold = 0.90 + 0.10 * Math.cos(theta * 2 + compositionPhase);
          wx *= fold;
          wy *= 1.04 - 0.08 * Math.sin(theta * 3 - compositionPhase);
        } else if (compositionMode === 6) {
          wx += 0.055 * Math.sin(4.2 * wy + compositionPhase) * (0.45 + 0.55 * qField);
          wy += 0.040 * Math.cos(3.1 * wx - compositionPhase) * (0.35 + 0.65 * m);
        } else if (compositionMode === 7) {
          const depthFold = 0.93 + 0.07 * Math.sin(3.0 * theta + compositionPhase);
          wx *= depthFold;
          wy += 0.060 * (qField - 0.5) + 0.030 * Math.sin(5.0 * wx - compositionPhase);
        }
        const rx = ca * wx - sa * wy;
        const ry = sa * wx + ca * wy;
        const cRe = baseCx + rx * scaleX;
        const cIm = baseCy + ry * scaleY;

        let zr = initialOrbit * (0.65 * (m - 0.5) + 0.35 * (aField - 0.5));
        let zi = initialOrbit * (0.65 * (s - 0.5) - 0.35 * (aField - 0.5));
        let dr = 0;
        let di = 0;
        let orbitTrap = 1e9;
        let iter = 0;
        let zr2 = zr * zr, zi2 = zi * zi;
        while (zr2 + zi2 <= 16 && iter < maxIter) {
          const z2r = zr2 - zi2;
          const z2i = 2 * zr * zi;
          const z3r = z2r * zr - z2i * zi;
          const z3i = z2r * zi + z2i * zr;
          // Complex derivative of z^2 + mu*z^3 + c. This supplies a
          // deterministic distance estimator and surface normal for 2.5D relief.
          const derivativeRe = 2 * zr + 3 * cubicMix * z2r;
          const derivativeIm = 2 * zi + 3 * cubicMix * z2i;
          const nextDr = derivativeRe * dr - derivativeIm * di + 1;
          const nextDi = derivativeRe * di + derivativeIm * dr;
          dr = nextDr;
          di = nextDi;
          const localFractalWarp = (1 - fractalInfluence) * 0.010;
          zr = z2r + cubicMix * z3r + cRe
            + localFractalWarp * (0.62 * (m - 0.5) + 0.38 * (qField - 0.5));
          zi = z2i + cubicMix * z3i + cIm
            + localFractalWarp * (0.58 * (aField - 0.5) - 0.42 * (qField - 0.5));
          zr2 = zr * zr;
          zi2 = zi * zi;
          const trap = Math.abs(zr) + Math.abs(zi)
            + (0.38 + 0.24 * aggregate.heterozygosityMean) * Math.abs(zr - zi);
          if (trap < orbitTrap) orbitTrap = trap;
          iter++;
        }
        const escaped = iter < maxIter;
        const orbitMagnitude = Math.sqrt(zr2 + zi2);
        let smooth = escaped ? (iter + 1 - Math.log2(Math.log2(Math.max(2.0001, orbitMagnitude)))) : maxIter;
        smooth = Math.max(0, smooth / maxIter);
        const derivativeMagnitude = Math.hypot(dr, di);
        const distanceEstimate = escaped && derivativeMagnitude > 1e-18
          ? 0.5 * Math.log(Math.max(1.0000001, orbitMagnitude)) * orbitMagnitude / derivativeMagnitude
          : 0;
        const worldPerPixel = Math.max(1e-12, 2 * scaleX / width);
        const distancePixels = distanceEstimate / worldPerPixel;
        const derivativeNorm2 = dr * dr + di * di;
        let boundaryNormalX = 0;
        let boundaryNormalY = 0;
        if (escaped && derivativeNorm2 > 1e-24) {
          // Complex quotient z / dz points approximately along the exterior
          // distance-field gradient.
          boundaryNormalX = (zr * dr + zi * di) / derivativeNorm2;
          boundaryNormalY = (zi * dr - zr * di) / derivativeNorm2;
          const normalLength = Math.hypot(boundaryNormalX, boundaryNormalY) || 1;
          boundaryNormalX /= normalLength;
          boundaryNormalY /= normalLength;
        }
        const boundaryDiffuse = Math.max(0,
          boundaryNormalX * lightX + boundaryNormalY * lightY + 0.28 * lightZ
        );
        const boundarySpecular = Math.pow(Math.max(0,
          boundaryNormalX * lightX + boundaryNormalY * lightY
        ), 10);
        const trapNorm = Math.exp(-orbitTrap * 1.05);
        const contour = 0.5 + 0.5 * Math.sin(
          (9.4 + 5.8 * aggregate.shannonMean) * smooth
          + 4.6 * aField + 3.4 * trapNorm + 2.6 * m + 2.1 * qField + compositionPhase
        );
        const ridge = Math.pow(Math.max(0, 1 - Math.abs(2 * m - 1)), 0.72);
        const morphMix = Math.max(0, Math.min(1,
          0.34 * m + 0.24 * s + 0.22 * aField + 0.20 * qField
        ));
        const distCenter = Math.hypot(nx * 0.78, ny * 0.70);
        const bgWaveA = 0.5 + 0.5 * Math.sin(
          compositionPhase
          + 1.20 * distCenter
          + 2.15 * morphMix
          + 2.60 * nx - 2.10 * ny
          + 0.38 * palettePlan.spatialFrequency * Math.sin(1.7 * nx + 1.2 * ny)
        );
        const bgWaveB = 0.5 + 0.5 * Math.sin(
          -0.73 * compositionPhase
          - 2.05 * nx - 2.45 * ny
          + 1.75 * qField
          + 0.92 * Math.sin(1.25 * nx - 1.55 * ny + compositionPhase)
        );
        const backgroundSecondary = palettePlan.families[
          positiveModulo(3 + (compositionMode & 1), 4)
        ];
        const backgroundTertiary = palettePlan.families[
          positiveModulo(2 + (compositionMode % 3), 4)
        ];
        let backgroundSplitA = Math.max(0, Math.min(1, (bgWaveA - 0.43) / 0.18));
        backgroundSplitA = backgroundSplitA * backgroundSplitA * (3 - 2 * backgroundSplitA);
        let backgroundSplitB = Math.max(0, Math.min(1, (bgWaveB - 0.50) / 0.18));
        backgroundSplitB = backgroundSplitB * backgroundSplitB * (3 - 2 * backgroundSplitB);
        let backgroundColor = lerpRgb(
          lerpRgb(palettePlan.families[0], palettePlan.paper, 0.018),
          backgroundSecondary,
          0.72 * backgroundSplitA
        );
        backgroundColor = lerpRgb(
          backgroundColor,
          backgroundTertiary,
          0.62 * backgroundSplitB * (0.54 + 0.46 * (1 - backgroundSplitA))
        );
        const interiorColor = lerpRgb(
          palettePlan.families[1],
          palettePlan.shadow,
          0.11
        );
        const filamentColor = lerpRgb(
          palettePlan.families[2],
          palettePlan.paper,
          0.10
        );
        const morphColor = lerpRgb(
          palettePlan.families[3],
          palettePlan.shadow,
          0.14
        );
        const edgeProximity = escaped
          ? Math.max(0, Math.min(1, (smooth - 0.008) / 0.40))
          : 1;
        const boundaryRidge = escaped
          ? Math.exp(-distancePixels / (1.25 + 1.10 * qField))
          : 0;
        const distanceLayer = escaped
          ? (0.5 + 0.5 * Math.cos(
            5.6 * Math.log2(1 + Math.max(0, distancePixels))
            + 2.4 * qField + compositionPhase
          )) * Math.exp(-distancePixels / 22)
          : 0;
        const filamentStrength = escaped
          ? Math.max(
            0.82 * boundaryRidge,
            Math.pow(edgeProximity, 0.62) * (0.62 + 0.22 * contour + 0.16 * qField)
          )
          : 0;
        const morphRidge = Math.pow(ridge, 4.2);
        let morphAccent = Math.max(0, Math.min(1,
          (0.68 * morphRidge + 0.22 * aField + 0.10 * trapNorm - 0.28) / 0.46
        ));
        morphAccent = morphAccent * morphAccent * (3 - 2 * morphAccent);
        const morphCarrier = positiveModulo(
          1.22 * m + 0.62 * s + 0.52 * aField + 0.74 * qField + seedBytes[77] / 255,
          1
        );
        let morphFill = Math.max(0, Math.min(1, (morphCarrier - 0.62) / 0.11));
        morphFill = morphFill * morphFill * (3 - 2 * morphFill);
        const morphLayer = Math.max(morphAccent, 0.78 * morphFill);
        let antennaLine = Math.max(0, Math.min(1, (aField - 0.30) / 0.34));
        antennaLine = antennaLine * antennaLine * (3 - 2 * antennaLine);
        let genotypeLine = Math.max(0, Math.min(1,
          (0.72 * qField + 0.28 * Math.hypot(qx, qy) * 5.0 - 0.34) / 0.40
        ));
        genotypeLine = genotypeLine * genotypeLine * (3 - 2 * genotypeLine);

        const heightGradientX = reliefStrength * (
          1.02 * gx + 0.62 * ax + 0.86 * qx
        );
        const heightGradientY = reliefStrength * (
          1.02 * gy + 0.62 * ay + 0.86 * qy
        );
        const interiorNormalLength = Math.hypot(heightGradientX, heightGradientY, 1);
        const interiorNormalX = -heightGradientX / interiorNormalLength;
        const interiorNormalY = -heightGradientY / interiorNormalLength;
        const interiorNormalZ = 1 / interiorNormalLength;
        const interiorDiffuse = Math.max(0,
          interiorNormalX * lightX
          + interiorNormalY * lightY
          + interiorNormalZ * lightZ
        );
        const interiorSpecular = Math.pow(Math.max(0,
          interiorNormalX * lightX
          + interiorNormalY * lightY
          + interiorNormalZ * lightZ
        ), 12);
        const interiorWave = 0.5 + 0.5 * Math.sin(
          compositionPhase
          + 3.15 * m
          + 2.35 * qField
          + 1.55 * s
          + 1.80 * nx
          - 1.45 * ny
        );
        let interiorRegion = Math.max(0, Math.min(1, (interiorWave - 0.43) / 0.20));
        interiorRegion = interiorRegion * interiorRegion * (3 - 2 * interiorRegion);

        let rgb;
        if (!escaped) {
          // Mandelbrot-set interiors remain broad and legible, as in the original
          // GenPI aesthetic. The DNA-derived morphogenetic field cuts crisp,
          // deterministic secondary-colour structures through those planes.
          rgb = lerpRgb(interiorColor, palettePlan.shadow, 0.02 * (1 - ridge));
          rgb = lerpRgb(
            rgb,
            palettePlan.families[positiveModulo(compositionMode + 2, 4)],
            0.42 * interiorRegion
          );
          rgb = lerpRgb(rgb, morphColor, 0.94 * morphLayer);
          rgb = lerpRgb(rgb, palettePlan.families[0], 0.54 * genotypeLine);
          rgb = lerpRgb(rgb, filamentColor, 0.76 * Math.max(antennaLine, 0.64 * genotypeLine));

          // Morphogenetic and genotype fields form a height map. Their spatial
          // derivatives define a surface normal, so illumination follows the
          // DNA-derived relief rather than a generic drop shadow.
          const reliefShade = Math.max(0.78, Math.min(1.18,
            0.82 + 0.32 * interiorDiffuse - 0.045 * morphLayer
          ));
          rgb = rgb.map(value => 28 + (value - 28) * reliefShade);
          rgb = lerpRgb(rgb, palettePlan.paper, 0.075 * interiorSpecular);
          rgb = lerpRgb(rgb, palettePlan.shadow,
            0.075 * (1 - interiorDiffuse) * Math.max(morphLayer, genotypeLine)
          );
        } else {
          // Exterior space is a defined pastel plane. Deep escape-time orbits form
          // the fine high-contrast fractal corona instead of being washed into fog.
          rgb = backgroundColor;
          rgb = lerpRgb(rgb, filamentColor, 0.98 * filamentStrength);
          const contourAccent = filamentStrength * Math.max(0, (contour - 0.42) / 0.58);
          rgb = lerpRgb(rgb, morphColor, 0.62 * contourAccent * morphAccent);
          rgb = lerpRgb(rgb, palettePlan.families[0], 0.34 * antennaLine * edgeProximity);
          rgb = lerpRgb(rgb, palettePlan.families[1],
            0.28 * genotypeLine * (
              0.36 + 0.64 * Math.max(boundaryRidge, edgeProximity)
            )
          );

          // The complex derivative supplies both a distance-to-boundary ridge
          // and an approximate exterior normal. Relief fades cleanly into the
          // paper plane instead of shading the whole background.
          const reliefPresence = Math.max(
            boundaryRidge,
            0.58 * distanceLayer,
            0.34 * filamentStrength,
            0.26 * genotypeLine
          );
          const reliefShade = Math.max(0.82, Math.min(1.20,
            1
            + reliefPresence * (0.30 * (boundaryDiffuse - 0.42) + 0.055 * distanceLayer)
            + 0.10 * genotypeLine * (interiorDiffuse - 0.50)
          ));
          rgb = rgb.map(value => 30 + (value - 30) * reliefShade);
          rgb = lerpRgb(rgb, palettePlan.paper,
            0.085 * boundarySpecular * reliefPresence
          );
          rgb = lerpRgb(rgb, palettePlan.shadow,
            0.055 * (1 - boundaryDiffuse) * boundaryRidge
          );
        }

        // A modest deterministic contrast expansion restores local separation
        // without introducing fluorescent colours or a post-process blur.
        const contrast = 1.095 + 0.135 * filamentStrength + 0.065 * morphLayer;
        rgb = rgb.map(v => 128 + (v - 128) * contrast);

        const grain = (seededNoise(x, y, seedBytes[9]) - 0.5) * (0.28 + seedBytes[10] / 255 * 0.32);
        rgb = rgb.map(v => Number.isFinite(v) ? Math.max(0, Math.min(255, v + grain)) : 0);

        const yn = y / height;
        const edgeBand = yn < 1 / 12 ? yn * 12 : (yn > 11 / 12 ? (1 - yn) * 12 : 1);
        const safe = Math.max(0, Math.min(1, edgeBand));
        rgb = rgb.map(v => v * (0.965 + 0.035 * safe));

        data[ptr++] = rgb[0];
        data[ptr++] = rgb[1];
        data[ptr++] = rgb[2];
        data[ptr++] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function composeMaster(baseCanvas, seedBytes) {
    const output = makeCanvas(config.width, config.height);
    const ctx = output.getContext('2d', { alpha: false });
    if (!ctx) throw new GenPiDNAError('GENPI_CANVAS_CONTEXT', 'The print-master canvas could not be created.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(baseCanvas, 0, 0, config.width, config.height);

    const vignette = ctx.createRadialGradient(
      config.width * (0.48 + (seedBytes[11] / 255 - 0.5) * 0.05),
      config.height * (0.50 + (seedBytes[12] / 255 - 0.5) * 0.04),
      Math.min(config.width, config.height) * 0.14,
      config.width * 0.5,
      config.height * 0.5,
      Math.max(config.width, config.height) * 0.73
    );
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(0.80, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.025)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, config.width, config.height);
    return output;
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new GenPiDNAError('GENPI_PNG_ENCODE', 'PNG encoding failed.')), 'image/png');
    });
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function writeU32(view, offset, value) {
    view[offset] = (value >>> 24) & 255;
    view[offset + 1] = (value >>> 16) & 255;
    view[offset + 2] = (value >>> 8) & 255;
    view[offset + 3] = value & 255;
  }

  function makeChunk(type, payload) {
    const typeBytes = new TextEncoder().encode(type);
    const out = new Uint8Array(12 + payload.length);
    writeU32(out, 0, payload.length);
    out.set(typeBytes, 4);
    out.set(payload, 8);
    const crcInput = new Uint8Array(typeBytes.length + payload.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(payload, typeBytes.length);
    writeU32(out, 8 + payload.length, crc32(crcInput));
    return out;
  }

  function setPngDpi(pngBytes, dpi) {
    const signature = [137,80,78,71,13,10,26,10];
    for (let i = 0; i < signature.length; i++) if (pngBytes[i] !== signature[i]) throw new GenPiDNAError('GENPI_INVALID_PNG', 'The generated bytes are not a valid PNG.');
    const ppm = Math.round(dpi / 0.0254);
    const payload = new Uint8Array(9);
    writeU32(payload, 0, ppm);
    writeU32(payload, 4, ppm);
    payload[8] = 1;
    const phys = makeChunk('pHYs', payload);
    const chunks = [pngBytes.slice(0, 8)];
    let pos = 8;
    let inserted = false;
    while (pos + 12 <= pngBytes.length) {
      const len = ((pngBytes[pos] << 24) | (pngBytes[pos + 1] << 16) | (pngBytes[pos + 2] << 8) | pngBytes[pos + 3]) >>> 0;
      const end = pos + 12 + len;
      const type = String.fromCharCode(pngBytes[pos + 4], pngBytes[pos + 5], pngBytes[pos + 6], pngBytes[pos + 7]);
      if (type !== 'pHYs') chunks.push(pngBytes.slice(pos, end));
      if (type === 'IHDR' && !inserted) { chunks.push(phys); inserted = true; }
      pos = end;
      if (type === 'IEND') break;
    }
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    return btoa(binary);
  }

  async function pngDataUrlWithDpi(canvas, dpi) {
    const blob = await canvasToPngBlob(canvas);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const patched = setPngDpi(bytes, dpi);
    return `data:image/png;base64,${bytesToBase64(patched)}`;
  }

  async function analyzeText(text, source) {
    const parsed = parseDNA(text, source);
    const { seedBytes: digestBytes, seedHash } = await deriveSeed(parsed);
    const seedBytes = expandSeedBytes(digestBytes, 96);
    const features = extractFeatures(parsed);
    const bands = graphWaveletBands(features);
    const dynamics = evolveOpenHamiltonian(features, bands, seedBytes);
    return { parsed, seedBytes, seedHash, features, bands, dynamics };
  }

  async function inspect(file, source) {
    validateFile(file);
    const text = await file.text();
    const analysis = await analyzeText(text, source);
    return {
      source: analysis.parsed.source,
      seedHash: analysis.seedHash,
      safeMetadata: {
        engine: 'GenPI DNA Morphogenetic Engine',
        engineVersion: ENGINE_VERSION,
        source: analysis.parsed.source,
        variantCountBucket: bucketVariantCount(analysis.parsed.variantCount),
        localProcessing: true,
        modelClass: 'deterministic quantum-inspired fractal-morphogenetic generative art'
      }
    };
  }

  function validateFile(file) {
    if (!file || typeof file.text !== 'function') throw new GenPiDNAError('GENPI_INVALID_FILE', 'A browser File-like object is required.');
    if (Number.isFinite(file.size) && file.size > config.maxFileBytes) throw new GenPiDNAError('GENPI_FILE_TOO_LARGE', 'The DNA file exceeds the local-processing size limit.');
  }

  async function generate(file, source) {
    validateFile(file);
    const normalizedSource = normalizeSource(source);
    if (!normalizedSource) throw new GenPiDNAError('GENPI_UNSUPPORTED_SOURCE', 'This DNA package supports only 23andMe and Ancestry.com.');
    const text = await file.text();
    const analysis = await analyzeText(text, normalizedSource);
    const substrate = buildGenomicSubstrate(analysis.parsed, analysis.features, analysis.dynamics, analysis.seedBytes);
    const morph = runMorphogenesis(substrate, analysis.features, analysis.dynamics, analysis.seedBytes);
    const base = renderArtwork(morph, substrate, analysis.features, analysis.dynamics, analysis.seedBytes);
    const master = composeMaster(base, analysis.seedBytes);
    const dataUrl = await pngDataUrlWithDpi(master, config.dpi);

    const result = {
      dataUrl,
      width: config.width,
      height: config.height,
      seedHash: analysis.seedHash
    };
    if (config.includeMetadata) {
      result.metadata = {
        engine: 'GenPI DNA Morphogenetic Engine',
        engineVersion: ENGINE_VERSION,
        source: analysis.parsed.source,
        format: 'image/png',
        dpi: config.dpi,
        aspectRatio: '2:3',
        printSafeZone: 'central 3600x4500 at 3600x5400 master size',
        variantCountBucket: bucketVariantCount(analysis.parsed.variantCount),
        localProcessing: true,
        containsRawBiologicalData: false,
        modelClass: 'deterministic quantum-inspired fractal-morphogenetic generative art',
        clinicalInterpretation: false
      };
    }
    return result;
  }

  async function testParseAndSeed(text, source) {
    const parsed = parseDNA(text, source);
    const { seedHash } = await deriveSeed(parsed);
    const features = extractFeatures(parsed);
    return {
      source: parsed.source,
      variantCount: parsed.variantCount,
      calledCount: parsed.calledCount,
      seedHash,
      variantCountBucket: bucketVariantCount(parsed.variantCount),
      effectiveBinsPerChromosome: features.B,
      featureDigest: [
        features.aggregate.shannonMean,
        features.aggregate.vonNeumannMean,
        features.aggregate.heterozygosityMean,
        features.aggregate.gcMean,
        features.aggregate.chromosomeDensityCv,
        features.aggregate.structuralClustering
      ].map(v => Number(v.toFixed(8)))
    };
  }

  async function testPipeline(text, source) {
    const analysis = await analyzeText(text, source);
    const substrate = buildGenomicSubstrate(analysis.parsed, analysis.features, analysis.dynamics, analysis.seedBytes);
    const morph = runMorphogenesis(substrate, analysis.features, analysis.dynamics, analysis.seedBytes);
    const morphSorted = Array.from(morph.pattern).sort((a, b) => a - b);
    const morphQuantile = q => morphSorted[Math.floor((morphSorted.length - 1) * q)];
    return {
      seedHash: analysis.seedHash,
      spectral: analysis.dynamics.spectral.map(v => Number(v.toFixed(8))),
      rd: Object.fromEntries(Object.entries(morph.params).map(([k, v]) => [k, Number(v.toFixed(8))])),
      morphQuantiles: [0.1, 0.25, 0.5, 0.75, 0.9].map(q => Number(morphQuantile(q).toFixed(8))),
      substrateChecksum: numericChecksum(substrate.field),
      antennaChecksum: numericChecksum(substrate.antenna),
      morphChecksum: numericChecksum(morph.pattern),
      microChecksum: numericChecksum(substrate.micro),
      cgrRecordsUsed: substrate.cgrRecordsUsed,
      cgrStride: substrate.cgrStride
    };
  }

  async function testStylePlan(text, source) {
    const analysis = await analyzeText(text, source);
    const plan = makePalettePlan(analysis.features, analysis.seedBytes);
    return {
      seedHash: analysis.seedHash,
      paletteName: plan.name,
      paletteIndex: plan.index,
      compositionMode: analysis.seedBytes[68] % 8,
      fractalInfluence: Number((0.64 + 0.24 * (analysis.seedBytes[69] / 255)).toFixed(6)),
      reliefStrength: Number((
        1.45
        + 1.35 * (analysis.seedBytes[80] / 255)
        + 0.65 * Math.min(1, analysis.features.aggregate.chromosomeDensityCv)
      ).toFixed(6)),
      effectiveBinsPerChromosome: analysis.features.B,
      aggregates: Object.fromEntries(
        Object.entries(analysis.features.aggregate).map(([key, value]) => [key, Number(value.toFixed(8))])
      )
    };
  }

  function numericChecksum(array) {
    let sum = 0;
    for (let i = 0; i < array.length; i++) sum = (sum + Math.round(array[i] * 1000000) * (i + 1)) % 2147483647;
    return sum;
  }

  return Object.freeze({
    version: ENGINE_VERSION,
    namespace: ENGINE_NAMESPACE,
    supportedSources: SUPPORTED_SOURCES,
    generate,
    inspect,
    supports,
    configure,
    resetConfig,
    GenPiDNAError,
    _test: Object.freeze({
      parseAndSeed: testParseAndSeed,
      pipeline: testPipeline,
      stylePlan: testStylePlan,
      normalizeSource,
      setPngDpi
    })
  });
});
