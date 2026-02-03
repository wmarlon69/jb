const CACHE_NAME = 'farmacia-app-v3'; // Subi para v3 para limpar o erro anterior
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/components.css',
  '/js/main.js', // Corrigido de jss para js
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// 1. Instalação (Cacheamento)
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Força a nova versão a assumir o posto agora
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 PWA: Armazenando arquivos no cache...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// 2. Ativação (Limpeza de versões velhas)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('🗑️ PWA: Removendo cache antigo:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim(); // Ativa o controle sobre as abas abertas imediatamente
});

// 3. Interceptação (O "Modo Offline")
self.addEventListener('fetch', (event) => {
  // Ignora chamadas do Firebase/Google (precisam de internet real)
  if (event.request.url.includes('firestore') || event.request.url.includes('googleapis')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Se estiver no cache, entrega. Se não, busca na internet.
        return response || fetch(event.request);
      })
  );
});