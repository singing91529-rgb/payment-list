// script.js - interactions, dynamic rendering, copy, toast, modal, animations

/* ---------- Data (edit here to modify banks/ewallet/USDT) ---------- */
const BANKS = [
  {
    name: "國泰世華",
    code: "013",
    account: "076506105079",
    image: "images/國泰.jpg",
    hasQr: true
  },
  {
    name: "中國信託",
    code: "822",
    account: "901564159389",
    image: "images/中國信託.jpg",
    hasQr: true
  },
  {
    name: "台新銀行",
    code: "812",
    account: "28881024240400",
    image: "images/台新.jpg",
    hasQr: true
  },
  {
    name: "新光銀行",
    code: "103",
    account: "0471501171461",
    image: "images/新光.jpg",
    hasQr: true
  },
  {
    name: "玉山銀行",
    code: "808",
    account: "0989976010520",
    image: "",
    hasQr: false
  },
  {
    name: "永豐銀行",
    code: "807",
    account: "19901800943392",
    image: "",
    hasQr: false
  },
  {
    name: "郵局",
    code: "700",
    account: "00010680622731",
    image: "",
    hasQr: false
  },
  {
    name: "臺灣銀行",
    code: "004",
    account: "033008194482",
    image: "",
    hasQr: false
  },
  {
    name: "樂天銀行",
    code: "826",
    account: "8120100248962",
    image: "images/樂天銀行.jpg",
    hasQr: true
  }
];

const EWALLETS = [
  { name: "街口支付", image: "images/街口支付.jpg" },
  { name: "悠遊付", image: "images/悠遊付.jpg" },
  { name: "全盈Pay", image: "images/全盈.jpg" }
];

let USDT_ADDRESS = "TUGa6c6cDDdQsdc2YaNyhEhJJFhcdyy2T2";

/* ---------- DOM references ---------- */
const banksGrid = document.getElementById("banks-grid");
const ewalletGrid = document.getElementById("ewallet-grid");
const favoritesGrid = document.getElementById("favorites-grid");
const favoritesSection = document.getElementById("favorites-section");
const searchInput = document.getElementById("payment-search");
const clearSearchBtn = document.getElementById("clear-search");
const searchEmpty = document.getElementById("search-empty");
const toastEl = document.getElementById("toast");
const qrModal = document.getElementById("qr-modal");
const modalImg = document.getElementById("modal-img");
const modalCaption = document.getElementById("modal-caption");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");
const usdtAddressEl = document.getElementById("usdt-address");
const copyUsdtBtn = document.getElementById("copy-usdt");
const usdtCard = copyUsdtBtn.closest(".usdt-card");
const FAVORITES_STORAGE_KEY = "payment-hub-favorites";
let favorites = new Set();
let cardObserver;
let modalCloseTimer;
let previousModalFocus;

/* ---------- Helpers ---------- */
function createEl(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") el.className = attrs[k];
    else if (k === "dataset") {
      for (const d in attrs[k]) el.dataset[d] = attrs[k][d];
    } else if (k.startsWith("on") && typeof attrs[k] === "function") {
      el.addEventListener(k.substring(2), attrs[k]);
    } else {
      el.setAttribute(k, attrs[k]);
    }
  }
  children.forEach(c => {
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else if (c instanceof Node) el.appendChild(c);
  });
  return el;
}

function showToast(text = "Copied Successfully", duration = 2400) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => {
    toastEl.classList.remove("show");
  }, duration);
}

async function copyText(text, successMessage = "Copied successfully") {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch (err) {
    console.error("Copy failed", err);
    showToast("Unable to copy. Check clipboard permissions and try again.");
  }
}

function loadFavorites() {
  try {
    const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!saved) return new Set();
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.some(id => typeof id !== "string")) {
      throw new TypeError("Saved favorites must be an array of payment IDs.");
    }
    return new Set(parsed);
  } catch (err) {
    console.error("Could not load favorites", err);
    showToast("Saved favorites could not be loaded.");
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]));
  } catch (err) {
    console.error("Could not save favorites", err);
    showToast("Favorites could not be saved on this device.");
  }
}

function makeFavoriteButton(paymentId, name) {
  const isFavorite = favorites.has(paymentId);
  return createEl("button", {
    class: `favorite-toggle${isFavorite ? " is-favorite" : ""}`,
    type: "button",
    dataset: { action: "favorite", paymentId },
    "aria-label": `${isFavorite ? "Remove" : "Add"} ${name} ${isFavorite ? "from" : "to"} favorites`,
    "aria-pressed": String(isFavorite)
  }, "★");
}

/* ripple effect */
function createRipple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement("span");
  circle.className = "ripple-effect";
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  circle.style.width = circle.style.height = size + "px";
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;
  circle.style.left = x + "px";
  circle.style.top = y + "px";
  btn.appendChild(circle);
  setTimeout(() => circle.remove(), 700);
}

/* modal open/close */
function openModal(imgSrc, provider = "") {
  clearTimeout(modalCloseTimer);
  previousModalFocus = document.activeElement;
  modalImg.src = imgSrc;
  modalImg.alt = `${provider} QR code`;
  modalCaption.textContent = provider;
  qrModal.setAttribute("aria-hidden", "false");
  qrModal.classList.remove("is-closing");
  document.body.style.overflow = "hidden";
  modalClose.focus();
}
function closeModal() {
  if (qrModal.getAttribute("aria-hidden") === "true" || qrModal.classList.contains("is-closing")) return;
  qrModal.classList.add("is-closing");
  modalCloseTimer = setTimeout(() => {
    qrModal.setAttribute("aria-hidden", "true");
    qrModal.classList.remove("is-closing");
    modalImg.src = "";
    document.body.style.overflow = "";
    if (previousModalFocus && typeof previousModalFocus.focus === "function") previousModalFocus.focus();
  }, 220);
}

/* ---------- Render functions ---------- */

function makeBankCard(bank) {
  const paymentId = `bank:${bank.code}`;
  const card = createEl("div", {
    class: "card glass payment-card",
    dataset: { paymentId, search: `${bank.name} ${bank.code} ${bank.account}` }
  });

  // media area (QR or placeholder)
  const media = createEl("div", { class: "card-media center" });
  if (bank.hasQr && bank.image) {
    const img = createEl("img", {
      class: "card-img qr-img payment-qr",
      src: bank.image,
      alt: `${bank.name} QR`,
      dataset: { full: bank.image, provider: bank.name }
    });
    media.appendChild(img);
  } else {
    const coming = createEl("div", { class: "coming-soon" },
      createEl("span", { class: "coming-soon-icon", "aria-hidden": "true" }, "⌁"),
      createEl("strong", {}, "Coming Soon"),
      createEl("small", {}, "QR code unavailable")
    );
    media.appendChild(coming);
  }

  // body
  const body = createEl("div", { class: "card-body" });
  const heading = createEl("div", { class: "card-heading" },
    createEl("h4", { class: "card-name" }, bank.name),
    makeFavoriteButton(paymentId, bank.name)
  );
  const meta = createEl("div", { class: "meta" },
    createEl("span", { class: "code" }, `Bank code ${bank.code}`),
    createEl("span", { class: "muted" }, "Account number")
  );
  const acc = createEl("pre", { class: "address" }, bank.account);

  const actions = createEl("div", { class: "card-actions" });
  actions.appendChild(createEl("button", {
    class: "btn ripple",
    type: "button",
    dataset: { action: "copy-account", value: bank.account }
  }, "Copy account"));
  actions.appendChild(createEl("button", {
    class: "btn btn-secondary ripple",
    type: "button",
    dataset: { action: "copy-code", value: bank.code }
  }, "Copy code"));
  actions.appendChild(createEl("button", {
    class: "btn btn-secondary ripple copy-combined",
    type: "button",
    dataset: { action: "copy-bank-details", code: bank.code, account: bank.account }
  }, "Copy both"));

  body.appendChild(heading);
  body.appendChild(meta);
  body.appendChild(acc);
  body.appendChild(actions);

  card.appendChild(media);
  card.appendChild(body);

  return card;
}

function makeEwalletCard(ew) {
  const paymentId = `ewallet:${ew.name}`;
  const card = createEl("div", {
    class: "card glass payment-card",
    dataset: { paymentId, search: ew.name }
  });

  const media = createEl("div", { class: "card-media center" });
  const img = createEl("img", {
    class: "card-img qr-img payment-qr",
    src: ew.image,
    alt: `${ew.name} QR`,
    dataset: { full: ew.image, provider: ew.name }
  });
  media.appendChild(img);

  const body = createEl("div", { class: "card-body" });
  const heading = createEl("div", { class: "card-heading" },
    createEl("h4", { class: "card-name" }, ew.name),
    makeFavoriteButton(paymentId, ew.name)
  );
  const desc = createEl("p", { class: "muted" }, "Tap QR to view full size");

  const actions = createEl("div", { class: "card-actions" });
  actions.appendChild(createEl("button", {
    class: "btn ripple",
    type: "button",
    dataset: { action: "copy-provider", value: ew.name }
  }, "Copy provider"));

  body.appendChild(heading);
  body.appendChild(desc);
  body.appendChild(actions);

  card.appendChild(media);
  card.appendChild(body);

  return card;
}

/* ---------- Initial render ---------- */
function renderAll() {
  // banks
  BANKS.forEach(b => {
    banksGrid.appendChild(makeBankCard(b));
  });
  // ewallets
  EWALLETS.forEach(w => {
    ewalletGrid.appendChild(makeEwalletCard(w));
  });
  // USDT address
  usdtAddressEl.textContent = USDT_ADDRESS;
}

function normalizeSearch(value) {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function renderFavorites() {
  const cards = [];
  BANKS.filter(bank => favorites.has(`bank:${bank.code}`)).forEach(bank => cards.push(makeBankCard(bank)));
  EWALLETS.filter(wallet => favorites.has(`ewallet:${wallet.name}`)).forEach(wallet => cards.push(makeEwalletCard(wallet)));
  if (favorites.has("usdt:trc20")) {
    const usdtFavoriteCard = usdtCard.cloneNode(true);
    usdtFavoriteCard.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
    cards.push(usdtFavoriteCard);
  }
  favoritesGrid.replaceChildren(...cards);
  favoritesSection.hidden = cards.length === 0;
  observeCards(favoritesGrid);
  applySearch();
}

function applySearch() {
  const query = normalizeSearch(searchInput.value);
  clearSearchBtn.hidden = query.length === 0;
  let visiblePayments = 0;
  const paymentCards = [
    ...banksGrid.querySelectorAll(".payment-card"),
    ...ewalletGrid.querySelectorAll(".payment-card"),
    usdtCard
  ];

  paymentCards.forEach(card => {
    const searchable = normalizeSearch(card.dataset.search || card.textContent);
    const matches = !query || searchable.includes(query);
    card.hidden = !matches;
    if (matches) visiblePayments += 1;
  });

  document.querySelectorAll("#banks-grid, #ewallet-grid").forEach(grid => {
    grid.closest(".section-block").hidden = ![...grid.children].some(card => !card.hidden);
  });
  usdtCard.closest(".section-block").hidden = usdtCard.hidden;

  favoritesGrid.querySelectorAll(".payment-card").forEach(card => {
    card.hidden = Boolean(query) && !normalizeSearch(card.dataset.search || card.textContent).includes(query);
  });
  favoritesSection.hidden = ![...favoritesGrid.children].some(card => !card.hidden);
  searchEmpty.hidden = !query || visiblePayments > 0;
}

function toggleFavorite(paymentId) {
  if (favorites.has(paymentId)) favorites.delete(paymentId);
  else favorites.add(paymentId);
  saveFavorites();
  let name = paymentId;
  document.querySelectorAll(".payment-card").forEach(card => {
    if (card.dataset.paymentId !== paymentId) return;
    const button = card.querySelector(".favorite-toggle");
    name = card.querySelector(".card-name").textContent;
    const isFavorite = favorites.has(paymentId);
    button.classList.toggle("is-favorite", isFavorite);
    button.setAttribute("aria-pressed", String(isFavorite));
    button.setAttribute("aria-label", `${isFavorite ? "Remove" : "Add"} ${name} ${isFavorite ? "from" : "to"} favorites`);
  });
  renderFavorites();
  showToast(favorites.has(paymentId) ? `${name} added to favorites` : `${name} removed from favorites`);
}

/* ---------- Events ---------- */
searchInput.addEventListener("input", applySearch);
clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  applySearch();
  searchInput.focus();
});

document.addEventListener("click", async (e) => {
  const target = e.target;
  const favoriteButton = target.closest(".favorite-toggle");
  if (favoriteButton) {
    toggleFavorite(favoriteButton.dataset.paymentId);
    return;
  }

  const actionButton = target.closest("button[data-action]");
  if (actionButton) {
    const { action, value, code, account } = actionButton.dataset;
    if (action === "copy-account") await copyText(value, "Account number copied");
    else if (action === "copy-code") await copyText(value, "Bank code copied");
    else if (action === "copy-bank-details") {
      await copyText(`Bank code: ${code}\nAccount number: ${account}`, "Bank code and account number copied");
    } else if (action === "copy-provider") await copyText(value, "Payment provider copied");
    else if (action === "copy-usdt") await copyText(USDT_ADDRESS, "USDT wallet address copied");
    return;
  }

  const qrImage = target.closest("img.payment-qr");
  if (qrImage) openModal(qrImage.dataset.full || qrImage.src, qrImage.dataset.provider || qrImage.alt);
});

/* Modal events */
modalOverlay.addEventListener("click", closeModal);
modalClose.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && qrModal.getAttribute("aria-hidden") === "false") closeModal();
});

/* Add ripple to all future .ripple buttons through delegation */
document.addEventListener("pointerdown", (e) => {
  const btn = e.target.closest(".ripple");
  if (btn) createRipple({ currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
});

/* IntersectionObserver for card reveal animations */
function setupObservers() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".card").forEach(card => card.classList.add("in-view"));
    return;
  }
  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  observeCards();
}

function observeCards(root = document) {
  if (!("IntersectionObserver" in window)) {
    root.querySelectorAll(".card").forEach(card => card.classList.add("in-view"));
    return;
  }
  if (!cardObserver) return;
  root.querySelectorAll(".card:not(.in-view)").forEach(card => cardObserver.observe(card));
}

/* Header/hero fade in */
function headerFadeIn() {
  const title = document.querySelector(".brand .site-title");
  const subtitle = document.querySelector(".brand .site-subtitle");
  const heroTitle = document.querySelector(".hero-title");
  const heroSub = document.querySelector(".hero-subtitle");
  setTimeout(() => { title.style.opacity = 1; title.style.transform = "translateY(0)"; }, 220);
  setTimeout(() => { subtitle.style.opacity = 1; subtitle.style.transform = "translateY(0)"; }, 320);
  setTimeout(() => { heroTitle.style.opacity = 1; heroTitle.style.transform = "translateY(0)"; }, 420);
  setTimeout(() => { heroSub.style.opacity = 1; heroSub.style.transform = "translateY(0)"; }, 540);
}

/* ---------- Startup ---------- */
document.addEventListener("DOMContentLoaded", () => {
  favorites = loadFavorites();
  renderAll();
  setupObservers();
  renderFavorites();
  applySearch();
  headerFadeIn();
});
