self.addEventListener("push", function (event) {

    if (!event.data) {
        return;
    }

    let data;

    try {
        data = event.data.json();
    } catch (error) {
        data = {
            title: "🔔 AI Trading Assistant",
            body: event.data.text()
        };
    }

    const title =
        data.title ||
        "🔔 AI Trading Assistant";

    const options = {

        body:
            data.body ||
            "New trading alert",

        icon:
            "/icon.png",

        badge:
            "/icon.png",

        data:
            data,

        requireInteraction:
            true,

        vibrate: [
            200,
            100,
            200,
            100,
            400
        ]

    };

    event.waitUntil(
        self.registration.showNotification(
            title,
            options
        )
    );

});


self.addEventListener(
    "notificationclick",
    function (event) {

        event.notification.close();

        event.waitUntil(

            clients.matchAll({
                type: "window",
                includeUncontrolled: true
            }).then(function (clientList) {

                for (
                    const client of clientList
                ) {

                    if (
                        "focus" in client
                    ) {

                        return client.focus();

                    }

                }

                if (
                    clients.openWindow
                ) {

                    return clients.openWindow(
                        "/"
                    );

                }

            })

        );

    }
);
