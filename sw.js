// H3-Stats Service Worker
// Cacht NUR die App-Hülle (index.html + die beiden CDN-Skripte), damit die Seite
// auch ganz ohne Netz startet. Supabase-Datenanfragen werden NICHT angefasst -
// die laufen weiterhin unverändert über die Queue-Logik in der index.html.

const CACHE_NAME = 'h3-stats-shell-v1';

const SHELL_URLS = [
    './',
    './index.html',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const url of SHELL_URLS) {
                try {
                    await cache.add(url);
                } catch (err) {
                    console.warn('[SW] Precache fehlgeschlagen für', url, err);
                }
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Nur App-Hülle behandeln (HTML-Seite selbst + die zwei CDN-Skripte).
    // Alles andere (insbesondere Supabase-API-Aufrufe) normal durchlassen,
    // damit unsere Offline-Queue-Logik unverändert weiterläuft.
    const isShellRequest = event.request.mode === 'navigate'
        || url.endsWith('/index.html')
        || url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js')
        || url.includes('cdnjs.cloudflare.com/ajax/libs/html2pdf.js');

    if (!isShellRequest) return;

    event.respondWith(
        // Network-first: online immer die aktuelle Version holen UND im Cache
        // aktualisieren; offline auf die zuletzt gecachte Version zurückfallen.
        fetch(event.request)
            .then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            })
            .catch(() =>
                caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
            )
    );
});
