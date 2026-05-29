'use strict';

const CACHE_NAME = 'sgua-v1';
const STATIC_ASSETS = ['/', '/manifest.json'];

// Pre-cache static assets on install
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function() {});
    })
  );
  self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Network-first for API; cache-first for static assets
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests and API calls (always network for mutations)
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return fetch(event.request).then(function(response) {
        // Cache successful responses for static assets
        if (response.ok && !url.pathname.startsWith('/uploads/')) {
          cache.put(event.request, response.clone());
        }
        return response;
      }).catch(function() {
        // Offline fallback: serve from cache
        return cache.match(event.request).then(function(cached) {
          return cached || cache.match('/');
        });
      });
    })
  );
});
