(function () {
  const $ = (s) => document.querySelector(s);
  const KNOWN = [
    ["dresses", "Dresses"],
    ["tops", "Tops"],
    ["blazers", "Blazers"],
    ["bottoms", "Trousers & Shorts"],
    ["sets", "Sets & Jumpsuits"],
    ["accessories", "Accessories"],
  ];
  let LIST = [];
  let byCode = {};

  let selected = [];
  try {
    selected = JSON.parse(localStorage.getItem("tt-selected") || "[]");
  } catch (e) {}
  const save = () => {
    try {
      localStorage.setItem("tt-selected", JSON.stringify(selected));
    } catch (e) {}
  };
  const isSel = (c) => selected.includes(c);
  const esc = (t) =>
    String(t).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );

  const waBase = "https://wa.me/" + BUSINESS.whatsapp;
  const waLink = (text) =>
    waBase + (text ? "?text=" + encodeURIComponent(text) : "");
  const money = (n) =>
    BUSINESS.currency + " " + Number(n).toLocaleString("en-US");
  const priceText = (p) => (p.price > 0 ? money(p.price) : "Ask for price");

  // ---- static contact bits
  const hello =
    "Hello " + BUSINESS.name + "! I'd like to ask about your clothes.";
  ["topWa", "heroWa", "visitWa"].forEach(
    (id) => ($("#" + id).href = waLink(hello)),
  );
  $("#vLocation").textContent = BUSINESS.location;
  $("#vMap").innerHTML = BUSINESS.mapLink
    ? '<a href="' +
      BUSINESS.mapLink +
      '" target="_blank" rel="noopener">Open in Google Maps</a>'
    : "";
  $("#vPhone").innerHTML =
    '<a href="tel:+' +
    BUSINESS.whatsapp +
    '">' +
    BUSINESS.phoneDisplay +
    "</a>";
  $("#vHours").textContent = BUSINESS.hours;
  $("#year").textContent = new Date().getFullYear();

  // ---- STOCK SOURCE: Google Sheet (published CSV) with products.js as backup
  function parseCSV(text) {
    const rows = [];
    let row = [],
      cur = "",
      q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cur += '"';
            i++;
          } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else cur += ch;
    }
    if (cur !== "" || row.length) {
      row.push(cur);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }
  function normCat(raw) {
    const t = String(raw || "").toLowerCase();
    if (/dress|gown|maxi/.test(t)) return "dresses";
    if (/blazer|jacket|coat/.test(t)) return "blazers";
    if (/trouser|short|jean|pant|skirt|bottom/.test(t)) return "bottoms";
    if (/set|jumpsuit|co-?ord|two.?piece/.test(t)) return "sets";
    if (/top|shirt|blouse|tee|tank|bodysuit/.test(t)) return "tops";
    if (/access|belt|bag|shoe|jewel/.test(t)) return "accessories";
    return t.trim() ? t.trim().replace(/[^a-z0-9]+/g, "-") : "dresses";
  }
  const isNo = (v) =>
    /^(no|n|sold|sold out|out|0|false|hide|hidden)$/i.test(
      String(v || "").trim(),
    );
  function fromSheet(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error("empty sheet");
    const head = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
    const col = (...names) => head.findIndex((h) => names.includes(h));
    const c = {
      code: col("code", "id"),
      name: col("name", "item", "product"),
      cat: col("category", "type"),
      price: col("price"),
      note: col("note", "notes", "colours", "colors", "details"),
      photos: col("photos", "photo", "images", "image"),
      stock: col("instock", "stock", "available"),
    };
    if (c.name < 0 || c.photos < 0) throw new Error("missing columns");
    const out = [];
    rows.slice(1).forEach((r, i) => {
      const get = (k) => (c[k] >= 0 ? (r[c[k]] || "").trim() : "");
      if (!get("name") || isNo(get("stock"))) return;
      const imgs = get("photos")
        .split(/[,;\n]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) =>
          /^(https?:)?\/\//.test(x) || x.startsWith("images/")
            ? x
            : "images/" + x,
        );
      if (!imgs.length) return;
      out.push({
        code: get("code") || "TT-" + String(i + 1).padStart(3, "0"),
        name: get("name"),
        category: normCat(get("cat")),
        price: Number(get("price").replace(/[^0-9.]/g, "")) || 0,
        note: get("note"),
        images: imgs,
      });
    });
    return out;
  }
  async function fetchSheet() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const sep = BUSINESS.sheetUrl.includes("?") ? "&" : "?";
      const res = await fetch(BUSINESS.sheetUrl + sep + "t=" + Date.now(), {
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      const list = fromSheet(text);
      try {
        localStorage.setItem("tt-stock-cache", JSON.stringify(list));
      } catch (e) {}
      return list;
    } finally {
      clearTimeout(timer);
    }
  }
  const backup = () =>
    typeof PRODUCTS !== "undefined" ? PRODUCTS.filter((p) => !p.hidden) : [];

  // ---- filters
  let cat = "all";
  const filters = $("#filters");
  function buildFilters() {
    filters.innerHTML = "";
    const present = [...new Set(LIST.map((p) => p.category))];
    const cats = [["all", "All"]]
      .concat(KNOWN.filter(([k]) => present.includes(k)))
      .concat(
        present
          .filter((k) => !KNOWN.some(([x]) => x === k))
          .map((k) => [
            k,
            k.replace(/-/g, " ").replace(/^./, (m) => m.toUpperCase()),
          ]),
      );
    if (!cats.some(([k]) => k === cat)) cat = "all";
    cats.forEach(([k, label]) => {
      const b = document.createElement("button");
      b.className = "chip" + (k === cat ? " on" : "");
      b.textContent = label;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", k === cat);
      b.onclick = () => {
        cat = k;
        filters.querySelectorAll(".chip").forEach((x) => {
          x.classList.toggle("on", x === b);
          x.setAttribute("aria-selected", x === b);
        });
        renderGrid();
      };
      filters.appendChild(b);
    });
  }

  // ---- grid
  const grid = $("#grid");
  function renderGrid() {
    grid.innerHTML = "";
    const shown = LIST.filter((p) => cat === "all" || p.category === cat);
    if (!shown.length) {
      grid.innerHTML =
        '<p style="grid-column:1/-1;color:var(--muted);padding:24px 0">New styles are coming soon. Message us on WhatsApp to see what just arrived.</p>';
      return;
    }
    shown.forEach((p) => {
      const card = document.createElement("article");
      card.className = "card" + (isSel(p.code) ? " sel" : "");
      card.dataset.code = p.code;
      card.innerHTML =
        '<button class="card-img" aria-label="View ' +
        esc(p.name) +
        '">' +
        '<img loading="lazy" src="' +
        esc(p.images[0]) +
        '" alt="' +
        esc(p.name) +
        '">' +
        (p.images.length > 1
          ? '<span class="more">' + p.images.length + " photos</span>"
          : "") +
        "</button>" +
        '<div class="card-body">' +
        '<p class="code">' +
        esc(p.code) +
        "</p>" +
        "<h3>" +
        esc(p.name) +
        "</h3>" +
        (p.note ? '<p class="note">' + esc(p.note) + "</p>" : "") +
        '<p class="price">' +
        priceText(p) +
        "</p>" +
        '<button class="btn btn-select" aria-pressed="' +
        isSel(p.code) +
        '">' +
        (isSel(p.code) ? "Selected ✓" : "Select") +
        "</button>" +
        "</div>";
      card.querySelector(".card-img").onclick = () => openLb(p.code);
      card.querySelector(".btn-select").onclick = () => toggle(p.code);
      grid.appendChild(card);
    });
  }

  function setProducts(list) {
    LIST = list;
    byCode = {};
    list.forEach((p) => (byCode[p.code] = p));
    selected = selected.filter((c) => byCode[c]);
    save();
    buildFilters();
    renderGrid();
    sync();
  }

  // ---- selection
  function toggle(code) {
    selected = isSel(code)
      ? selected.filter((c) => c !== code)
      : selected.concat(code);
    save();
    sync();
  }
  function sync() {
    document.querySelectorAll(".card").forEach((card) => {
      const on = isSel(card.dataset.code);
      card.classList.toggle("sel", on);
      const b = card.querySelector(".btn-select");
      b.textContent = on ? "Selected ✓" : "Select";
      b.setAttribute("aria-pressed", on);
    });
    $("#barCount").textContent = selected.length;
    $("#bar").hidden = selected.length === 0;
    renderList();
    if (!$("#lb").hidden) syncLb();
    if (selected.length === 0) closeDrawer();
  }

  // ---- drawer
  function message() {
    const lines = selected.map(
      (c, i) =>
        i +
        1 +
        ". " +
        byCode[c].name +
        " (" +
        c +
        ")" +
        (byCode[c].price > 0 ? " - " + money(byCode[c].price) : ""),
    );
    return (
      "Hello " +
      BUSINESS.name +
      "! I'd like to inquire about these items:\n\n" +
      lines.join("\n") +
      "\n\nPlease let me know availability, price and sizes. Thank you!"
    );
  }
  function renderList() {
    const ul = $("#list");
    ul.innerHTML = "";
    selected.forEach((c) => {
      const p = byCode[c];
      const li = document.createElement("li");
      li.innerHTML =
        '<img src="' +
        p.images[0] +
        '" alt=""><div><b>' +
        p.name +
        "</b><small>" +
        p.code +
        (p.note ? " · " + p.note : "") +
        '</small></div><button class="x" aria-label="Remove ' +
        p.name +
        '">&times;</button>';
      li.querySelector("button").onclick = () => toggle(c);
      ul.appendChild(li);
    });
    $("#sendWa").href = waLink(message());
  }
  const drawer = $("#drawer"),
    overlay = $("#drawerOverlay");
  function openDrawer() {
    overlay.hidden = false;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    overlay.hidden = true;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  $("#barOpen").onclick = openDrawer;
  $("#drawerClose").onclick = closeDrawer;
  overlay.onclick = closeDrawer;
  $("#clearAll").onclick = () => {
    selected = [];
    save();
    sync();
  };

  // ---- lightbox
  let lbCode = null;
  const lb = $("#lb");
  function openLb(code) {
    lbCode = code;
    const p = byCode[code];
    $("#lbCode").textContent = p.code;
    $("#lbName").textContent = p.name;
    $("#lbNote").textContent = p.note || "";
    $("#lbPrice").textContent = priceText(p);
    $("#lbAsk").href = waLink(
      "Hello " +
        BUSINESS.name +
        "! I'm interested in: " +
        p.name +
        " (" +
        p.code +
        "). Is it available?",
    );
    const th = $("#lbThumbs");
    th.innerHTML = "";
    if (p.images.length > 1) {
      p.images.forEach((src, i) => {
        const b = document.createElement("button");
        b.innerHTML = '<img src="' + src + '" alt="Photo ' + (i + 1) + '">';
        b.onclick = () => showImg(i);
        th.appendChild(b);
      });
    }
    showImg(0);
    syncLb();
    lb.hidden = false;
    document.body.classList.add("noscroll");
    $("#lbClose").focus();
  }
  function showImg(i) {
    const p = byCode[lbCode];
    $("#lbImg").src = p.images[i];
    $("#lbImg").alt = p.name;
    $("#lbThumbs")
      .querySelectorAll("button")
      .forEach((b, k) => b.classList.toggle("on", k === i));
  }
  function syncLb() {
    const on = isSel(lbCode);
    const b = $("#lbSelect");
    b.textContent = on ? "Selected ✓ (tap to remove)" : "Select this item";
    b.classList.toggle("is-on", on);
  }
  $("#lbSelect").onclick = () => toggle(lbCode);
  function closeLb() {
    lb.hidden = true;
    document.body.classList.remove("noscroll");
  }
  $("#lbClose").onclick = closeLb;
  lb.onclick = (e) => {
    if (e.target === lb) closeLb();
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLb();
      closeDrawer();
    }
  });

  // ---- start
  const loadMsg = (t) => {
    grid.innerHTML =
      '<p style="grid-column:1/-1;color:var(--muted);padding:24px 0">' +
      t +
      "</p>";
  };
  async function start() {
    if (!BUSINESS.sheetUrl) {
      setProducts(backup());
      return;
    }
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem("tt-stock-cache") || "null");
    } catch (e) {}
    if (cached && cached.length) setProducts(cached);
    else loadMsg("Loading styles…");
    try {
      const fresh = await fetchSheet();
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) setProducts(fresh);
    } catch (e) {
      console.warn("Stock sheet unavailable, using backup list.", e);
      if (!cached || !cached.length) setProducts(backup());
    }
  }
  start();
})();
