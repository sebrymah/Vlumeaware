/*
 * Regional pricing.
 *
 * One config drives every price on the site. Two published bands, because
 * more bands is more to maintain and more to argue about, and there is no
 * sales data yet to justify finer distinctions.
 *
 * Detection chooses what a visitor is SHOWN. It must not be what they are
 * CHARGED: bind the contract to billing address or company registration at
 * checkout, or a VPN becomes a standing discount.
 */
(function () {
  'use strict';

  var BANDS = {
    standard: {
      label: 'US, UK, EU & other high-income markets',
      short: 'Standard',
      currency: 'USD',
      tiers: { starter: '$69', growth: '$199', business: '$449' },
      start: '$69',
    },
    emerging: {
      label: 'Africa, South Asia, Latin America & other emerging markets',
      short: 'Emerging markets',
      currency: 'USD',
      tiers: { starter: '$25', growth: '$79', business: '$179' },
      start: '$25',
    },
  };

  /*
   * An unrecognised visitor is shown the standard rate. Getting it wrong that
   * way costs a conversation; the other way around hands the lower price to
   * anyone behind a VPN. The selector below fixes either case in one click.
   */
  var FALLBACK = 'standard';
  var STORAGE_KEY = 'vlumeaware.priceBand';

  // Timezones in the standard band. Zone data ships with the browser, needs no
  // network call, and cannot be blocked the way an IP lookup can.
  var STANDARD_ZONES = {
    'America/New_York': 1, 'America/Detroit': 1, 'America/Chicago': 1, 'America/Denver': 1,
    'America/Phoenix': 1, 'America/Los_Angeles': 1, 'America/Anchorage': 1, 'Pacific/Honolulu': 1,
    'America/Toronto': 1, 'America/Vancouver': 1, 'America/Edmonton': 1, 'America/Winnipeg': 1,
    'America/Halifax': 1, 'America/St_Johns': 1,
    'Asia/Tokyo': 1, 'Asia/Seoul': 1, 'Asia/Singapore': 1, 'Asia/Hong_Kong': 1,
    'Asia/Dubai': 1, 'Asia/Qatar': 1, 'Asia/Riyadh': 1, 'Asia/Kuwait': 1,
    'Asia/Bahrain': 1, 'Asia/Muscat': 1, 'Asia/Jerusalem': 1,
    'Pacific/Auckland': 1,
  };
  var STANDARD_PREFIXES = ['Europe/', 'Australia/', 'Atlantic/Reykjavik'];

  function detectBand() {
    var zone = '';
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
      return FALLBACK;
    }
    if (STANDARD_ZONES[zone]) return 'standard';
    for (var i = 0; i < STANDARD_PREFIXES.length; i++) {
      if (zone.indexOf(STANDARD_PREFIXES[i]) === 0) return 'standard';
    }
    return zone ? 'emerging' : FALLBACK;
  }

  function stored() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return BANDS[v] ? v : null;
    } catch (e) {
      return null;
    }
  }

  function remember(band) {
    try {
      window.localStorage.setItem(STORAGE_KEY, band);
    } catch (e) {
      /* private browsing; the choice just will not persist */
    }
  }

  function fromQuery() {
    var match = /[?&]region=(standard|emerging)/.exec(window.location.search);
    return match ? match[1] : null;
  }

  // A sales link wins, then an explicit choice, then detection.
  var active = fromQuery() || stored() || detectBand();

  function render() {
    var band = BANDS[active];

    document.querySelectorAll('[data-price]').forEach(function (el) {
      var value = band.tiers[el.getAttribute('data-price')];
      if (value) el.firstChild ? (el.firstChild.nodeValue = value) : (el.textContent = value);
    });
    document.querySelectorAll('[data-price-start]').forEach(function (el) {
      el.textContent = band.start;
    });
    document.querySelectorAll('[data-band-label]').forEach(function (el) {
      el.textContent = band.label;
    });

    var select = document.getElementById('band-select');
    if (select) select.value = active;
  }

  function mountSelector() {
    var mount = document.querySelector('[data-band-selector]');
    if (!mount) return;
    mount.innerHTML =
      '<label style="display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--muted)">' +
      'Showing prices for ' +
      '<select id="band-select" style="font:inherit;color:var(--ink);background:#fff;border:1px solid #D7E0DB;' +
      'border-radius:8px;padding:6px 10px">' +
      '<option value="standard">' + BANDS.standard.short + '</option>' +
      '<option value="emerging">' + BANDS.emerging.short + '</option>' +
      '</select></label>';
    mount.querySelector('#band-select').addEventListener('change', function (e) {
      active = e.target.value;
      remember(active);
      render();
    });
  }

  function start() {
    mountSelector();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
