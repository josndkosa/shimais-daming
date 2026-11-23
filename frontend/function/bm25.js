// backend/retriever.py + rank_bm25.BM25Okapi 的等价移植：
// 分词、同义扩展、idf（负值地板 eps=0.25*average_idf）、打分与排序逐式对齐。
import { SYNONYMS } from "./consts.js";
import { loadFigure } from "./materials.js";

const K1 = 1.5;
const B = 0.75;
const EPSILON = 0.25;

export function tokens(text) {
  const words = text.toLowerCase().match(/[A-Za-z0-9]+/g) || [];
  const chars = text.match(/[一-鿿]/g) || [];
  const bigrams = [];
  for (let i = 0; i + 1 < chars.length; i++) bigrams.push(chars[i] + chars[i + 1]);
  return words.concat(chars, bigrams);
}

export function queryTokens(query) {
  const out = tokens(query);
  for (const [word, synonyms] of Object.entries(SYNONYMS)) {
    if (query.includes(word)) {
      for (const synonym of synonyms) out.push(...tokens(synonym));
    }
  }
  return out;
}

export class BM25Okapi {
  constructor(corpus) {
    this.corpusSize = corpus.length;
    this.docFreqs = [];
    this.docLen = [];
    const nd = new Map();
    let totalLen = 0;
    for (const document of corpus) {
      this.docLen.push(document.length);
      totalLen += document.length;
      const frequencies = new Map();
      for (const word of document) frequencies.set(word, (frequencies.get(word) || 0) + 1);
      this.docFreqs.push(frequencies);
      for (const word of frequencies.keys()) nd.set(word, (nd.get(word) || 0) + 1);
    }
    this.avgdl = this.corpusSize ? totalLen / this.corpusSize : 0;
    this.idf = new Map();
    let idfSum = 0;
    const negatives = [];
    for (const [word, freq] of nd) {
      const idf = Math.log(this.corpusSize - freq + 0.5) - Math.log(freq + 0.5);
      this.idf.set(word, idf);
      idfSum += idf;
      if (idf < 0) negatives.push(word);
    }
    const averageIdf = nd.size ? idfSum / nd.size : 0;
    const eps = EPSILON * averageIdf;
    for (const word of negatives) this.idf.set(word, eps);
  }

  getScores(query) {
    const scores = new Array(this.corpusSize).fill(0);
    for (const q of query) {
      const idf = this.idf.get(q) || 0;
      for (let i = 0; i < this.corpusSize; i++) {
        const qFreq = this.docFreqs[i].get(q) || 0;
        scores[i] += idf * ((qFreq * (K1 + 1)) / (qFreq + K1 * (1 - B + (B * this.docLen[i]) / this.avgdl)));
      }
    }
    return scores;
  }
}

const cache = new Map();

export function clearCache() {
  cache.clear();
}

export function corpus(figure, provider) {
  if (!cache.has(figure)) {
    const chunks = loadFigure(figure, provider);
    const bm25 = new BM25Okapi(chunks.map((c) => tokens(c.title + " " + c.text)));
    cache.set(figure, [chunks, bm25]);
  }
  return cache.get(figure);
}

export function retrieve(figure, query, provider) {
  const [chunks, bm25] = corpus(figure, provider);
  const scores = bm25.getScores(queryTokens(query));
  const order = scores
    .map((s, i) => [s, i])
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, 3)
    .map(([, i]) => i);
  return order.map((i) => chunks[i]);
}