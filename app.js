
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const TIME_ZONE = "Europe/Berlin";
    const DATA_URL = "./prayer-times.json";

    const PRESET = window.PrayerEngine?.PRESETS?.hannoverAlHudaFit2026;

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
    const nextHeading = $("next-prayer-heading");
    const nextTime = $("next-prayer-time");
    const countdown = $("countdown-timer");
    const nextLabel = $("next-prayer-label");
    const scheduleDate = $("schedule-date");

    let timetable = [];
    let selectedDate = "";
    let intervalId = null;

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
        if (!message) return;
        message.textContent = text;
        message.classList.toggle("error-message", error);
    }

    /*
     * Official data always wins.
     * An existing but incomplete official record is unavailable;
     * it must not silently fall back to calculated values.
     */
    function getDay(key) {
        const officialRecord = findRecord(key);

        if (officialRecord && !isComplete(officialRecord)) {
            return {
                date: key,
                source: "unavailable",
                estimated: false,
                label: "Official timetable record is incomplete.",
                times: null
            };
        }

        if (!window.PrayerEngine || !PRESET) {
            if (!officialRecord) {
                return {
                    date: key,
                    source: "unavailable",
                    estimated: false,
                    label: "Calculation engine is unavailable.",
                    times: null
                };
            }
        }

        try {
            const result = window.PrayerEngine.getDayTimes(
                key,
                timetable,
                PRESET
            );

            if (!result || !result.times || !isComplete(result.times)) {
                return {
                    date: key,
                    source: "unavailable",
                    estimated: false,
                    label: "Required prayer times are unavailable.",
                    times: null
                };
            }

            return result;
        } catch (error) {
            console.error(`Unable to resolve timetable for ${key}:`, error);

            return {
                date: key,
                source: "unavailable",
                estimated: false,
                label: "Prayer times could not be calculated.",
                times: null
            };
        }
    }

    /*
     * Resolve a Berlin wall-clock time to an instant.
     * Reject nonexistent local times during the spring DST transition.
     */
    function berlinInstant(key, time) {
        const [year, month, day] = key.split("-").map(Number);
        const [hour, minute] = time.split(":").map(Number);
        const target = Date.UTC(year, month - 1, day, hour, minute);
        let guess = target;

        const formatter = new Intl.DateTimeFormat("en-GB", {
            timeZone: TIME_ZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23"
        });

        for (let i = 0; i < 6; i++) {
            const parts = Object.fromEntries(
                formatter.formatToParts(new Date(guess))
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

        const check = Object.fromEntries(
            new Intl.DateTimeFormat("en-GB", {
                timeZone: TIME_ZONE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23"
            }).formatToParts(new Date(guess))
                .map(part => [part.type, part.value])
        );

        if (
            Number(check.year) !== year ||
            Number(check.month) !== month ||
            Number(check.day) !== day ||
            Number(check.hour) !== hour ||
            Number(check.minute) !== minute
        ) {
            throw new Error(
                `The local time ${key} ${time} is invalid in ${TIME_ZONE}.`
            );
        }

        return new Date(guess);
    }

    function addSourceNotice(parent, day) {
        const notice = document.createElement("p");
        notice.className = day.estimated
            ? "estimate-notice"
            : "official-notice";

        if (day.estimated) {
            notice.textContent =
                "ESTIMATE — Calculated times; not confirmed by Al-Huda. " ;

            const link = document.createElement("a");
            link.href = "https://alhuda-hannover.de/";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "Check the official timetable";

            notice.appendChild(link);
        } else {
            notice.textContent = "Official timetable · Al-Huda Hannover";
        }

        parent.appendChild(notice);
    }

    function renderSchedule(key) {
        const day = getDay(key);

        dateDisplay.textContent = formatDate(key);

        if (scheduleDate) scheduleDate.textContent = key;

        container.replaceChildren();

        if (!day.times) {
            const error = document.createElement("p");
            error.className = "error-message";
            error.textContent =
                "Prayer times are unavailable for this date. Check the timetable or calculation engine.";
            container.appendChild(error);
            return;
        }

        addSourceNotice(container, day);

        for (const prayer of PRAYERS) {
            const card = document.createElement("div");
            card.className = "prayer-card";
            card.dataset.prayer = prayer.key;

            const name = document.createElement("span");
            name.className = "prayer-name";
            name.textContent = prayer.name;

            const time = document.createElement("span");
            time.className = "time-display";
            time.textContent = day.times[prayer.key];

            card.append(name, time);
            container.appendChild(card);
        }
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

    function renderCountdown() {
        if (!nextHeading || !nextTime || !countdown || !nextLabel) {
            showMessage("Countdown UI is missing from index.html.", true);
            return;
        }

        const now = new Date();
        const todayKey = dateKey(now);
        const today = getDay(todayKey);

        function unavailable(text) {
            nextLabel.textContent = "UPCOMING PRAYER";
            nextHeading.textContent = "Unavailable";
            nextTime.textContent = "--:--";
            countdown.textContent = "--:--:--";
            showMessage(text, true);
            highlightNext(null);
        }

        if (!today.times) {
            unavailable(today.label);
            return;
        }

        const candidates = [];

        for (const prayer of PRAYERS) {
            try {
                candidates.push({
                    ...prayer,
                    date: todayKey,
                    instant: berlinInstant(todayKey, today.times[prayer.key]),
                    estimated: today.estimated
                });
            } catch (error) {
                console.error(error);
                unavailable("A prayer time cannot be resolved in Europe/Berlin.");
                return;
            }
        }

        const tomorrowKey = addDays(todayKey, 1);
        const tomorrow = getDay(tomorrowKey);

        /*
         * Do not invent tomorrow's Fajr if an official record exists
         * but is incomplete. A wholly absent date may use an estimate.
         */
        if (tomorrow.times && isValidTime(tomorrow.times.fajr)) {
            try {
                candidates.push({
                    name: "Fajr",
                    key: "fajr",
                    date: tomorrowKey,
                    instant: berlinInstant(tomorrowKey, tomorrow.times.fajr),
                    estimated: tomorrow.estimated
                });
            } catch (error) {
                console.error(error);
                unavailable("Tomorrow's Fajr time is invalid.");
                return;
            }
        }

        const next = candidates
            .filter(prayer => prayer.instant.getTime() > now.getTime())
            .sort((a, b) => a.instant - b.instant)[0];

        if (!next) {
            unavailable("The next prayer time is unavailable. Check the timetable.");
            return;
        }

        nextLabel.textContent = next.estimated
            ? "NEXT PRAYER · ESTIMATE"
            : "NEXT PRAYER";

        nextHeading.textContent = next.name;

        nextTime.textContent =
            `${next.date === todayKey ? "Today" : "Tomorrow"} · ` +
            next.instant.toLocaleTimeString("en-GB", {
                timeZone: TIME_ZONE,
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23"
            });

        const seconds = Math.max(
            0,
            Math.floor((next.instant.getTime() - now.getTime()) / 1000)
        );

        countdown.textContent = [
            String(Math.floor(seconds / 3600)).padStart(2, "0"),
            String(Math.floor((seconds % 3600) / 60)).padStart(2, "0"),
            String(seconds % 60).padStart(2, "0")
        ].join(":");

        showMessage(
            next.estimated
                ? "Estimated countdown. Check Al-Huda's official timetable."
                : `Time remaining until ${next.name}.`
        );

        highlightNext(next);
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
        if (yearCopy) yearCopy.textContent = dateKey().slice(0, 4);

        selectedDate = dateKey();

        try {
            if (!window.PrayerEngine) {
                throw new Error(
                    "prayer-engine.js did not load. Check its script path and order."
                );
            }

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
                if (
                    !record ||
                    typeof record.date !== "string" ||
                    !/^\d{4}-\d{2}-\d{2}$/.test(record.date)
                ) {
                    throw new Error("A timetable record has an invalid date.");
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
            console.error("Failed to initialise prayer timetable:", error);

            container.textContent = "Unable to load the prayer timetable.";

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
