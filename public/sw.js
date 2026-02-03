// sw.js - Service Worker para permitir a instalação (PWA)
const CACHE_NAME = 'farmacia-cache-v1';

self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalado');
});

self.addEventListener('fetch', (event) => {
    // Necessário para o Chrome considerar o site instalável
    event.respondWith(fetch(event.request));
});