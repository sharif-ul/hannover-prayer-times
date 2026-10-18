
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const TIME_ZONE = "Europe/Berlin";
    const DATA_URL = "./prayer-times.json";

    const PRAYERS = [
        { name: "Fajr", key: "fajr" },
        { name: "Dhuhr", key: "dhuhr" },
        { name: "Asr", key: "asr" },
        { name: "Maghrib", key: "maghrib" },
        { name: "Isha", key: "isha" }
    ];

    const $ = id => document.getElementById(id);

    const container = $("prayer-times-container");
    const dateDisplay = $("date-display");
    const message = $("countdown-message");
    const switcher = $("date-switcher-button");
    const yearCopy = $("year-copy");

    // These elements are used by the updated countdown UI.
    const nextHeading = $("next-prayer-heading");
    const nextTime = $("next-prayer-time");
    const countdown = $("countdown-timer");
    const nextLabel = $("next-prayer-label");
    const scheduleDate = $("schedule-date");

    let timetable = [];
    let selectedDate = "";
    let intervalId;

    const dateFormatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

    function dateKey(date = new Date()) {
        const parts = Object.fromEntries(
            dateFormatter.formatToParts(date)
                .map(part => [part.type, part.value])
        );

        return `${parts.year}-${parts.month}-${parts.day}`;
    }

    function addDays(key, amount) {
        const [year, month, day] = key.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day + amount));

        return [
            date.getUTCFullYear(),
            String(date.getUTCMonth() + 1).padStart(2, "0"),
            String(date.getUTCDate()).padStart(2, "0")
        ].join("-");
    }

    function formatDate(key) {
        const [year, month, day] = key.split("-").map(Number);

        return new Intl.DateTimeFormat("en-GB", {
            timeZone: "UTC",
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(new Date(Date.UTC(year, month - 1, day, 12)));
    }

    function findRecord(key) {
        return timetable.find(record => record.date === key);
    }

    function isValidTime(value) {
        return typeof value === "string" &&
            /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    }

    function isComplete(record) {
        return Boolean(record) &&
            PRAYERS.every(prayer => isValidTime(record[prayer.key]));
    }

    function showMessage(text, error = false) {
        message.textContent = text;
        message.classList.toggle("error-message", error);
    }

    /*
     * Convert a Europe/Berlin wall-clock date and time to an instant.
     * No fixed UTC offset is assumed.
     *
     * Times that fall inside a daylight-saving clock gap are rejected.
     * Ambiguous times during the autumn clock change need confirmation
     * if the source timetable specifies a time in that repeated hour.
     */
    function berlinInstant(key, time) {
        const [year, month, day] = key.split("-").map(Number);
        const [hour, minute] = time.split(":").map(Number);

        const target = Date.UTC(year, month - 1, day, hour, minute);
        let guess = target;

        for (let i = 0; i < 6; i++) {
            const parts = Object.fromEntries(
                new Intl.DateTimeFormat("en-GB", {
                    timeZone: TIME_ZONE,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hourCycle: "h23"
                }).formatToParts(new Date(guess))
                    .map(part => [part.type, part.value])
            );

            const represented = Date.UTC(
                Number(parts.year),
                Number(parts.month) - 1,
                Number(parts.day),
                Number(parts.hour),
                Number(parts.minute),
                Number(parts.second)
            );

            const difference = target - represented;
            guess += difference;

            if (difference === 0) break;
        }

        const result = new Date(guess);

        // Verify the requested wall-clock time actually exists.
        const check = new Intl.DateTimeFormat("en-GB", {
            timeZone: TIME_ZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(result);

        const parts = Object.fromEntries(
            check.map(part => [part.type, part.value])
        );

        if (
            Number(parts.year) !== year ||
            Number(parts.month) !== month ||
            Number(parts.day) !== day ||
            Number(parts.hour) !== hour ||
            Number(parts.minute) !== minute
        ) {
            throw new Error(
                `The local time ${key} ${time} is not valid in ${TIME_ZONE}.`
            );
        }

        return result;
    }

    function renderSchedule(key) {
        const record = findRecord(key);

        dateDisplay.textContent = formatDate(key);

        if (scheduleDate) {
            scheduleDate.textContent = key;
        }

        container.replaceChildren();

        if (!record) {
            const error = document.createElement("p");
            error.className = "error-message";
            error.textContent =
                "Prayer times are not available for this date.";
            container.appendChild(error);
            return;
        }

        for (const prayer of PRAYERS) {
            const card = document.createElement("div");
            card.className = "prayer-card";
            card.dataset.prayer = prayer.key;

            const name = document.createElement("span");
            name.className = "prayer-name";
            name.textContent = prayer.name;

            const time = document.createElement("span");
            time.className = "time-display";
            time.textContent = isValidTime(record[prayer.key])
                ? record[prayer.key]
                : "Unavailable";

            card.append(name, time);
            container.appendChild(card);
        }
    }

    function renderCountdown() {
        if (!nextHeading || !nextTime || !countdown || !nextLabel) {
            showMessage(
                "Countdown UI is missing from index.html.",
                true
            );
            return;
        }

        const now = new Date();
        const todayKey = dateKey(now);
        const today = findRecord(todayKey);

        if (!isComplete(today)) {
            nextLabel.textContent = "UPCOMING PRAYER";
            nextHeading.textContent = "Unavailable";
            nextTime.textContent = "--:--";
            countdown.textContent = "--:--:--";

            showMessage(
                "Today's timetable is missing or has invalid prayer times.",
                true
            );
            highlightNext(null);
            return;
        }

        const candidates = [];

        for (const prayer of PRAYERS) {
            try {
                candidates.push({
                    ...prayer,
                    date: todayKey,
                    instant: berlinInstant(todayKey, today[prayer.key])
                });
            } catch (error) {
                console.error(error);
                nextHeading.textContent = "Unavailable";
                countdown.textContent = "--:--:--";
                showMessage(
                    "A prayer time cannot be resolved in Europe/Berlin.",
                    true
                );
                highlightNext(null);
                return;
            }
        }

        const tomorrowKey = addDays(todayKey, 1);
        const tomorrow = findRecord(tomorrowKey);

        if (tomorrow && isValidTime(tomorrow.fajr)) {
            try {
                candidates.push({
                    name: "Fajr",
                    key: "fajr",
                    date: tomorrowKey,
                    instant: berlinInstant(tomorrowKey, tomorrow.fajr)
                });
            } catch (error) {
                console.error(error);
                showMessage("Tomorrow's Fajr time is invalid.", true);
                return;
            }
        }

        const next = candidates
            .filter(prayer => prayer.instant.getTime() > now.getTime())
            .sort((a, b) => a.instant - b.instant)[0];

        if (!next) {
            nextHeading.textContent = "Unavailable";
            nextTime.textContent = "--:--";
            countdown.textContent = "--:--:--";

            showMessage(
                "The next prayer time is unavailable. Check tomorrow's timetable.",
                true
            );
            highlightNext(null);
            return;
        }

        nextLabel.textContent = "NEXT PRAYER";
        nextHeading.textContent = next.name;

        nextTime.textContent =
            `${next.date === todayKey ? "Today" : "Tomorrow"} · ` +
            next.instant.toLocaleTimeString("en-GB", {
                timeZone: TIME_ZONE,
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23"
            });

        const remaining = Math.max(
            0,
            next.instant.getTime() - now.getTime()
        );

        const seconds = Math.floor(remaining / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainder = seconds % 60;

        countdown.textContent = [
            String(hours).padStart(2, "0"),
            String(minutes).padStart(2, "0"),
            String(remainder).padStart(2, "0")
        ].join(":");

        showMessage(`Time remaining until ${next.name}.`);
        highlightNext(next);
    }

    function highlightNext(next) {
        document.querySelectorAll(".prayer-card").forEach(card => {
            const active = Boolean(next) &&
                selectedDate === next.date &&
                card.dataset.prayer === next.key;

            card.classList.toggle("next-prayer", active);

            if (active) {
                card.setAttribute("aria-current", "true");
            } else {
                card.removeAttribute("aria-current");
            }
        });
    }

    function updateView() {
        renderSchedule(selectedDate);

        if (switcher) {
            switcher.textContent =
                selectedDate === dateKey() ? "View Tomorrow" : "View Today";
        }

        renderCountdown();
    }

    async function initialise() {
        if (yearCopy) {
            yearCopy.textContent = dateKey().slice(0, 4);
        }

        selectedDate = dateKey();

        try {
            const response = await fetch(DATA_URL);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            timetable = Array.isArray(data)
                ? data
                : Array.isArray(data?.times)
                    ? data.times
                    : [];

            if (!timetable.length) {
                throw new Error("Prayer timetable is empty or invalid.");
            }

            const dates = new Set();

            for (const record of timetable) {
                if (!record || typeof record.date !== "string") {
                    throw new Error("A timetable record has no valid date.");
                }

                if (dates.has(record.date)) {
                    throw new Error(`Duplicate timetable date: ${record.date}`);
                }

                dates.add(record.date);
            }

            updateView();

            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(renderCountdown, 1000);
        } catch (error) {
            console.error("Failed to load prayer timetable:", error);

            container.textContent =
                "Unable to load the prayer timetable.";

            if (nextHeading) nextHeading.textContent = "Unavailable";
            if (nextTime) nextTime.textContent = "--:--";
            if (countdown) countdown.textContent = "--:--:--";

            showMessage("Could not load prayer times.", true);
        }
    }

    if (switcher) {
        switcher.addEventListener("click", () => {
            const todayKey = dateKey();

            selectedDate = selectedDate === todayKey
                ? addDays(todayKey, 1)
                : todayKey;

            updateView();
        });
    }

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            const todayKey = dateKey();

            // Keep tomorrow selected only if it is still tomorrow.
            if (
                selectedDate !== todayKey &&
                selectedDate !== addDays(todayKey, 1)
            ) {
                selectedDate = todayKey;
            }

            updateView();
        }
    });

    window.addEventListener("pageshow", renderCountdown);

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./service-worker.js")
                .catch(error => {
                    console.error("Service worker registration failed:", error);
                });
        });
    }

    initialise();
});
