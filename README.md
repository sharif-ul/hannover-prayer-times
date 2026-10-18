# hannover-prayer-times
Hannover Prayer Times 🌙

A lightweight, installable Progressive Web App (PWA) for viewing daily Islamic prayer times in Hannover, Germany.

The app displays the daily prayer schedule and a live countdown to the next prayer. It is designed to work on mobile phones, tablets, and desktop computers, including offline after the first successful online visit.

Features
🕌 Daily prayer times for Hannover, Germany.
🕒 Live countdown to the next prayer.
📅 View today's or another day's prayer schedule.
🌿 Simple, responsive interface with an Islamic-inspired design.
📱 Installable on Android and iPhone.
📶 Offline access using a service worker.
🔒 No accounts, tracking, advertisements, or external APIs.
💚 Free static hosting with GitHub Pages.
Prayer Times and Data Accuracy

The file prayer-times.json contains the official prayer timetable extracted from the Al-Huda Hannover reference timetable.

Official published values take precedence over calculated values. The original timetable should be preserved without modification when adding future official records.

The app also includes prayer-engine.js, an experimental, locally running calculation engine that estimates prayer times for dates not covered by the official timetable.

Important: Calculated times are estimates fitted to the 2026 reference timetable. They are not confirmed to use Al-Huda's official calculation method. Always verify important prayer times against the mosque's published timetable.

Reference: Al-Huda Hannover

Technology

This project uses simple web technologies:

HTML5 — page structure
CSS3 — styling and responsive layout
Vanilla JavaScript — application logic and countdown
JSON — annual prayer timetable
Web App Manifest — installation metadata
Service Worker — offline caching
GitHub Pages — free HTTPS hosting

No backend, database, paid service, or JavaScript framework is required.

Project Structure
hannover-prayer-times/
├── index.html
├── styles.css
├── app.js
├── prayer-times.json
├── prayer-engine.js
├── manifest.json
├── service-worker.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md

Run Locally
Clone or download this repository.
Open a terminal in the project directory.
Start a local development server, for example:
python -m http.server 8000

Open http://localhost:8000 in your browser.

Opening index.html directly using a file:// URL is not recommended because fetching JSON and registering service workers require an appropriate local web server.

Deploy with GitHub Pages
Create a public GitHub repository named hannover-prayer-times.
Upload the project files, preserving the folder structure.
Open the repository's Settings → Pages.
Select Deploy from a branch.
Choose the main branch and / (root) folder, then save.
Wait for deployment to finish.

The website will normally be available at:

https://YOUR-USERNAME.github.io/hannover-prayer-times/

Replace YOUR-USERNAME with your GitHub username.

Install on a Phone
Android
Open the published HTTPS website in Chrome.
Open the browser menu.
Select Install app or Add to Home screen, depending on the browser.
Launch the app from your home screen.
iPhone
Open the published HTTPS website in Safari.
Tap the Share button.
Select Add to Home Screen.
Tap Add and open the app from your home screen.
Offline Support

The service worker caches the application files and timetable for offline use after a successful online visit.

To test offline functionality:

Open the website while connected to the internet.
Wait for the page and timetable to load.
Disconnect from the internet or enable airplane mode.
Reopen the app and verify that the timetable and countdown still work.

When publishing changes, update the cache version in service-worker.js so the new files can be installed and cached.

Updating the Timetable

When Al-Huda publishes a new official timetable:

Extract and verify its dates and prayer times.
Add the validated records to prayer-times.json using the existing schema.
Preserve the original official values and conventions.
Commit and push the updated file to GitHub.
Increment the service worker's cache version.
Test the updated app online and offline.

Official records should always take priority over calculated estimates.

Limitations
Calculated prayer times are experimental estimates, not official mosque times.
The calculation method may differ from Al-Huda's actual method.
Offline availability depends on the application having been cached successfully beforehand.
This app does not provide push notifications, alarms, audio playback, or reminders.
The app is intended for personal use and does not replace the mosque's official timetable.
Privacy

The app does not require user accounts and does not intentionally collect personal information. It does not use analytics, advertising, or external prayer-time APIs.

License

Choose a license before distributing or reusing this project. If you want others to reuse and modify the source code, consider the MIT License.