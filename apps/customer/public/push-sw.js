self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { payload = { body: event.data?.text() ?? '' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'Beverly', {
    body: payload.body || 'You have a new wallet update.',
    icon: payload.icon || './pwa-192.png',
    badge: payload.icon || './pwa-192.png',
    tag: payload.tag || 'beverly-update',
    renotify: true,
    data: { url: payload.url || 'notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = String(event.notification.data?.url || 'notifications').replace(/^\/+/, '');
    const target = new URL(path, self.registration.scope);
    if (target.origin !== self.location.origin || !target.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (!new URL(client.url).pathname.startsWith(new URL(self.registration.scope).pathname)) continue;
      if ('navigate' in client) await client.navigate(target.href);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
