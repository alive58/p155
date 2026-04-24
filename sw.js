// ============================================================
// Service Worker — تحدّي التركيز PWA
// استراتيجية: Cache-First مع تحديث في الخلفية
// ============================================================

const CACHE_NAME = 'focus-v1';

// كل ما يحتاجه التطبيق ليعمل بدون إنترنت
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ملفات خارجية نريد تخزينها مؤقتاً عند أول تحميل
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
];

// ===== Install: خزّن كل شيء =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // خزّن الملفات المحلية بشكل مضمون
      await cache.addAll(STATIC_ASSETS);

      // حاول تخزين الملفات الخارجية — لا تفشل إن لم تتوفر
      const external = await Promise.allSettled(
        EXTERNAL_ASSETS.map(url =>
          fetch(url, { mode: 'cors' })
            .then(res => {
              if (res.ok) cache.put(url, res);
            })
            .catch(() => {}) // تجاهل فشل الشبكة
        )
      );
      return;
    })
  );
  // فعّل الـ SW فوراً بدون انتظار
  self.skipWaiting();
});

// ===== Activate: احذف الكاش القديم =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ===== Fetch: Cache-First → Network-Fallback =====
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // تجاهل طلبات Firebase Auth / Firestore الديناميكية
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('/identitytoolkit') ||
    url.hostname.includes('securetoken.google.com')
  ) {
    // Network only للمصادقة
    event.respondWith(fetch(event.request).catch(() =>
      new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })
    ));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // أعد الكاش فوراً، وحدّث في الخلفية
        const networkUpdate = fetch(event.request)
          .then(res => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
            }
            return res;
          })
          .catch(() => {});
        return cached;
      }

      // مش موجود في الكاش — جيبه من الشبكة وخزّنه
      return fetch(event.request)
        .then(res => {
          if (!res || !res.ok || res.type === 'opaque') return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => {
          // Fallback للصفحة الرئيسية إن فشل كل شيء
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
    })
  );
});

// ===== Background Sync (اختياري للمستقبل) =====
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sessions') {
    // يمكن إضافة مزامنة Firestore هنا مستقبلاً
    console.log('[SW] Background sync triggered');
  }
});
