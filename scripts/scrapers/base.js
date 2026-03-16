'use strict';

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 15000;
const DELAY_MS = 1500;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Perform an HTTP GET with a realistic User-Agent and a timeout.
 * Returns the fetch Response — does not throw on HTTP error codes.
 */
async function fetchWithHeaders(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        ...options.headers,
      },
      ...options,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a URL and return a cheerio instance ($) for HTML parsing.
 * Throws an error with { status, url } if the response is not 200.
 */
async function fetchHtml(url) {
  const res = await fetchWithHeaders(url);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} fetching ${url}`);
    err.status = res.status;
    err.url = url;
    throw err;
  }
  const text = await res.text();
  return { $: cheerio.load(text), text };
}

/**
 * Fetch a URL and return the response body as text.
 * Returns null if blocked or errored.
 */
async function fetchText(url, options = {}) {
  try {
    const res = await fetchWithHeaders(url, options);
    if (!res.ok) return null;
    return await res.text();
  } catch (_) {
    return null;
  }
}

/**
 * Detect whether a response is blocked by Cloudflare.
 */
function isCloudflareBlocked(status, body) {
  if (status === 403 || status === 503) return true;
  if (typeof body === 'string') {
    if (body.includes('cf-browser-verification')) return true;
    if (body.includes('Checking your browser')) return true;
    if (body.includes('cf_captcha_kind')) return true;
    if (body.includes('Ray ID') && body.includes('Cloudflare')) return true;
  }
  return false;
}

/**
 * Check a URL for Cloudflare blocking.
 * Returns { blocked: boolean, status, body }.
 */
async function checkForBlock(url) {
  try {
    const res = await fetchWithHeaders(url, { timeout: 10000 });
    const body = await res.text();
    return {
      blocked: isCloudflareBlocked(res.status, body),
      status: res.status,
      body,
    };
  } catch (err) {
    return { blocked: false, status: 0, body: '', error: err };
  }
}

module.exports = {
  sleep,
  fetchWithHeaders,
  fetchHtml,
  fetchText,
  isCloudflareBlocked,
  checkForBlock,
  DELAY_MS,
  USER_AGENT,
};
