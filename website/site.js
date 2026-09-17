/* Shared nav + footer injection and scroll reveals for the Vlumeaware site. */
(function () {
  var pages = [
    { href: "index.html", label: "Home" },
    { href: "how-it-works.html", label: "How it works" },
    { href: "features.html", label: "Features" },
    { href: "content-pack.html", label: "Content pack" },
    { href: "pricing.html", label: "Pricing" },
    { href: "about.html", label: "About" },
  ];
  var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (here === "") here = "index.html";

  var links = pages
    .map(function (p) {
      var on = p.href === here ? ' class="on"' : "";
      return '<a href="' + p.href + '"' + on + ">" + p.label + "</a>";
    })
    .join("");

  var navHTML =
    '<nav class="nav" id="siteNav"><div class="wrap"><div class="row">' +
    '<a class="logo" href="index.html">Vlume<b>aware</b></a>' +
    '<div class="links">' + links +
      '<a href="request-demo.html">Request a demo</a>' +
    "</div>" +
    '<div class="spacer"></div>' +
    '<a class="btn ghost" href="pricing.html">Pricing</a>' +
    '<a class="btn primary" href="request-demo.html">Request a demo</a>' +
    '<button class="menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false">☰</button>' +
    "</div></div></nav>";

  var year = new Date().getFullYear();
  var footHTML =
    "<footer><div class=\"wrap\"><div class=\"cols\">" +
    '<div><a class="logo" href="index.html">Vlume<b>aware</b></a>' +
    '<p style="margin-top:14px;max-width:34ch;color:#8D9E96">Phishing simulation and security awareness for Nigerian teams — measure who clicks, then fix it. A Vlumetech product.</p></div>' +
    '<div><h4>Product</h4><a href="how-it-works.html">How it works</a><a href="features.html">Features</a><a href="content-pack.html">ISO 27001 content</a><a href="pricing.html">Pricing</a></div>' +
    '<div><h4>Company</h4><a href="about.html">About</a><a href="request-demo.html">Request a demo</a><a href="mailto:info@vlumetech.com.ng">info@vlumetech.com.ng</a></div>' +
    '<div><h4>Compliance</h4><a href="features.html#security">Security &amp; isolation</a><a href="content-pack.html">NDPA-aware training</a></div>' +
    "</div>" +
    '<div class="base"><span>© ' + year + ' Vlumetech LTD. All rights reserved.</span>' +
    "<span>Built for the Nigerian mid-market · Lagos · Abuja · Kaduna</span></div>" +
    "</div></footer>";

  document.querySelectorAll(".nav-mount").forEach(function (el) { el.outerHTML = navHTML; });
  document.querySelectorAll(".footer-mount").forEach(function (el) { el.outerHTML = footHTML; });

  // mobile menu toggle
  var nav = document.getElementById("siteNav");
  var mb = document.getElementById("menuBtn");
  if (nav && mb) {
    mb.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      mb.setAttribute("aria-expanded", String(open));
      mb.textContent = open ? "✕" : "☰";
    });
    nav.querySelectorAll(".links a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        mb.setAttribute("aria-expanded", "false");
        mb.textContent = "☰";
      });
    });
  }

  // scroll reveal
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    },
    { rootMargin: "0px 0px -8% 0px" }
  );
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
})();
