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
const PERSONAL_DATA_KEY = "payment-hub-personal-data-v1";
const ADMIN_HASH_KEY = "payment-hub-admin-hash-v1";
const ADMIN_SALT_KEY = "payment-hub-admin-salt-v1";
let adminMode = false;
let personalData = loadPersonalData();

function loadPersonalData() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERSONAL_DATA_KEY) || "null");
    if (saved && Array.isArray(saved.banks) && Array.isArray(saved.ewallets)) {
      return { banks: saved.banks, ewallets: saved.ewallets };
    }
  } catch (error) { console.warn("Personal payment data could not be loaded", error); }
  return { banks: BANKS.map(item => ({ ...item })), ewallets: EWALLETS.map(item => ({ ...item })) };
}
function persistPersonalData() {
  try {
    localStorage.setItem(PERSONAL_DATA_KEY, JSON.stringify(personalData));
    return true;
  } catch (error) {
    showToast("Storage is full. Use smaller QR images or export and remove older entries.");
    return false;
  }
}
function syncPaymentData() {
  BANKS.splice(0, BANKS.length, ...personalData.banks);
  EWALLETS.splice(0, EWALLETS.length, ...personalData.ewallets);
  banksGrid.replaceChildren();
  ewalletGrid.replaceChildren();
  renderAll();
  renderFavorites();
  applySearch();
  observeCards();
}

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


/* ---------- Personal admin mode ---------- */
const adminToggle = document.getElementById("admin-toggle");
const adminPanel = document.getElementById("admin-panel");
const adminExit = document.getElementById("admin-exit");
const editor = document.getElementById("payment-editor");
const importFile = document.getElementById("import-file");
const $ = id => document.getElementById(id);

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function fromBase64(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
async function requestAdminAccess() {
  if (!window.crypto?.subtle) {
    showToast("This browser does not support secure password hashing.");
    return;
  }
  const hasPassword = localStorage.getItem(ADMIN_HASH_KEY);
  if (!hasPassword) {
    const first = prompt("Create your personal admin password (at least 8 characters):");
    if (first === null) return;
    if (first.length < 8) { showToast("Password must be at least 8 characters."); return; }
    const confirmPassword = prompt("Enter the password again to confirm:");
    if (first !== confirmPassword) { showToast("Passwords do not match."); return; }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPassword(first, salt);
    localStorage.setItem(ADMIN_SALT_KEY, toBase64(salt));
    localStorage.setItem(ADMIN_HASH_KEY, hash);
  } else {
    const password = prompt("Enter your personal admin password:");
    if (password === null) return;
    const salt = fromBase64(localStorage.getItem(ADMIN_SALT_KEY));
    if (await hashPassword(password, salt) !== hasPassword) {
      showToast("Incorrect password.");
      return;
    }
  }
  enterAdminMode();
}
function enterAdminMode() {
  adminMode = true;
  adminPanel.hidden = false;
  adminToggle.textContent = "Admin Mode ✓";
  renderAdminLists();
  adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}
function exitAdminMode() {
  adminMode = false;
  adminPanel.hidden = true;
  editor.hidden = true;
  adminToggle.textContent = "Admin Mode";
}
function renderAdminLists() {
  const renderList = (items, type, target) => {
    target.replaceChildren();
    items.forEach((item, index) => {
      const label = type === "bank" ? `${item.name} · ${item.code} · ${item.account}` : item.name;
      const row = createEl("div", { class: "admin-list-row" },
        createEl("span", { class: "admin-item-label" }, label),
        createEl("span", { class: "admin-item-actions" },
          createEl("button", { class: "btn btn-secondary", type: "button", dataset: { adminAction: "edit", type, index } }, "Edit"),
          createEl("button", { class: "btn btn-danger", type: "button", dataset: { adminAction: "delete", type, index } }, "Delete")
        )
      );
      target.appendChild(row);
    });
    if (!items.length) target.appendChild(createEl("p", { class: "admin-note" }, "No entries yet."));
  };
  renderList(BANKS, "bank", $("admin-banks-list"));
  renderList(EWALLETS, "wallet", $("admin-wallets-list"));
}
function openEditor(type, index = -1) {
  editor.reset();
  $("editor-type").value = type;
  $("editor-original-id").value = index;
  const isBank = type === "bank";
  $("bank-code-wrap").hidden = !isBank;
  $("bank-account-wrap").hidden = !isBank;
  $("editor-title").textContent = `${index < 0 ? "Add" : "Edit"} ${isBank ? "bank" : "e-wallet"}`;
  const item = index < 0 ? null : (isBank ? BANKS[index] : EWALLETS[index]);
  $("editor-name").value = item?.name || "";
  $("editor-code").value = item?.code || "";
  $("editor-account").value = item?.account || "";
  $("editor-image-status").textContent = item?.image ? "Current QR image will be retained unless you choose a new one." : "No QR image selected.";
  editor.hidden = false;
  editor.scrollIntoView({ behavior: "smooth", block: "center" });
}
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!["image/jpeg", "image/png"].includes(file.type)) return reject(new Error("Only JPG and PNG images are supported."));
    if (file.size > 1.5 * 1024 * 1024) return reject(new Error("Please use an image smaller than 1.5 MB."));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}
adminToggle.addEventListener("click", () => adminMode ? exitAdminMode() : requestAdminAccess());
adminExit.addEventListener("click", exitAdminMode);
$("add-bank").addEventListener("click", () => openEditor("bank"));
$("add-wallet").addEventListener("click", () => openEditor("wallet"));
$("editor-cancel").addEventListener("click", () => { editor.hidden = true; });
$("admin-banks-list").addEventListener("click", handleAdminListAction);
$("admin-wallets-list").addEventListener("click", handleAdminListAction);
function handleAdminListAction(event) {
  const button = event.target.closest("button[data-admin-action]");
  if (!button || !adminMode) return;
  const { adminAction, type, index } = button.dataset;
  const list = type === "bank" ? BANKS : EWALLETS;
  const itemIndex = Number(index);
  if (adminAction === "edit") openEditor(type, itemIndex);
  if (adminAction === "delete") {
    if (!confirm(`Delete "${list[itemIndex].name}"? This only changes this browser.`)) return;
    list.splice(itemIndex, 1);
    personalData = { banks: BANKS, ewallets: EWALLETS };
    if (persistPersonalData()) { syncPaymentData(); renderAdminLists(); showToast("Payment method deleted."); }
  }
}
editor.addEventListener("submit", async event => {
  event.preventDefault();
  if (!adminMode) return;
  const type = $("editor-type").value;
  const index = Number($("editor-original-id").value);
  const isBank = type === "bank";
  const name = $("editor-name").value.trim();
  const code = $("editor-code").value.trim();
  const account = $("editor-account").value.trim();
  if (!name || (isBank && (!code || !account))) { showToast("Please complete the required fields."); return; }
  try {
    const list = isBank ? BANKS : EWALLETS;
    const old = index < 0 ? {} : list[index];
    const imageFile = $("editor-image").files[0];
    const image = imageFile ? await readImageFile(imageFile) : (old.image || "");
    const item = isBank
      ? { name, code, account, image, hasQr: Boolean(image) }
      : { name, image };
    const duplicate = list.some((entry, i) => i !== index && (isBank ? entry.code === code : entry.name.toLocaleLowerCase() === name.toLocaleLowerCase()));
    if (duplicate) { showToast(isBank ? "This bank code already exists." : "This e-wallet name already exists."); return; }
    if (index < 0) list.push(item); else list[index] = item;
    personalData = { banks: BANKS, ewallets: EWALLETS };
    if (!persistPersonalData()) return;
    editor.hidden = true;
    syncPaymentData();
    renderAdminLists();
    showToast("Saved in this browser.");
  } catch (error) { showToast(error.message || "Could not save this payment method."); }
});
$("export-data").addEventListener("click", () => {
  const backup = {
    format: "payment-hub-personal-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    banks: BANKS,
    ewallets: EWALLETS
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = createEl("a", { href: url, download: "payment-hub-backup.json" });
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  showToast("Backup exported.");
});
$("import-data").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== "payment-hub-personal-backup" || !Array.isArray(data.banks) || !Array.isArray(data.ewallets)) {
      throw new Error("This file is not a valid Payment Hub backup.");
    }
    if (!confirm("Import this backup and replace the payment methods saved in this browser?")) return;
    personalData = { banks: data.banks, ewallets: data.ewallets };
    if (!persistPersonalData()) return;
    syncPaymentData(); renderAdminLists(); showToast("Backup imported.");
  } catch (error) { showToast(error.message || "Could not import backup."); }
  finally { importFile.value = ""; }
});

/* ---------- Startup ---------- */
document.addEventListener("DOMContentLoaded", () => {
  favorites = loadFavorites();
  BANKS.splice(0, BANKS.length, ...personalData.banks);
  EWALLETS.splice(0, EWALLETS.length, ...personalData.ewallets);
  renderAll();
  setupObservers();
  renderFavorites();
  applySearch();
  headerFadeIn();
});
