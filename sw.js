/* ═══════════════════════════════════════════════════════════════
 *  📡 InstaLens — Service Worker
 *  ───────────────────────────────────────────────────────────
 *  Strategy:  Cache-First for static assets
 *             Network-First for dynamic data
 *             Stale-While-Revalidate for fonts/images
 *  ───────────────────────────────────────────────────────────
 *  Author:    InstaLens Dev Team
 *  Version:   2.0.0
 *  Updated:   2026-02-27
 * ═══════════════════════════════════════════════════════════════ */

// ─── ① نسخه کش — هر بار آپدیت کردی عددشو عوض کن ───
const CACHE_VERSION = 'instalens-v2.0.0';

// ─── ② لیست فایل‌هایی که باید از اول کش بشن (App Shell) ───
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',

  // ─── آیکون‌ها ───
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',

  // ─── فونت‌های خارجی (اگه داری) ───
  // './fonts/Vazirmatn.woff2',

  // ─── اسکرین‌شات‌ها (اختیاری) ───
  // './screenshots/screenshot-wide.png',
  // './screenshots/screenshot-narrow.png',
];

// ─── ③ مسیرهایی که نباید کش بشن ───
const EXCLUDE_FROM_CACHE = [
  /chrome-extension/,
  /\/api\//,
  /google-analytics/,
  /googletagmanager/,
];


/* ═══════════════════════════════════════════════════════════════
 *  🔧 INSTALL — وقتی سرویس‌ورکر نصب میشه
 * ═══════════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.log(`[SW] 📦 نصب نسخه ${CACHE_VERSION}...`);

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('[SW] ✅ کش کردن App Shell...');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        // فوری فعال شو، منتظر بسته شدن تب‌ها نمون
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] ❌ خطا در کش اولیه:', err);
      })
  );
});


/* ═══════════════════════════════════════════════════════════════
 *  🔄 ACTIVATE — وقتی نسخه جدید فعال میشه
 *  کش‌های قدیمی رو پاک می‌کنیم
 * ═══════════════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.log(`[SW] 🚀 فعال‌سازی نسخه ${CACHE_VERSION}...`);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_VERSION)
            .map((oldCache) => {
              console.log(`[SW] 🗑️ حذف کش قدیمی: ${oldCache}`);
              return caches.delete(oldCache);
            })
        );
      })
      .then(() => {
        // کنترل تمام تب‌های باز رو بگیر
        return self.clients.claim();
      })
  );
});


/* ═══════════════════════════════════════════════════════════════
 *  🌐 FETCH — مدیریت درخواست‌ها
 *  ─────────────────────────────────────────────────────────────
 *  استراتژی‌ها:
 *    1) navigate → Network-First (همیشه آخرین HTML رو بگیر)
 *    2) CSS/JS  → Cache-First (سریع لود شو)
 *    3) تصاویر  → Stale-While-Revalidate (نشون بده، آپدیت کن)
 *    4) بقیه   → Network-First با fallback
 * ═══════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {

  const { request } = event;
  const url = new URL(request.url);

  // ─── درخواست‌های غیرمجاز رو رد کن ───
  if (request.method !== 'GET') return;
  if (EXCLUDE_FROM_CACHE.some((pattern) => pattern.test(url.href))) return;

  // ─── فقط HTTP/HTTPS ───
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    (async () => {
      // ══════════════════════════════════════════
      //  📄 Navigation (HTML) → Network-First
      // ══════════════════════════════════════════
      if (request.mode === 'navigate') {
        return networkFirst(request);
      }

      // ══════════════════════════════════════════
      //  🎨 CSS & JS → Cache-First
      // ══════════════════════════════════════════
      if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
        return cacheFirst(request);
      }

      // ══════════════════════════════════════════
      //  🖼️ تصاویر → Stale-While-Revalidate
      // ══════════════════════════════════════════
      if (
        request.destination === 'image' ||
        /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname)
      ) {
        return staleWhileRevalidate(request);
      }

      // ══════════════════════════════════════════
      //  📦 فونت‌ها → Cache-First (فونت عوض نمیشه)
      // ══════════════════════════════════════════
      if (
        request.destination === 'font' ||
        /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname)
      ) {
        return cacheFirst(request);
      }

      // ══════════════════════════════════════════
      //  🔀 بقیه → Network-First
      // ══════════════════════════════════════════
      return networkFirst(request);
    })()
  );
});


/* ═══════════════════════════════════════════════════════════════
 *  🛠️ استراتژی‌های کش
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Cache-First: اول از کش بخون، اگه نبود برو نتورک
 * مناسب برای: CSS, JS, فونت‌ها
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return fallbackResponse();
  }
}

/**
 * Network-First: اول از نتورک بخون، اگه آفلاین بود از کش
 * مناسب برای: HTML, API
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // اگه navigate بود و هیچی نداشتیم، صفحه آفلاین نشون بده
    if (request.mode === 'navigate') {
      return offlineFallback();
    }
    return fallbackResponse();
  }
}

/**
 * Stale-While-Revalidate: از کش نشون بده، پشت‌صحنه آپدیت کن
 * مناسب برای: تصاویر
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  // پشت‌صحنه آپدیت کن
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  // اگه کش داریم همونو بده، وگرنه منتظر نتورک بمون
  return cached || fetchPromise || fallbackResponse();
}


/* ═══════════════════════════════════════════════════════════════
 *  🆘 Fallback Responses — وقتی هیچی نداریم
 * ═══════════════════════════════════════════════════════════════ */

/**
 * صفحه آفلاین برای وقتی که نتورک و کش هر دو نداریم
 */
function offlineFallback() {
  const html = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>InstaLens — آفلاین</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
          background: #F5F0EB;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
          text-align: center;
          color: #4A4A5A;
        }
        .offline-box {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 3rem 2rem;
          max-width: 420px;
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
        }
        .emoji { font-size: 4rem; margin-bottom: 1rem; }
        h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
        p { font-size: 1rem; opacity: 0.7; line-height: 1.7; margin-bottom: 1.5rem; }
        button {
          background: linear-gradient(135deg, #A8CBF0, #C9A8E8);
          border: none;
          color: #fff;
          padding: 0.85rem 2rem;
          border-radius: 14px;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 600;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        button:active { transform: scale(0.96); }
        button:hover {
          box-shadow: 0 4px 20px rgba(168, 203, 240, 0.4);
        }
      </style>
    </head>
    <body>
      <div class="offline-box">
        <div class="emoji">📡</div>
        <h1>اتصال اینترنت قطع شد!</h1>
        <p>
          نگران نباش! داده‌هایی که قبلاً آنالیز کردی توی
          حافظه محلی ذخیره شدن. فقط کافیه اینترنتت وصل بشه.
        </p>
        <button onclick="window.location.reload()">🔄 تلاش دوباره</button>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * پاسخ خالی برای ریسورس‌های غیر-HTML
 */
function fallbackResponse() {
  return new Response('', {
    status: 408,
    statusText: 'Offline — cached version not available',
  });
}


/* ═══════════════════════════════════════════════════════════════
 *  💬 MESSAGE — ارتباط با صفحه اصلی
 * ═══════════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  // دستور آپدیت فوری از صفحه اصلی
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] ⏩ دستور skipWaiting دریافت شد');
    self.skipWaiting();
  }

  // دستور پاکسازی کامل کش
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] 🧹 پاکسازی کامل کش...');
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
