/*!
 * prayer-engine.js — lightweight offline prayer-time calculator (vanilla JS, no dependencies)
 *
 * STATUS: EXPERIMENTAL / ESTIMATES ONLY.
 * Parameters are fitted empirically to the Al-Huda Hannover 2026 timetable. The mosque's actual
 * calculation method is NOT known. Every result carries `estimated: true` and a label that must be
 * shown to users. Official published times always take precedence (see getDayTimes()).
 *
 * Works in browsers (window.PrayerEngine), Web Workers / service workers (self.PrayerEngine),
 * and Node (module.exports). No network, no Intl required (EU DST rule is implemented directly).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrayerEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  var PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

  /** Defaults = starting point only. Overwrite with calibrated values (see calibration-result.json). */
  var DEFAULTS = {
    latitude: 52.3759,          // Hannover (decimal degrees, N+)
    longitude: 9.7320,          // Hannover (decimal degrees, E+)
    elevation: 0,               // metres; >0 lowers the sunrise/sunset altitude slightly
    timezone: 'Europe/Berlin',  // only Europe/Berlin (EU DST rule) is implemented, on purpose
    fajrAngle: 18,              // degrees below horizon
    ishaAngle: 17,              // used when ishaMode === 'angle'
    ishaMode: 'angle',          // 'angle' | 'minutes' (minutes after Maghrib, see ishaMinutes)
    ishaMinutes: 90,
    sunriseAngle: 0.833,        // degrees below horizon (refraction + solar radius)
    maghribAngle: 0.833,        // degrees below horizon for sunset
    asrFactor: 1,               // 1 = Shafi'i/Maliki/Hanbali (shadow = object length), 2 = Hanafi
    highLatMethod: 'angleBased',// 'none' | 'angleBased' | 'middleOfNight' | 'oneSeventh'
    offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }, // minutes, added last
    rounding: 'nearest',        // 'nearest'|'floor'|'ceil'|'none' or per-prayer object {fajr:'floor',...}
    format: 'HH:MM'
  };

  // ---------- small helpers ----------
  function merge(base, over) {
    var out = {}, k;
    for (k in base) out[k] = base[k];
    if (over) for (k in over) {
      if (k === 'offsets' && over.offsets) { out.offsets = merge(base.offsets, over.offsets); }
      else out[k] = over[k];
    }
    return out;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new Error('Date must be YYYY-MM-DD, got: ' + s);
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function toISO(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  // Julian Day (UT) for civil date at 00:00 UTC
  function julianDay(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  // ---------- astronomy (NOAA / Meeus low-precision, ~0.01° accuracy) ----------
  function sunAt(jd) {
    var T = (jd - 2451545.0) / 36525.0;
    var L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var Mr = M * RAD;
    var C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
            Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
    var trueLon = L0 + C;
    var omega = 125.04 - 1934.136 * T;
    var lambda = trueLon - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    var eps = eps0 + 0.00256 * Math.cos(omega * RAD);
    var dec = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
    var y = Math.pow(Math.tan(eps * RAD / 2), 2);
    var L0r = L0 * RAD;
    var eot = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) +
              4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
              0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr)); // minutes
    return { dec: dec, eot: eot };
  }

  /** Solar transit as minutes after 00:00 UTC of the given civil date (iterated once for accuracy). */
  function transitUTC(jd0, lon) {
    var t = 720 - 4 * lon;
    for (var i = 0; i < 3; i++) { var s = sunAt(jd0 + t / 1440); t = 720 - 4 * lon - s.eot; }
    return t;
  }

  /** Hour angle (degrees) where the sun is at altitude alt (deg), or NaN if never reached. */
  function hourAngle(alt, lat, dec) {
    var c = (Math.sin(alt * RAD) - Math.sin(lat * RAD) * Math.sin(dec * RAD)) /
            (Math.cos(lat * RAD) * Math.cos(dec * RAD));
    if (c > 1 || c < -1) return NaN;
    return Math.acos(c) * DEG;
  }

  /** Event time (min after 00:00 UTC of jd0) for the sun at altitude alt; sign -1 = morning, +1 = evening. */
  function eventUTC(jd0, lat, lon, alt, sign) {
    var tr = transitUTC(jd0, lon), t = tr, H = NaN;
    for (var i = 0; i < 3; i++) {
      var s = sunAt(jd0 + t / 1440);
      H = hourAngle(alt, lat, s.dec);
      if (isNaN(H)) return NaN;
      t = tr + sign * H * 4;
    }
    return t;
  }

  function asrAltitude(lat, dec, factor) {
    var z = Math.abs(lat - dec);
    return Math.atan(1 / (factor + Math.tan(z * RAD))) * DEG;
  }

  // ---------- EU daylight-saving time (valid 1996+; Europe/Berlin = CET/CEST) ----------
  function lastSundayUTC(y, month) { // returns Date.UTC ms of 01:00 UTC on last Sunday of month (1-based)
    var last = new Date(Date.UTC(y, month, 0)); // last day of month
    var dow = last.getUTCDay();
    var day = last.getUTCDate() - dow;
    return Date.UTC(y, month - 1, day, 1, 0, 0);
  }
  /** UTC offset in minutes (60 or 120) for a UTC instant given in ms. */
  function berlinOffsetAtUTC(ms) {
    var y = new Date(ms).getUTCFullYear();
    return (ms >= lastSundayUTC(y, 3) && ms < lastSundayUTC(y, 10)) ? 120 : 60;
  }

  // ---------- rounding ----------
  function roundMin(v, mode) {
    if (isNaN(v)) return v;
    if (mode === 'floor') return Math.floor(v + 1e-9);
    if (mode === 'ceil') return Math.ceil(v - 1e-9);
    if (mode === 'none') return v;
    return Math.floor(v + 0.5 + 1e-9);
  }
  function modeFor(cfg, name) {
    return (cfg.rounding && typeof cfg.rounding === 'object') ? (cfg.rounding[name] || 'nearest') : cfg.rounding;
  }
  function fmt(minutes) {
    if (isNaN(minutes)) return null;
    var m = Math.round(minutes); var d = 0;
    while (m < 0) { m += 1440; d--; } while (m >= 1440) { m -= 1440; d++; }
    return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  }

  // ---------- core: raw (unrounded) times as UTC minutes ----------
  function rawUTC(y, m, d, cfg) {
    var jd0 = julianDay(y, m, d), lat = cfg.latitude, lon = cfg.longitude;
    var elevDip = cfg.elevation > 0 ? 0.0347 * Math.sqrt(cfg.elevation) : 0;
    var tr = transitUTC(jd0, lon);
    var sNoon = sunAt(jd0 + tr / 1440);
    var out = { dhuhr: tr }, flags = { fajrFallback: false, ishaFallback: false };
    out.flags = flags;
    out.sunrise = eventUTC(jd0, lat, lon, -(cfg.sunriseAngle + elevDip), -1);
    out.maghrib = eventUTC(jd0, lat, lon, -(cfg.maghribAngle + elevDip), +1);
    out.asr = eventUTC(jd0, lat, lon, asrAltitude(lat, sNoon.dec, cfg.asrFactor), +1);
    out.fajr = eventUTC(jd0, lat, lon, -cfg.fajrAngle, -1);
    out.isha = cfg.ishaMode === 'minutes' ? out.maghrib + cfg.ishaMinutes
                                          : eventUTC(jd0, lat, lon, -cfg.ishaAngle, +1);

    // High-latitude handling: needs the night length (today's sunset -> tomorrow's sunrise)
    if (cfg.highLatMethod !== 'none') {
      var nextSunrise = eventUTC(jd0 + 1, lat, lon, -(cfg.sunriseAngle + elevDip), -1);
      var night = (nextSunrise + 1440) - out.maghrib;
      if (!isNaN(night)) {
        var portion = function (angle) {
          if (cfg.highLatMethod === 'middleOfNight') return night / 2;
          if (cfg.highLatMethod === 'oneSeventh') return night / 7;
          return night * angle / 60; // angleBased
        };
        var fp = portion(cfg.fajrAngle);
        // Fajr is measured back from sunrise of the *same* day; night length ~ yesterday's night, fine at this precision
        if (isNaN(out.fajr) || (out.sunrise - out.fajr) > fp) { out.fajr = out.sunrise - fp; flags.fajrFallback = true; }
        if (cfg.ishaMode === 'angle') {
          var ip = portion(cfg.ishaAngle);
          if (isNaN(out.isha) || (out.isha - out.maghrib) > ip) { out.isha = out.maghrib + ip; flags.ishaFallback = true; }
        }
      }
    }
    return out;
  }

  /**
   * Calculate prayer times for one civil date.
   * @param {string} isoDate 'YYYY-MM-DD'
   * @param {object} [options] overrides for DEFAULTS
   * @returns {{date, times:{fajr..isha:'HH:MM'|null}, minutes:{...}, raw:{...}, utcOffsetMinutes, estimated:true, label, config}}
   */
  function calculate(isoDate, options) {
    var cfg = merge(DEFAULTS, options);
    var p = parseISO(isoDate);
    var raw = rawUTC(p.y, p.m, p.d, cfg);
    // Timetable convention verified on the 2026 data: one UTC offset applies to the WHOLE civil day,
    // taken at local noon (so on 2026-03-29 and 2026-10-25 all six times use the new offset).
    var offset = berlinOffsetAtUTC(Date.UTC(p.y, p.m - 1, p.d, 11, 0, 0)); // 11:00 UTC is after any same-day transition (01:00 UTC)
    var minutes = {}, times = {}, rawLocal = {};
    PRAYERS.forEach(function (k) {
      var local = raw[k] + offset;                             // local minutes after midnight (unrounded)
      rawLocal[k] = local;
      var v = roundMin(local + (cfg.offsets[k] || 0), modeFor(cfg, k));
      minutes[k] = v;
      times[k] = fmt(v);
    });
    return {
      date: isoDate, times: times, minutes: minutes, raw: rawLocal, utcOffsetMinutes: offset,
      highLatitudeFallback: { fajr: raw.flags.fajrFallback, isha: raw.flags.ishaFallback },
      estimated: true,
      label: 'Estimated (calculated, not verified against the mosque\'s method)',
      config: cfg
    };
  }

  /**
   * Preferred entry point for the app: official data wins, otherwise a clearly-labelled estimate.
   * @param {string} isoDate
   * @param {Array|Object} official  array of {date,fajr,...} rows OR {times:[...]} (your prayer-times.json)
   * @param {object} [options]
   */
  function getDayTimes(isoDate, official, options) {
    var rows = Array.isArray(official) ? official : (official && official.times) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].date === isoDate) {
        var t = {}; PRAYERS.forEach(function (k) { t[k] = rows[i][k]; });
        return { date: isoDate, times: t, source: 'official', estimated: false, label: 'Official timetable (Al-Huda Hannover)' };
      }
    }
    var c = calculate(isoDate, options);
    return { date: isoDate, times: c.times, source: 'calculated', estimated: true, label: c.label };
  }

  /** Empirical fit to the Al-Huda Hannover 2026 timetable (see out/calibration-report.md). NOT the mosque's documented method. */
  var PRESETS = {
    hannoverAlHudaFit2026: {
      fajrAngle: 18, ishaAngle: 17, ishaMode: 'angle', sunriseAngle: 0.833, maghribAngle: 0.833,
      asrFactor: 1, highLatMethod: 'angleBased', rounding: 'nearest',
      offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 2, isha: 0 }
    }
  };

  return {
    PRAYERS: PRAYERS, DEFAULTS: DEFAULTS, PRESETS: PRESETS, calculate: calculate, getDayTimes: getDayTimes,
    // exposed for tests / calibration tooling
    _internal: { sunAt: sunAt, julianDay: julianDay, berlinOffsetAtUTC: berlinOffsetAtUTC, rawUTC: rawUTC, merge: merge, roundMin: roundMin }
  };
});