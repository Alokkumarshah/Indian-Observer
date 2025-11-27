const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSummaryLength } = require('../src/services/trendingService');

test('normalizeSummaryLength trims overly long summaries', () => {
  const longText = Array.from({ length: 400 }, (_, idx) => `word${idx}`).join(' ');
  const normalized = normalizeSummaryLength(longText);

  const wordCount = normalized.trim().split(/\s+/).length;
  assert.ok(wordCount <= 140, 'summary should not exceed 140 words');
});

test('normalizeSummaryLength pads short summaries with fallback content', () => {
  const fallbackArticles = [
    { snippet: 'Fallback snippet one for story context.' },
    { snippet: 'Fallback snippet two keeps the reader informed.' },
  ];

  const normalized = normalizeSummaryLength('Tiny', fallbackArticles);
  const wordCount = normalized.trim().split(/\s+/).length;

  assert.ok(wordCount >= 100, 'summary should be padded to at least 100 words');
  assert.match(normalized, /Fallback snippet one/, 'fallback snippets should be reused');
});


