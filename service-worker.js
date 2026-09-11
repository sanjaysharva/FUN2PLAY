const CACHE_NAME = "calculator-v2";

const FILES_TO_CACHE = [
    "./",
    "./index.html"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            for (const file of FILES_TO_CACHE) {
                try {
                    await cache.add(file);
                } catch (error) {
                    console.log("Could not cache:", file, error);
                }
            }
        })
    );

    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            )
        )
    );

    self.clients.claim();
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});