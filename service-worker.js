/* Service worker для офлайн-режиму шахового тренажера.
   Бампни CACHE_VERSION при кожному деплої, що міняє будь-який із перелічених файлів —
   activate() сам прибере старі версії кешу, тож відвідувачі не застрягнуть на застарілій
   копії назавжди (класична проблема "зламаного" service worker-а). */
const CACHE_VERSION = 'v1';
const CACHE_NAME = 'chess-trainer-' + CACHE_VERSION;

// "Оболонка" застосунку — усе, без чого сайт не запрацює взагалі: HTML, шрифти,
// chess.js, Stockfish (JS-обгортка + важкий .wasm), маніфест і іконки.
const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.json',
  'vendor/fonts.css',
  'vendor/chess.min.js',
  'vendor/stockfish-17.1-lite-single-03e3232.js',
  'vendor/stockfish-17.1-lite-single-03e3232.wasm',
  'vendor/fonts/fraunces-latin.woff2',
  'vendor/fonts/inter-cyrillic-ext.woff2',
  'vendor/fonts/inter-cyrillic.woff2',
  'vendor/fonts/inter-latin.woff2',
  'vendor/fonts/ibmplexmono-500-cyrillic-ext.woff2',
  'vendor/fonts/ibmplexmono-500-cyrillic.woff2',
  'vendor/fonts/ibmplexmono-500-latin.woff2',
  'vendor/fonts/ibmplexmono-600-cyrillic-ext.woff2',
  'vendor/fonts/ibmplexmono-600-cyrillic.woff2',
  'vendor/fonts/ibmplexmono-600-latin.woff2',
  'vendor/icons/icon-192.png',
  'vendor/icons/icon-512.png',
  'vendor/icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith('chess-trainer-') && n !== CACHE_NAME)
             .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/тощо (немає таких у цьому застосунку) не кешуємо
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google Fonts тощо сюди більше не приходять, але про всяк випадок

  const isShell = url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json');
  if (isShell) {
    // HTML/маніфест: stale-while-revalidate — миттєво віддаємо кеш (і офлайн теж), але
    // паралельно тягнемо свіжу версію з мережі й кладемо в кеш на НАСТУПНЕ відкриття.
    // Так поверненню користувача не потрібно чекати оновлення, але воно й не застрягає
    // назавжди на старій версії, поки CACHE_VERSION не зміниться.
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // vendor/* (шрифти, chess.js, Stockfish) — пінговані версії в самій назві файлу,
  // тому не змінюються: чистий cache-first, без зайвих мережевих запитів щоразу.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
