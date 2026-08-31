// Force immediate activation on update
self.addEventListener("install", function (event) {
  self.skipWaiting();
});

// Clear old browser caches on activation
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          return caches.delete(cacheName);
        })
      );
    }).then(function () {
      return clients.claim();
    })
  );
});

// Push notification receiver
self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (error) {
    data = {
      title: "📩 BTC/USD Signal Alert",
      body: event.data.text()
    };
  }

  const title = data.title || "📩 BTC/USD Signal Alert";

  const options = {
    body: data.body || "New trade setup detected.",
    icon: "/icon.png",
    badge: "/icon.png",
    data: data,
    tag: "btc-trading-alert",
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 150, 500, 150, 700],
    silent: false,
    actions: [
      { action: "open", title: "📈 Open App" },
      { action: "dismiss", title: "✖ Dismiss" }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click & swipe handler
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  if (event.action === "dismiss") {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
