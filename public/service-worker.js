// ==========================================
// AI TRADING ASSISTANT SERVICE WORKER
// ==========================================

self.addEventListener("push", function (event) {

    if (!event.data) {
        return;
    }

    let data;

    try {

        data =
            event.data.json();

    } catch (error) {

        data = {

            title:
                "🔔 AI Trading Assistant",

            body:
                event.data.text()

        };

    }


    const title =
        data.title ||
        "🔔 AI Trading Assistant";


    const options = {

        body:
            data.body ||
            "New BTC/USD trading alert.",

        icon:
            "/icon-192.png",

        badge:
            "/icon-192.png",

        tag:
            data.type ||
            "AI-TRADING",

        renotify:
            true,

        data:
            data

    };


    event.waitUntil(

        self.registration.showNotification(
            title,
            options
        )

    );

});


// ==========================================
// NOTIFICATION CLICK
// ==========================================

self.addEventListener(
    "notificationclick",
    function (event) {

        event.notification.close();


        event.waitUntil(

            clients.matchAll({

                type:
                    "window",

                includeUncontrolled:
                    true

            }).then(
                function (clientList) {

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

                }
            )

        );

    }
);
