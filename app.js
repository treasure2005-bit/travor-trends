(function () {
  const $ = (s) => document.querySelector(s);
  const CATS = [
    ["all", "All"], ["dresses", "Dresses"], ["tops", "Tops"], ["blazers", "Blazers"],
    ["bottoms", "Trousers & Shorts"], ["sets", "Sets & Jumpsuits"], ["accessories", "Accessories"]
  ];
  const byCode = {};
  PRODUCTS.forEach((p) => (byCode[p.code] = p));

  let selected = [];
  try { selected = JSON.parse(localStorage.getItem("tt-selected") || "[]").filter((c) => byCode[c]); } catch (e) {}
  const save = () => { try { localStorage.setItem("tt-selected", JSON.stringify(selected)); } catch (e) {} };
  const isSel = (c) => selected.includes(c);

  const waBase = "https://wa.me/" + BUSINESS.whatsapp;
  const waLink = (text) => waBase + (text ? "?text=" + encodeURIComponent(text) : "");
  const money = (n) => BUSINESS.currency + " " + Number(n).toLocaleString("en-US");
  const priceText = (p) => (p.price > 0 ? money(p.price) : "Ask for price");

  // ---- static contact bits
  const hello = "Hello " + BUSINESS.name + "! I'd like to ask about your clothes.";
  ["topWa", "heroWa", "visitWa"].forEach((id) => ($("#" + id).href = waLink(hello)));
  $("#vLocation").textContent = BUSINESS.location;
  $("#vMap").innerHTML = BUSINESS.mapLink ? '<a href="' + BUSINESS.mapLink + '" target="_blank" rel="noopener">Open in Google Maps</a>' : "";
  $("#vPhone").innerHTML = '<a href="tel:+' + BUSINESS.whatsapp + '">' + BUSINESS.phoneDisplay + "</a>";
  $("#vHours").textContent = BUSINESS.hours;
  $("#year").textContent = new Date().getFullYear();

  // ---- filters
  let cat = "all";
  const filters = $("#filters");
  CATS.forEach(([k, label]) => {
    if (k !== "all" && !PRODUCTS.some((p) => p.category === k)) return;
    const b = document.createElement("button");
    b.className = "chip" + (k === "all" ? " on" : "");
    b.textContent = label;
    b.dataset.cat = k;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", k === "all");
    b.onclick = () => {
      cat = k;
      filters.querySelectorAll(".chip").forEach((c) => {
        c.classList.toggle("on", c === b);
        c.setAttribute("aria-selected", c === b);
      });
      renderGrid();
    };
    filters.appendChild(b);
  });

  // ---- grid
  const grid = $("#grid");
  function renderGrid() {
    grid.innerHTML = "";
    PRODUCTS.filter((p) => cat === "all" || p.category === cat).forEach((p) => {
      const card = document.createElement("article");
      card.className = "card" + (isSel(p.code) ? " sel" : "");
      card.dataset.code = p.code;
      card.innerHTML =
        '<button class="card-img" aria-label="View ' + p.name + '">' +
        '<img loading="lazy" src="' + p.images[0] + '" alt="' + p.name + '">' +
        (p.images.length > 1 ? '<span class="more">' + p.images.length + " photos</span>" : "") +
        "</button>" +
        '<div class="card-body">' +
        '<p class="code">' + p.code + "</p>" +
        "<h3>" + p.name + "</h3>" +
        (p.note ? '<p class="note">' + p.note + "</p>" : "") +
        '<p class="price">' + priceText(p) + "</p>" +
        '<button class="btn btn-select" aria-pressed="' + isSel(p.code) + '">' + (isSel(p.code) ? "Selected ✓" : "Select") + "</button>" +
        "</div>";
      card.querySelector(".card-img").onclick = () => openLb(p.code);
      card.querySelector(".btn-select").onclick = () => toggle(p.code);
      grid.appendChild(card);
    });
  }

  // ---- selection
  function toggle(code) {
    selected = isSel(code) ? selected.filter((c) => c !== code) : selected.concat(code);
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
    const lines = selected.map((c, i) => (i + 1) + ". " + byCode[c].name + " (" + c + ")" + (byCode[c].price > 0 ? " - " + money(byCode[c].price) : ""));
    return "Hello " + BUSINESS.name + "! I'd like to inquire about these items:\n\n" + lines.join("\n") + "\n\nPlease let me know availability, price and sizes. Thank you!";
  }
  function renderList() {
    const ul = $("#list");
    ul.innerHTML = "";
    selected.forEach((c) => {
      const p = byCode[c];
      const li = document.createElement("li");
      li.innerHTML = '<img src="' + p.images[0] + '" alt=""><div><b>' + p.name + '</b><small>' + p.code + (p.note ? " · " + p.note : "") + '</small></div><button class="x" aria-label="Remove ' + p.name + '">&times;</button>';
      li.querySelector("button").onclick = () => toggle(c);
      ul.appendChild(li);
    });
    $("#sendWa").href = waLink(message());
  }
  const drawer = $("#drawer"), overlay = $("#drawerOverlay");
  function openDrawer() { overlay.hidden = false; drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); }
  function closeDrawer() { overlay.hidden = true; drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
  $("#barOpen").onclick = openDrawer;
  $("#drawerClose").onclick = closeDrawer;
  overlay.onclick = closeDrawer;
  $("#clearAll").onclick = () => { selected = []; save(); sync(); };

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
    $("#lbAsk").href = waLink("Hello " + BUSINESS.name + "! I'm interested in: " + p.name + " (" + p.code + "). Is it available?");
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
    $("#lbThumbs").querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
  }
  function syncLb() {
    const on = isSel(lbCode);
    const b = $("#lbSelect");
    b.textContent = on ? "Selected ✓ (tap to remove)" : "Select this item";
    b.classList.toggle("is-on", on);
  }
  $("#lbSelect").onclick = () => toggle(lbCode);
  function closeLb() { lb.hidden = true; document.body.classList.remove("noscroll"); }
  $("#lbClose").onclick = closeLb;
  lb.onclick = (e) => { if (e.target === lb) closeLb(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeLb(); closeDrawer(); } });

  renderGrid();
  sync();
})();
