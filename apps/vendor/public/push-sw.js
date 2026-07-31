self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { payload = { body: event.data?.text() ?? '' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'Beverly', {
    body: payload.body || 'You have a new wallet update.',
    icon: payload.icon || './pwa-192.png',
    badge: payload.icon || './pwa-192.png',
    tag: payload.tag || 'beverly-update',
    renotify: true,
    data: { url: payload.url || './notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || './notifications', self.location.origin);
    if (target.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(target.href);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
