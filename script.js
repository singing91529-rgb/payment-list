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
const BANK_LOGOS = {
  "013": "images/bank-logos/cathay-logo.png",
  "822": "images/bank-logos/ctbc-logo.png",
  "812": "images/bank-logos/taishin-logo.png",
  "103": "images/bank-logos/skbank-logo.png",
  "808": "images/bank-logos/esun-logo.png",
  "807": "images/bank-logos/sinopac-logo.png",
  "700": "images/bank-logos/post-logo.png",
  "004": "images/bank-logos/bot-logo.png",
  "826": "images/bank-logos/rakuten-logo.png"
};



/* ---------- Supabase shared backend ---------- */
const SUPABASE_URL = "https://jqcjtsphjcfbavnhhzqs.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BUq_xoEIICw9JZWvBZWQOw_ymilaMa4";
const SUPABASE_SESSION_KEY = "payment-hub-supabase-session-v1";
let supabaseSession = null;
let cloudReady = false;

function getSession() {
  try { return JSON.parse(localStorage.getItem(SUPABASE_SESSION_KEY) || "null"); }
  catch { return null; }
}
function setSession(session) {
  supabaseSession = session;
  if (session) {
    if (!session.expires_at && session.expires_in) session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
    localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
  }
  else localStorage.removeItem(SUPABASE_SESSION_KEY);
}
async function sbRequest(path, options = {}, authenticated = false) {
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${authenticated && supabaseSession?.access_token ? supabaseSession.access_token : SUPABASE_PUBLISHABLE_KEY}`,
    ...(options.headers || {})
  };
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(data?.message || data?.msg || data?.error_description || `Supabase request failed (${response.status})`);
  return data;
}
async function refreshSupabaseSession() {
  if (!supabaseSession?.refresh_token) return false;
  try {
    const refreshed = await sbRequest("/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: supabaseSession.refresh_token })
    });
    setSession(refreshed);
    return true;
  } catch { setSession(null); return false; }
}
async function ensureSessionFresh() {
  if (!supabaseSession) return false;
  if (supabaseSession.expires_at && Date.now() / 1000 < supabaseSession.expires_at - 60) return true;
  return refreshSupabaseSession();
}
function publicStorageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/payment-qr/${path.split("/").map(encodeURIComponent).join("/")}`;
}
function rowToPayment(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.bank_code || "",
    account: row.account_number || "",
    image: publicStorageUrl(row.qr_image_path),
    qrPath: row.qr_image_path || "",
    hasQr: Boolean(row.qr_image_path),
    hidden: !row.is_visible,
    sortOrder: row.sort_order || 0
  };
}
async function loadCloudPayments() {
  const authed = await ensureSessionFresh();
  const query = authed
    ? "select=*&order=sort_order.asc,created_at.asc"
    : "select=*&is_visible=eq.true&order=sort_order.asc,created_at.asc";
  const rows = await sbRequest(`/rest/v1/payment_methods?${query}`, {}, authed);
  const banks = rows.filter(row => row.type === "bank").map(rowToPayment);
  const wallets = rows.filter(row => row.type === "wallet").map(rowToPayment);
  personalData = { banks, ewallets: wallets };
  BANKS.splice(0, BANKS.length, ...banks);
  EWALLETS.splice(0, EWALLETS.length, ...wallets);
  cloudReady = true;
  renderCloudData();
}
function renderCloudData() {
  banksGrid.replaceChildren();
  ewalletGrid.replaceChildren();
  renderAll();
  renderFavorites();
  applySearch();
  observeCards();
  animateOverview();
  if (adminMode) renderAdminLists();
}
async function uploadQrImage(file, oldPath = "") {
  if (!file) return oldPath;
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("QR 圖片只支援 JPG 或 PNG。");
  if (file.size > 1.5 * 1024 * 1024) throw new Error("圖片請小於 1.5 MB。");
  const ext = file.type === "image/png" ? "png" : "jpg";
  const safeBase = (file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || `qr-${Date.now()}`);
  const path = `${safeBase}-${Date.now()}.${ext}`;
  await sbRequest(`/storage/v1/object/payment-qr/${path}`, {
    method: "POST",
    headers: { "Content-Type": file.type, "x-upsert": "true" },
    body: file
  }, true);
  return path;
}
async function saveCloudPayment(type, index, fields, file) {
  const list = type === "bank" ? BANKS : EWALLETS;
  const old = index < 0 ? null : list[index];
  const qrPath = await uploadQrImage(file, old?.qrPath || "");
  const payload = {
    name: fields.name,
    type,
    bank_code: type === "bank" ? fields.code : null,
    account_number: type === "bank" ? fields.account : null,
    qr_image_path: qrPath || null,
    is_visible: old ? !old.hidden : true,
    sort_order: old?.sortOrder || (list.length + 1) * 10
  };
  if (old?.id) {
    await sbRequest(`/rest/v1/payment_methods?id=eq.${encodeURIComponent(old.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(payload)
    }, true);
  } else {
    await sbRequest("/rest/v1/payment_methods", {
      method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(payload)
    }, true);
  }
  await loadCloudPayments();
}
async function setCloudVisibility(item, visible) {
  await sbRequest(`/rest/v1/payment_methods?id=eq.${encodeURIComponent(item.id)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ is_visible: visible })
  }, true);
  await loadCloudPayments();
}
async function deleteCloudPayment(item) {
  await sbRequest(`/rest/v1/payment_methods?id=eq.${encodeURIComponent(item.id)}`, { method: "DELETE" }, true);
  await loadCloudPayments();
}
async function signInAdmin() {
  const email = prompt("管理者 Email：");
  if (!email) return;
  const password = prompt("Supabase 管理者密碼：");
  if (password === null) return;
  const session = await sbRequest("/auth/v1/token?grant_type=password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  setSession(session);
  const admins = await sbRequest(`/rest/v1/payment_admins?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}`, {}, true);
  if (!admins.length) {
    setSession(null);
    throw new Error("此帳號尚未取得 Payment Hub 管理者權限。");
  }
  await loadCloudPayments();
  await loadCloudHistory();
  enterAdminMode();
}

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
const HISTORY_KEY = "payment-hub-admin-history-v1";
const THEME_KEY = "payment-hub-theme-v1";
let adminMode = false;
let personalData = loadPersonalData();

function loadPersonalData() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERSONAL_DATA_KEY) || "null");
    if (saved && Array.isArray(saved.banks) && Array.isArray(saved.ewallets)) {
      // A previously saved empty dataset can result from an interrupted older build.
      // Restore defaults instead of rendering an empty payment hub.
      if (saved.banks.length === 0 && saved.ewallets.length === 0) {
        localStorage.removeItem(PERSONAL_DATA_KEY);
        return { banks: BANKS.map(item => ({ ...item })), ewallets: EWALLETS.map(item => ({ ...item })) };
      }
      return {
        banks: saved.banks.length ? saved.banks : BANKS.map(item => ({ ...item })),
        ewallets: saved.ewallets.length ? saved.ewallets : EWALLETS.map(item => ({ ...item }))
      };
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
  const brand = createEl("span", { class: "bank-brand-wrap" });
  const logoUrl = BANK_LOGOS[bank.code];
  const fallback = createEl("span", { class: `bank-brand-fallback${logoUrl ? " is-loading" : ""}` }, bank.code === "826" ? "Rakuten" : bank.name.replace(/銀行|世華/g, "").slice(0, 2));
  if (logoUrl) {
    const logo = createEl("img", { class: "bank-brand-logo", src: logoUrl, alt: `${bank.name} 品牌標誌`, loading: "lazy" });
    logo.addEventListener("load", () => fallback.remove());
    logo.addEventListener("error", () => { logo.remove(); fallback.classList.remove("is-loading"); });
    brand.appendChild(logo);
  }
  brand.appendChild(fallback);
  const heading = createEl("div", { class: "card-heading" },
    createEl("div", { class: "bank-name-brand" }, createEl("h4", { class: "card-name" }, bank.name), brand),
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
  BANKS.filter(b => !b.hidden).forEach(b => {
    banksGrid.appendChild(makeBankCard(b));
  });
  // ewallets
  EWALLETS.filter(w => !w.hidden).forEach(w => {
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
  BANKS.filter(bank => !bank.hidden && favorites.has(`bank:${bank.code}`)).forEach(bank => cards.push(makeBankCard(bank)));
  EWALLETS.filter(wallet => !wallet.hidden && favorites.has(`ewallet:${wallet.name}`)).forEach(wallet => cards.push(makeEwalletCard(wallet)));
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
  animateOverview();
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


/* ---------- Theme, activity history and dashboard helpers ---------- */
function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 50) : [];
  } catch { return []; }
}
async function recordActivity(action, item) {
  try {
    const entry = { action, item, at: new Date().toISOString() };
    const history = loadHistory();
    history.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    if (supabaseSession && await ensureSessionFresh()) {
      await sbRequest("/rest/v1/payment_activity", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ action, item_name: item })
      }, true);
      await loadCloudHistory();
    } else renderHistory();
  } catch (error) {
    console.warn("Could not save shared activity history", error);
    renderHistory();
  }
}
async function loadCloudHistory() {
  if (!supabaseSession || !await ensureSessionFresh()) { renderHistory(); return; }
  try {
    const rows = await sbRequest("/rest/v1/payment_activity?select=action,item_name,created_at&order=created_at.desc&limit=50", {}, true);
    const history = rows.map(row => ({ action: row.action, item: row.item_name, at: row.created_at }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (error) { console.warn("Could not load shared history", error); }
  renderHistory();
}
function renderHistory() {
  const target = document.getElementById("admin-history-list");
  if (!target) return;
  target.replaceChildren();
  const history = loadHistory();
  if (!history.length) {
    target.appendChild(createEl("p", { class: "admin-note" }, "尚無操作紀錄"));
    return;
  }
  history.forEach(entry => {
    const dateText = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei", dateStyle: "medium", timeStyle: "short"
    }).format(new Date(entry.at));
    target.appendChild(createEl("div", { class: "history-row" },
      createEl("span", { class: "history-dot" }),
      createEl("div", { class: "history-copy" },
        createEl("strong", {}, `${entry.action}：${entry.item}`),
        createEl("small", {}, dateText)
      )
    ));
  });
}
function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  try { localStorage.setItem(THEME_KEY, selected); } catch {}
  const button = document.getElementById("theme-toggle");
  if (button) button.textContent = selected === "dark" ? "☀ 淺色" : "☾ 深色";
}
function initTheme() {
  let saved = "dark";
  try { saved = localStorage.getItem(THEME_KEY) || "dark"; } catch {}
  applyTheme(saved);
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
}
function animateOverview() {
  const counts = {
    "bank-count": BANKS.filter(item => !item.hidden).length,
    "wallet-count": EWALLETS.filter(item => !item.hidden).length,
    "favorite-count": favorites.size
  };
  Object.entries(counts).forEach(([key, target]) => {
    const node = document.querySelector(`[data-count="${key}"]`);
    if (!node) return;
    const start = performance.now();
    const duration = 650;
    const frame = now => {
      const progress = Math.min(1, (now - start) / duration);
      node.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
document.getElementById("clear-history")?.addEventListener("click", async () => {
  if (!adminMode || !confirm("確定清除所有共用操作歷史？")) return;
  try {
    await sbRequest("/rest/v1/payment_activity?id=not.is.null", { method: "DELETE" }, true);
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    showToast("共用操作紀錄已清除。");
  } catch (error) { showToast(error.message || "無法清除操作紀錄。"); }
});

/* ---------- Personal admin mode ---------- */
const adminToggle = document.getElementById("admin-toggle");
const adminPanel = document.getElementById("admin-panel");
const adminExit = document.getElementById("admin-exit");
const editor = document.getElementById("payment-editor");
const importFile = document.getElementById("import-file");
const $ = id => document.getElementById(id);

async function requestAdminAccess() {
  try { await signInAdmin(); }
  catch (error) { showToast(error.message || "管理者登入失敗。"); }
}
function enterAdminMode() {
  adminMode = true;
  adminPanel.hidden = false;
  adminToggle.textContent = "Admin Mode ✓";
  renderAdminLists();
  const activePage = document.querySelector("[data-nav-page].is-active")?.dataset.navPage || "home";
  $("admin-payment-lists").hidden = activePage !== "home";
  if (friendViewerSession) { $("friend-admin-editor").hidden = false; renderFriendRows(); }
  if (document.getElementById("debt-tool") && !document.getElementById("debt-tool").hidden) { $("debt-admin-area").hidden = false; loadDebtRows().catch(e=>showToast(e.message)); }
  adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}
function exitAdminMode() {
  adminMode = false;
  adminPanel.hidden = true;
  editor.hidden = true;
  adminToggle.textContent = "Admin Mode";
  if ($("friend-admin-editor")) $("friend-admin-editor").hidden = true;
  setSession(null);
  loadCloudPayments().catch(error => console.warn("Could not refresh public view", error));
}
function renderAdminLists() {
  const renderList = (items, type, target) => {
    target.replaceChildren();
    items.forEach((item, index) => {
      const label = `${type === "bank" ? `${item.name} · ${item.code} · ${item.account}` : item.name}${item.hidden ? " · 已隱藏" : ""}`;
      const row = createEl("div", { class: "admin-list-row" },
        createEl("span", { class: "admin-item-label" }, label),
        createEl("span", { class: "admin-item-actions" },
          createEl("button", { class: "btn btn-secondary", type: "button", dataset: { adminAction: "toggle-hidden", type, index } }, item.hidden ? "Show" : "Hide"),
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
async function handleAdminListAction(event) {
  const button = event.target.closest("button[data-admin-action]");
  if (!button || !adminMode) return;
  const { adminAction, type, index } = button.dataset;
  const list = type === "bank" ? BANKS : EWALLETS;
  const itemIndex = Number(index);
  const item = list[itemIndex];
  if (!item) return;
  try {
    if (adminAction === "edit") openEditor(type, itemIndex);
    if (adminAction === "toggle-hidden") {
      await setCloudVisibility(item, item.hidden);
      await recordActivity(item.hidden ? "重新顯示" : "全站隱藏", item.name);
      showToast(item.hidden ? "已向所有訪客隱藏。" : "已向所有訪客重新顯示。");
    }
    if (adminAction === "delete") {
      if (!confirm(`確定永久刪除「${item.name}」？此操作會影響所有訪客。`)) return;
      await deleteCloudPayment(item);
      await recordActivity("刪除", item.name);
      showToast("已從全站刪除。");
    }
    renderAdminLists();
  } catch (error) { showToast(error.message || "雲端操作失敗。"); }
}
editor.addEventListener("submit", async event => {
  event.preventDefault();
  if (!adminMode || !supabaseSession) return;
  const type = $("editor-type").value;
  const index = Number($("editor-original-id").value);
  const isBank = type === "bank";
  const name = $("editor-name").value.trim();
  const code = $("editor-code").value.trim();
  const account = $("editor-account").value.trim();
  if (!name || (isBank && (!code || !account))) { showToast("請填寫必要欄位。"); return; }
  try {
    const list = isBank ? BANKS : EWALLETS;
    const duplicate = list.some((entry, i) => i !== index && (isBank ? entry.code === code : entry.name.toLocaleLowerCase() === name.toLocaleLowerCase()));
    if (duplicate) { showToast(isBank ? "銀行代碼已存在。" : "電子支付名稱已存在。"); return; }
    const file = $("editor-image").files[0];
    await saveCloudPayment(type, index, { name, code, account }, file);
    editor.hidden = true;
    editor.reset();
    await recordActivity(index < 0 ? "新增" : "編輯", name);
    renderAdminLists();
    showToast("已儲存至共用資料庫，所有訪客都會看到更新。");
  } catch (error) { showToast(error.message || "無法儲存資料。"); }
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
    recordActivity("匯入備份", "付款資料"); syncPaymentData(); renderAdminLists(); animateOverview(); showToast("Backup imported.");
  } catch (error) { showToast(error.message || "Could not import backup."); }
  finally { importFile.value = ""; }
});


/* ---------- Live date and time (Taiwan) ---------- */
function startLiveClock() {
  const dateNode = document.getElementById("live-date");
  const timeNode = document.getElementById("live-time");
  if (!dateNode || !timeNode) return;
  const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit",
    day: "2-digit", weekday: "long"
  });
  const timeFormatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit",
    second: "2-digit", hourCycle: "h23"
  });
  const update = () => {
    const now = new Date();
    dateNode.textContent = dateFormatter.format(now);
    timeNode.textContent = timeFormatter.format(now);
    timeNode.dateTime = now.toISOString();
  };
  update();
  window.setInterval(update, 1000);
}

document.getElementById("clear-history")?.addEventListener("click", () => {
  if (confirm("確定清除所有操作歷史？")) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});


/* ---------- Private friends directory (separate viewer session) ---------- */
const FRIEND_VIEWER_EMAIL = "payment-viewer@payment-hub.local";
const FRIEND_VIEWER_SESSION_KEY = "payment-hub-friend-viewer-session-v1";
let friendViewerSession = null;
let friendRows = [];
const FRIENDS_TABLE = "friend_bank_accounts";
function loadFriendViewerSession() {
  try { friendViewerSession = JSON.parse(sessionStorage.getItem(FRIEND_VIEWER_SESSION_KEY) || "null"); }
  catch { friendViewerSession = null; }
}
function saveFriendViewerSession(session) {
  friendViewerSession = session;
  if (session) sessionStorage.setItem(FRIEND_VIEWER_SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(FRIEND_VIEWER_SESSION_KEY);
}
async function friendRequest(path, options = {}, admin = false) {
  const useAdminToken = admin || (adminMode && supabaseSession?.access_token);
  const token = useAdminToken ? supabaseSession?.access_token : friendViewerSession?.access_token;
  if (!token) throw new Error("請先登入親友轉帳資料。");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const raw = await response.text();
  let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(data?.message || data?.hint || `資料庫請求失敗 (${response.status})`);
  return data;
}
async function loadFriendRows() {
  friendRows = await friendRequest(`/rest/v1/${FRIENDS_TABLE}?select=*&order=name.asc`);
  renderFriendRows();
}
function renderFriendRows() {
  const list = $("friend-list"); if (!list) return;
  list.replaceChildren();
  const q = ($("friend-search")?.value || "").trim().toLowerCase();
  const rows = friendRows.filter(r => (r.is_active || adminMode) &&
    [r.name,r.bank_name,r.bank_code,r.branch_name,r.account_number,r.note].join(" ").toLowerCase().includes(q));
  if (!rows.length) { list.append(createEl("p",{class:"muted"},"目前沒有符合條件的親友資料。")); return; }
  rows.forEach(row => {
    const card = createEl("article",{class:"friend-card"});
    const top = createEl("div",{class:"tool-heading"},
      createEl("div",{},createEl("h3",{},row.name),createEl("p",{class:"muted"},`${row.bank_name || ""}${row.bank_code ? ` · ${row.bank_code}` : ""}${row.branch_name ? ` · ${row.branch_name}` : ""}`))
    );
    const account = createEl("strong",{class:"friend-account"},row.account_number || "");
    const actions = createEl("div",{class:"editor-actions"});
    actions.append(createEl("button",{class:"btn btn-secondary",type:"button",onclick:()=>copyText(row.account_number || "","已複製銀行帳號")},"複製帳號"));
    if (adminMode) {
      actions.append(createEl("button",{class:"btn btn-secondary",type:"button",onclick:()=>fillFriendForm(row)},"編輯"));
      actions.append(createEl("button",{class:"btn btn-danger",type:"button",onclick:()=>deleteFriendRow(row)},"刪除"));
    }
    card.append(top,account);
    if (row.note) card.append(createEl("p",{class:"muted"},row.note));
    card.append(actions); list.append(card);
  });
}
function fillFriendForm(row) {
  $("friend-id").value=row.id; $("friend-name").value=row.name||""; $("friend-bank").value=row.bank_name||"";
  $("friend-code").value=row.bank_code||""; $("friend-branch").value=row.branch_name||"";
  $("friend-account").value=row.account_number||""; $("friend-note").value=row.note||"";
  $("friend-active").checked=!!row.is_active; $("friend-form-title").textContent="編輯親友帳戶";
  $("friend-admin-editor").scrollIntoView({behavior:"smooth",block:"center"});
}
function resetFriendForm() {
  $("friend-form")?.reset(); $("friend-id").value=""; $("friend-active").checked=true;
  $("friend-form-title").textContent="新增親友帳戶";
}
async function deleteFriendRow(row) {
  if (!confirm(`確定刪除「${row.name}」的銀行資料？`)) return;
  try { await friendRequest(`/rest/v1/${FRIENDS_TABLE}?id=eq.${encodeURIComponent(row.id)}`,{method:"DELETE"},true); await loadFriendRows(); showToast("親友資料已刪除。"); }
  catch(e){showToast(e.message);}
}
async function enterFriendDirectory(password) {
  const message=$("friend-login-message"); message.textContent="驗證中…";
  const session=await sbRequest("/auth/v1/token?grant_type=password",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:FRIEND_VIEWER_EMAIL,password})
  });
  saveFriendViewerSession(session);
  await loadFriendRows();
  $("friend-login").hidden=true; $("friend-content").hidden=false;
  $("friend-admin-editor").hidden=!adminMode;
  message.textContent="";
}

/* ---------- Debt reminder: public submission + admin-only records ---------- */
const DEBT_TABLE = "debt_reminders";
let debtRows = [];
let debtFilter = "all";
async function submitDebtReminder(payload) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/clever-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify(payload)
  });
  const raw = await response.text(); let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw }; }
  if (!response.ok) throw new Error(data?.error || data?.message || `送出失敗 (${response.status})`);
  return data;
}
function moneyTwd(value) { return `NT$ ${Number(value || 0).toLocaleString("zh-TW")}`; }
function formatDebtDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", { timeZone:"Asia/Taipei", year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23" }).format(new Date(value));
}
async function loadDebtRows() {
  if (!adminMode || !supabaseSession || !await ensureSessionFresh()) throw new Error("請先登入管理帳號。");
  debtRows = await sbRequest(`/rest/v1/${DEBT_TABLE}?select=*&order=created_at.desc`, {}, true);
  renderDebtAdmin();
  await loadReceivables();
}
function renderDebtAdmin() {
  const pending = debtRows.filter(row => row.status === "pending");
  const paid = debtRows.filter(row => row.status === "paid");
  $("debt-pending-count").textContent = pending.length;
  $("debt-pending-total").textContent = moneyTwd(pending.reduce((sum,row)=>sum+Number(row.amount||0),0));
  $("debt-paid-count").textContent = paid.length;
  const list = $("debt-record-list"); list.replaceChildren();
  const rows = debtRows.filter(row => debtFilter === "all" || row.status === debtFilter);
  if (!rows.length) { list.append(createEl("p",{class:"muted"},"目前沒有符合條件的欠款提醒。")); return; }
  rows.forEach(row => {
    const card = createEl("article",{class:"debt-record"});
    const top = createEl("div",{class:"debt-record-top"},
      createEl("strong",{},row.sender_name),
      createEl("span",{class:`debt-status${row.status === "paid" ? " paid" : ""}`},row.status === "paid" ? "✓ 已還款" : "待還款")
    );
    const subject = createEl("div",{},row.subject);
    const amount = createEl("div",{class:"debt-record-amount"},moneyTwd(row.amount));
    const meta = createEl("div",{class:"debt-record-meta"},`通知時間：${formatDebtDate(row.created_at)}`);
    card.append(top,subject,amount);
    if (row.note) card.append(createEl("p",{class:"muted"},row.note));
    card.append(meta);
    const actions = createEl("div",{class:"debt-record-actions"});
    const toggle = createEl("button",{type:"button",onclick:()=>updateDebtStatus(row)},row.status === "paid" ? "改回待還款" : "標記已還款");
    const edit = createEl("button",{type:"button",onclick:()=>editDebtRecord(row)},"編輯");
    const del = createEl("button",{type:"button",class:"danger",onclick:()=>deleteDebtRecord(row)},"刪除");
    actions.append(toggle,edit,del); card.append(actions); list.append(card);
  });
}
/* ---------- Admin receivables: people who owe the administrator ---------- */
const RECEIVABLE_TABLE = "debt_receivables";
let receivableRows = [];
let receivableFilter = "all";
let debtAdminView = "owed-to-me";
function localDateString(date = new Date()) {
  const y = date.getFullYear(); const m = String(date.getMonth()+1).padStart(2,"0"); const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function dateOnlyDiff(from, to = localDateString()) {
  if (!from) return 0;
  const a = new Date(`${from}T00:00:00`); const b = new Date(`${to}T00:00:00`);
  return Math.floor((b-a)/86400000);
}
function formatDateOnly(value) {
  if (!value) return "未設定";
  const [y,m,d] = String(value).slice(0,10).split("-");
  return `${y}/${m}/${d}`;
}
async function loadReceivables() {
  if (!adminMode || !supabaseSession || !await ensureSessionFresh()) return;
  receivableRows = await sbRequest(`/rest/v1/${RECEIVABLE_TABLE}?select=*&order=borrowed_at.desc,created_at.desc`, {}, true);
  renderReceivables();
}
function renderReceivables() {
  const pending = receivableRows.filter(row => row.status !== "paid");
  const paid = receivableRows.filter(row => row.status === "paid");
  $("receivable-pending-count").textContent = pending.length;
  $("receivable-pending-total").textContent = moneyTwd(pending.reduce((sum,row)=>sum+Number(row.amount||0),0));
  $("receivable-paid-count").textContent = paid.length;
  const list = $("receivable-record-list"); list.replaceChildren();
  const rows = receivableRows.filter(row => receivableFilter === "all" || (receivableFilter === "paid" ? row.status === "paid" : row.status !== "paid"));
  if (!rows.length) { list.append(createEl("p",{class:"muted"},"目前沒有符合條件的紀錄。")); return; }
  rows.forEach(row => {
    const card = createEl("article",{class:"debt-record"});
    const overdue = row.status !== "paid" && row.due_date && dateOnlyDiff(row.due_date) > 0;
    const dueToday = row.status !== "paid" && row.due_date && dateOnlyDiff(row.due_date) === 0;
    const duration = Math.max(0,dateOnlyDiff(row.borrowed_at));
    const statusText = row.status === "paid" ? "✓ 已收回" : overdue ? `逾期 ${dateOnlyDiff(row.due_date)} 天` : dueToday ? "今日到期" : "未收回";
    const top = createEl("div",{class:"debt-record-top"},createEl("strong",{},row.person_name),createEl("span",{class:`debt-status${row.status === "paid" ? " paid" : overdue ? " overdue" : ""}`},statusText));
    card.append(top,createEl("div",{},row.subject),createEl("div",{class:"debt-record-amount"},moneyTwd(row.amount)));
    card.append(createEl("div",{class:"debt-record-meta"},`欠款日期：${formatDateOnly(row.borrowed_at)}｜已經過 ${duration} 天`));
    card.append(createEl("div",{class:"debt-record-meta"},`預計還款：${formatDateOnly(row.due_date)}`));
    if(row.note) card.append(createEl("p",{class:"muted"},row.note));
    const actions=createEl("div",{class:"debt-record-actions"});
    actions.append(createEl("button",{type:"button",onclick:()=>toggleReceivableStatus(row)},row.status === "paid" ? "改回未收回" : "標記已收回"));
    actions.append(createEl("button",{type:"button",onclick:()=>editReceivable(row)},"編輯"));
    actions.append(createEl("button",{type:"button",class:"danger",onclick:()=>deleteReceivable(row)},"刪除"));
    card.append(actions); list.append(card);
  });
}
function resetReceivableForm() {
  $("receivable-form").reset(); $("receivable-id").value=""; $("receivable-date").value=localDateString();
  $("receivable-form-title").textContent="新增他人欠款"; $("receivable-error").textContent=""; $("receivable-form").hidden=true;
}
function editReceivable(row) {
  $("receivable-id").value=row.id; $("receivable-person").value=row.person_name||""; $("receivable-subject").value=row.subject||"";
  $("receivable-amount").value=String(row.amount||""); $("receivable-date").value=row.borrowed_at||localDateString();
  $("receivable-due").value=row.due_date||""; $("receivable-note").value=row.note||"";
  $("receivable-form-title").textContent="編輯他人欠款"; $("receivable-error").textContent=""; $("receivable-form").hidden=false;
  $("receivable-form").scrollIntoView({behavior:"smooth",block:"center"});
}
async function toggleReceivableStatus(row) {
  const next=row.status === "paid" ? "pending" : "paid";
  try { await sbRequest(`/rest/v1/${RECEIVABLE_TABLE}?id=eq.${encodeURIComponent(row.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({status:next,updated_at:new Date().toISOString()})},true); await loadReceivables(); showToast(next === "paid" ? "已標記為收款完成。" : "已改回未收回。"); }
  catch(e){showToast(e.message||"更新失敗。");}
}
async function deleteReceivable(row) {
  if(!confirm(`確定刪除「${row.person_name}－${row.subject}」這筆紀錄？`)) return;
  try { await sbRequest(`/rest/v1/${RECEIVABLE_TABLE}?id=eq.${encodeURIComponent(row.id)}`,{method:"DELETE"},true); await loadReceivables(); showToast("他人欠款紀錄已刪除。"); }
  catch(e){showToast(e.message||"刪除失敗。");}
}
$("receivable-add")?.addEventListener("click",()=>{resetReceivableForm();$("receivable-form").hidden=false;$("receivable-form").scrollIntoView({behavior:"smooth",block:"center"});});
$("receivable-cancel")?.addEventListener("click",resetReceivableForm);
$("receivable-form")?.addEventListener("submit",async e=>{
  e.preventDefault(); if(!adminMode || !supabaseSession){showToast("請先登入管理帳號。");return;}
  const id=$("receivable-id").value;
  const payload={person_name:$("receivable-person").value.trim(),subject:$("receivable-subject").value.trim(),amount:Number($("receivable-amount").value),borrowed_at:$("receivable-date").value,due_date:$("receivable-due").value||null,note:$("receivable-note").value.trim(),updated_at:new Date().toISOString()};
  if(!payload.person_name||!payload.subject||!Number.isFinite(payload.amount)||payload.amount<=0||!payload.borrowed_at){$("receivable-error").textContent="請確認姓名、項目、金額及欠款日期皆已正確填寫。";return;}
  if(payload.due_date && payload.due_date < payload.borrowed_at){$("receivable-error").textContent="預計還款日不可早於欠款日期。";return;}
  const save=$("receivable-save");save.disabled=true;save.textContent="儲存中…";
  try { await sbRequest(`/rest/v1/${RECEIVABLE_TABLE}${id?`?id=eq.${encodeURIComponent(id)}`:""}`,{method:id?"PATCH":"POST",headers:{"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(payload)},true); resetReceivableForm(); await loadReceivables(); showToast(id?"欠款紀錄已更新。":"已新增他人欠款紀錄。"); }
  catch(err){$("receivable-error").textContent=err.message||"儲存失敗，請確認已執行資料庫更新 SQL。";}
  finally{save.disabled=false;save.textContent="儲存紀錄";}
});
document.querySelectorAll("[data-receivable-filter]").forEach(button=>button.addEventListener("click",()=>{receivableFilter=button.dataset.receivableFilter;document.querySelectorAll("[data-receivable-filter]").forEach(b=>b.classList.toggle("is-active",b===button));renderReceivables();}));
document.querySelectorAll("[data-debt-view]").forEach(button=>button.addEventListener("click",()=>{debtAdminView=button.dataset.debtView;document.querySelectorAll("[data-debt-view]").forEach(b=>b.classList.toggle("is-active",b===button));$("receivable-admin-area").hidden=debtAdminView!=="owed-to-me";$("reminder-admin-area").hidden=debtAdminView!=="i-owe";}));

async function updateDebtStatus(row) {
  const next = row.status === "paid" ? "pending" : "paid";
  try { await sbRequest(`/rest/v1/${DEBT_TABLE}?id=eq.${encodeURIComponent(row.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({status:next,updated_at:new Date().toISOString()})},true); await loadDebtRows(); showToast(next === "paid" ? "已標記為還款完成。" : "已改回待還款。"); }
  catch(e){showToast(e.message || "更新失敗。");}
}
let editingDebtId = null;
function closeDebtEditModal() {
  const modal = $("debt-edit-modal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  editingDebtId = null;
}
function editDebtRecord(row) {
  editingDebtId = row.id;
  $("debt-edit-sender").value = row.sender_name || "";
  $("debt-edit-subject").value = row.subject || "";
  $("debt-edit-amount").value = String(row.amount ?? "");
  $("debt-edit-note").value = row.note || "";
  $("debt-edit-error").textContent = "";
  const modal = $("debt-edit-modal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => $("debt-edit-sender").focus());
}
$("debt-edit-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!editingDebtId) return;
  const sender = $("debt-edit-sender").value.trim();
  const subject = $("debt-edit-subject").value.trim();
  const amount = Number($("debt-edit-amount").value);
  const note = $("debt-edit-note").value.trim();
  const error = $("debt-edit-error");
  if (!sender || !subject || !Number.isFinite(amount) || amount <= 0 || amount > 1000000000) {
    error.textContent = "請確認提交人、欠款項目及金額皆填寫正確。";
    return;
  }
  if (sender.length > 80 || subject.length > 200 || note.length > 1000) {
    error.textContent = "欄位內容超過字數限制。";
    return;
  }
  const save = $("debt-edit-save");
  save.disabled = true;
  save.textContent = "儲存中…";
  error.textContent = "";
  try {
    await sbRequest(`/rest/v1/${DEBT_TABLE}?id=eq.${encodeURIComponent(editingDebtId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ sender_name: sender, subject, amount, note, updated_at: new Date().toISOString() })
    }, true);
    closeDebtEditModal();
    await loadDebtRows();
    showToast("欠款提醒已更新。");
  } catch (e) {
    error.textContent = e.message || "更新失敗，請稍後再試。";
  } finally {
    save.disabled = false;
    save.textContent = "一次儲存修改";
  }
});
document.querySelectorAll("[data-debt-edit-close]").forEach(button => button.addEventListener("click", closeDebtEditModal));
document.addEventListener("keydown", event => { if (event.key === "Escape" && $("debt-edit-modal")?.classList.contains("is-open")) closeDebtEditModal(); });
async function deleteDebtRecord(row) {
  if (!confirm(`確定刪除「${row.sender_name}－${row.subject}」這筆提醒？`)) return;
  try { await sbRequest(`/rest/v1/${DEBT_TABLE}?id=eq.${encodeURIComponent(row.id)}`,{method:"DELETE"},true); await loadDebtRows(); showToast("欠款提醒已刪除。"); }
  catch(e){showToast(e.message || "刪除失敗。");}
}
$("debt-submit-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const button=$("debt-submit"); const message=$("debt-submit-message");
  if ($("debt-website").value) return;
  const payload={sender_name:$("debt-sender").value.trim(),subject:$("debt-subject").value.trim(),amount:Number($("debt-amount").value),note:$("debt-note").value.trim(),website:$("debt-website").value};
  if(!payload.sender_name || !payload.subject || !Number.isFinite(payload.amount) || payload.amount<=0){message.textContent="請完整填寫姓名、欠款事項及有效金額。";return;}
  button.disabled=true; button.textContent="送出中…"; message.textContent="正在送出提醒…";
  try { await submitDebtReminder(payload); $("debt-submit-form").reset(); message.textContent="提醒已成功送出，管理者將收到 Email 通知。"; showToast("欠款提醒已送出。"); }
  catch(err){ message.textContent=`${err.message}。若畫面顯示資料已保存但郵件失敗，請勿重複提交，管理者可登入後查看紀錄。`; }
  finally {button.disabled=false;button.textContent="✉ 送出欠款提醒";}
});
$("debt-reload")?.addEventListener("click",()=>loadDebtRows().catch(e=>showToast(e.message)));
document.querySelectorAll("[data-debt-filter]").forEach(button=>button.addEventListener("click",()=>{debtFilter=button.dataset.debtFilter;document.querySelectorAll("[data-debt-filter]").forEach(b=>b.classList.toggle("is-active",b===button));renderDebtAdmin();}));

function setActiveAppNav(page) {
  document.querySelectorAll("[data-nav-page]").forEach(button=>{
    const active=button.dataset.navPage===page;
    button.classList.toggle("is-active",active);
    if(active) button.setAttribute("aria-current","page"); else button.removeAttribute("aria-current");
  });
}
function openTool(name) {
  setActiveAppNav(name);
  if (adminMode && $("admin-payment-lists")) $("admin-payment-lists").hidden = name !== "home";
  document.querySelectorAll(".tool-panel").forEach(el=>el.hidden=true);
  document.getElementById(`${name}-tool`).hidden=false;
  if(name==="friends" && (friendViewerSession || adminMode)){ loadFriendRows().then(()=>{ $("friend-login").hidden=true; $("friend-content").hidden=false; $("friend-admin-editor").hidden=!adminMode; }).catch(err=>{ if(!adminMode) saveFriendViewerSession(null); console.warn(err); }); }
  if(name==="market") { renderMarketCards(); if(!Object.keys(marketQuotes).length) loadMarketQuotes(); }
  if(name==="debt") {
    $("debt-admin-area").hidden=!adminMode;
    if(adminMode) loadDebtRows().catch(err=>showToast(err.message || "無法讀取欠款紀錄。"));
  }
  document.querySelector(".sections").hidden=true;
  document.querySelector(".search-panel").hidden=true;
  document.getElementById("search-empty").hidden=true;
  document.getElementById(`${name}-tool`).scrollIntoView({behavior:"smooth",block:"start"});
}
function closeTools() {
  if (adminMode && $("admin-payment-lists")) $("admin-payment-lists").hidden = false;
  document.querySelectorAll(".tool-panel").forEach(el=>el.hidden=true);
  document.querySelector(".sections").hidden=false;
  document.querySelector(".search-panel").hidden=false;
  setActiveAppNav("home");
}
document.querySelectorAll("[data-nav-page]").forEach(button=>button.addEventListener("click",()=>{
  const page=button.dataset.navPage;
  if(page==="home") closeTools(); else openTool(page);
}));
document.querySelectorAll("[data-open-tool]").forEach(b=>b.addEventListener("click",()=>openTool(b.dataset.openTool)));
document.querySelectorAll("[data-close-tool]").forEach(b=>b.addEventListener("click",closeTools));
$("friend-login-btn")?.addEventListener("click",async()=>{
  const pw=$("friend-password").value;
  if(!pw){$("friend-login-message").textContent="請輸入共用密碼。";return;}
  try{await enterFriendDirectory(pw);}catch(e){$("friend-login-message").textContent="登入失敗，請確認共用密碼。";console.warn(e);}
});
$("friend-password")?.addEventListener("keydown",e=>{if(e.key==="Enter")$("friend-login-btn").click();});
$("friend-logout")?.addEventListener("click",()=>{saveFriendViewerSession(null);friendRows=[];$("friend-content").hidden=true;$("friend-login").hidden=false;$("friend-password").value="";});
$("friend-search")?.addEventListener("input",renderFriendRows);
$("friend-form-reset")?.addEventListener("click",resetFriendForm);
$("friend-form")?.addEventListener("submit",async e=>{
  e.preventDefault(); if(!adminMode || !supabaseSession){showToast("請先以管理員身分登入，再管理親友資料。");return;}
  const id=$("friend-id").value;
  const payload={name:$("friend-name").value.trim(),bank_name:$("friend-bank").value.trim(),bank_code:$("friend-code").value.trim(),branch_name:$("friend-branch").value.trim(),account_number:$("friend-account").value.trim(),note:$("friend-note").value.trim(),is_active:$("friend-active").checked};
  try{
    await friendRequest(`/rest/v1/${FRIENDS_TABLE}${id?`?id=eq.${encodeURIComponent(id)}`:""}`,{method:id?"PATCH":"POST",headers:{"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(payload)},true);
    resetFriendForm(); await loadFriendRows(); showToast("親友資料已儲存。");
  }catch(err){showToast(err.message||"儲存失敗。");}
});

/* ---------- Taiwan Bank exchange rates ---------- */
let fxRates = {};
let fxUpdatedAt = "";
let fxSourceLabel = "";
const FX_CURRENCY_NAMES = {USD:"美金",JPY:"日圓",KRW:"韓元",AUD:"澳幣",CNY:"人民幣"};

async function fetchBotCsv() {
  const target = "https://rate.bot.com.tw/xrt/flcsv/0/day";
  const urls = [
    target,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`
  ];
  let lastError;
  for (const url of urls) {
    try {
      const res = await fetch(url, {cache:"no-store"});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      if (!csv.includes("日圓") && !csv.includes("美金")) throw new Error("回傳內容不是台銀匯率 CSV");
      return csv;
    } catch (err) { lastError = err; }
  }
  throw lastError || new Error("無法取得台銀匯率");
}

async function fetchReferenceRates() {
  const res = await fetch("https://open.er-api.com/v6/latest/TWD", {cache:"no-store"});
  if (!res.ok) throw new Error(`參考匯率服務 HTTP ${res.status}`);
  const data = await res.json();
  if (data.result !== "success" || !data.rates) throw new Error("參考匯率資料格式錯誤");
  const out = {};
  for (const code of Object.keys(FX_CURRENCY_NAMES)) {
    const perTwd = Number(data.rates[code]);
    if (!Number.isFinite(perTwd) || perTwd <= 0) continue;
    // Public market reference rate only; not a bank buy/sell quote.
    const twdPerUnit = 1 / perTwd;
    out[code] = {cashBuy:twdPerUnit, cashSell:twdPerUnit, spotBuy:twdPerUnit, spotSell:twdPerUnit, reference:true};
  }
  if (!Object.keys(out).length) throw new Error("沒有可用的參考匯率");
  return out;
}

async function loadFxRates() {
  const detail = $("fx-rate-detail");
  const result = $("fx-result");
  if (detail) detail.textContent = "正在更新匯率資料…";
  if (result) result.textContent = "載入中…";
  try {
    const csv = await fetchBotCsv();
    const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    const map = Object.fromEntries(Object.entries(FX_CURRENCY_NAMES).map(([k,v]) => [v,k]));
    const parsed = {};
    for (const line of lines.slice(1)) {
      const cols = line.split(",");
      const code = (cols[0] || "").trim();
      const key = map[code];
      if (!key) continue;
      const nums = cols.slice(1,5).map(v => Number.parseFloat(v));
      if (nums.some(v => !Number.isFinite(v))) continue;
      parsed[key] = {cashBuy:nums[0], cashSell:nums[1], spotBuy:nums[2], spotSell:nums[3], reference:false};
    }
    if (Object.keys(parsed).length < 5) throw new Error("台銀資料缺少所需幣別");
    fxRates = parsed;
    fxSourceLabel = "台灣銀行牌告匯率";
    fxUpdatedAt = new Date().toLocaleString("zh-TW", {timeZone:"Asia/Taipei"});
    updateFxResult();
  } catch (botError) {
    console.warn("BOT rate fetch failed; trying public reference rates", botError);
    try {
      fxRates = await fetchReferenceRates();
      fxSourceLabel = "公開市場參考匯率（非台灣銀行牌告；買賣價差及現鈔加減碼未計）";
      fxUpdatedAt = new Date().toLocaleString("zh-TW", {timeZone:"Asia/Taipei"});
      updateFxResult();
    } catch (fallbackError) {
      fxRates = {};
      if (detail) detail.textContent = "目前無法取得匯率資料，請稍後重試。可至台灣銀行官網查詢最新牌告匯率。";
      if (result) result.textContent = "暫無匯率";
      console.warn("FX reference rate fetch failed", fallbackError);
    }
  }
}

let fxInputMode = "foreign";

function syncFxInputMode() {
  const foreignInput = $("fx-foreign");
  const twdInput = $("fx-twd");
  const label = $("fx-direction-label");
  const toggle = $("fx-direction-toggle");
  if (!foreignInput || !twdInput) return;

  const foreignIsInput = fxInputMode === "foreign";
  foreignInput.readOnly = !foreignIsInput;
  twdInput.readOnly = foreignIsInput;
  foreignInput.placeholder = foreignIsInput ? "輸入外幣金額" : "自動計算";
  twdInput.placeholder = foreignIsInput ? "自動計算" : "輸入台幣金額";
  foreignInput.classList.toggle("fx-output-field", !foreignIsInput);
  twdInput.classList.toggle("fx-output-field", foreignIsInput);
  if (label) label.textContent = foreignIsInput ? "目前方向：外幣 → 台幣" : "目前方向：台幣 → 外幣";
  if (toggle) toggle.textContent = foreignIsInput ? "切換為台幣換外幣" : "切換為外幣換台幣";
}

function updateFxResult() {
  const currency = $("fx-currency").value;
  const type = $("fx-type").value;
  const rate = fxRates[currency];
  if (!rate) { $("fx-result").textContent = "暫無匯率"; return; }
  const buy = type === "cash" ? rate.cashBuy : rate.spotBuy;
  const sell = type === "cash" ? rate.cashSell : rate.spotSell;

  if (fxInputMode === "foreign") {
    const foreign = Number.parseFloat($("fx-foreign").value);
    $("fx-twd").value = Number.isFinite(foreign) && foreign >= 0
      ? (foreign * buy).toFixed(2) : "";
    $("fx-result-label").textContent = "外幣換算台幣（估算）";
    $("fx-result").textContent = Number.isFinite(foreign) && foreign >= 0
      ? `NT$ ${(foreign * buy).toLocaleString("zh-TW", {maximumFractionDigits:2})}` : "請輸入外幣金額";
  } else {
    const twd = Number.parseFloat($("fx-twd").value);
    $("fx-foreign").value = Number.isFinite(twd) && twd >= 0
      ? (twd / sell).toFixed(2) : "";
    $("fx-result-label").textContent = "台幣換算外幣（估算）";
    $("fx-result").textContent = Number.isFinite(twd) && twd >= 0
      ? `${(twd / sell).toLocaleString("zh-TW", {maximumFractionDigits:2})} ${currency}` : "請輸入台幣金額";
  }

  const rateType = type === "cash" ? "現金" : "即期";
  if (rate.reference) {
    $("fx-rate-detail").textContent = `${fxSourceLabel}｜${rateType}模式以同一參考價估算：${buy.toFixed(4)} TWD/${currency}｜更新：${fxUpdatedAt}。實際銀行買賣匯率可能不同。`;
  } else {
    $("fx-rate-detail").textContent = `${fxSourceLabel}｜${rateType}買入 ${buy}／賣出 ${sell}｜頁面更新：${fxUpdatedAt}。實際成交匯率及手續費以銀行為準。`;
  }
}

$("fx-direction-toggle")?.addEventListener("click", () => {
  fxInputMode = fxInputMode === "foreign" ? "twd" : "foreign";
  if (fxInputMode === "foreign") $("fx-twd").value = "";
  else $("fx-foreign").value = "";
  syncFxInputMode();
  updateFxResult();
  const target = fxInputMode === "foreign" ? $("fx-foreign") : $("fx-twd");
  target?.focus();
});
$("fx-foreign")?.addEventListener("input", () => {
  if (fxInputMode === "foreign") updateFxResult();
});
$("fx-twd")?.addEventListener("input", () => {
  if (fxInputMode === "twd") updateFxResult();
});
["fx-type","fx-currency"].forEach(id => $(id)?.addEventListener("change", updateFxResult));
$("fx-refresh")?.addEventListener("click", loadFxRates);
syncFxInputMode();

/* ---------- Startup ---------- ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  startLiveClock();
  loadFriendViewerSession();
  loadFxRates();
  initTheme();
  favorites = loadFavorites();
  supabaseSession = getSession();
  BANKS.splice(0, BANKS.length, ...personalData.banks);
  EWALLETS.splice(0, EWALLETS.length, ...personalData.ewallets);
  renderAll();
  setupObservers();
  renderFavorites();
  applySearch();
  renderHistory();
  animateOverview();
  headerFadeIn();
  try {
    if (supabaseSession && !await ensureSessionFresh()) supabaseSession = null;
    await loadCloudPayments();
  } catch (error) {
    console.error("Supabase connection failed:", error);
    showToast("雲端資料讀取失敗，暫時顯示本機預設資料。請檢查網路或 Supabase 設定。", 5000);
  }
});

/* ---------- Back to top ---------- */
const backToTopButton = document.getElementById("back-to-top");
window.addEventListener("scroll",()=>backToTopButton?.classList.toggle("is-visible",window.scrollY>360),{passive:true});
backToTopButton?.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));

/* ---------- Market Watch: source-aware quote and chart integration ---------- */
const MARKET_STORAGE_KEY="payment-hub-market-watchlist";
const MARKET_DEFAULT_WATCH=["GOLD","IXIC","NDX","DJI","SPX","TWII"];
const MARKET_SYMBOLS=[
  {id:"GOLD",name:"黃金現貨",code:"XAU/USD",group:"gold",unit:"USD / oz",providerSymbol:"XAUUSD=X"},
  {id:"IXIC",name:"NASDAQ 綜合指數",code:"NASDAQ",group:"us",unit:"點",providerSymbol:"^IXIC"},
  {id:"NDX",name:"NASDAQ 100",code:"NASDAQ 100",group:"us",unit:"點",providerSymbol:"^NDX"},
  {id:"DJI",name:"道瓊工業指數",code:"DOW JONES",group:"us",unit:"點",providerSymbol:"^DJI"},
  {id:"SPX",name:"S&P 500",code:"S&P 500",group:"us",unit:"點",providerSymbol:"^GSPC"},
  {id:"TWII",name:"台灣加權指數",code:"TAIEX",group:"tw",unit:"點",providerSymbol:"^TWII"}
];
const MARKET_CHART_RANGES={day:{label:"日線",range:"1d",interval:"5m"},week:{label:"週線",range:"5d",interval:"30m"},month:{label:"月線",range:"1mo",interval:"1d"}};
let marketQuotes={},marketSelected="GOLD",marketRange="day",marketLastUpdated="",marketHistoryRequest=0,marketQuoteRequest=0,marketWatchlist=loadMarketWatchlist();
function loadMarketWatchlist(){try{const saved=JSON.parse(localStorage.getItem(MARKET_STORAGE_KEY)||"null");if(Array.isArray(saved))return [...new Set(saved.filter(id=>MARKET_SYMBOLS.some(s=>s.id===id)))];}catch(e){console.warn("Market watchlist local data error",e);}return [...MARKET_DEFAULT_WATCH];}
function saveMarketWatchlist(){try{localStorage.setItem(MARKET_STORAGE_KEY,JSON.stringify(marketWatchlist));}catch(e){console.warn("Cannot save market watchlist",e);}}
function marketNumber(v,d=2){return Number(v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});}
function marketQuoteAge(t){return t?new Date(t*1000).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}):"報價時間未知";}
function marketCard(s){const q=marketQuotes[s.id],selected=marketSelected===s.id,watched=marketWatchlist.includes(s.id),price=q&&Number.isFinite(q.price)?marketNumber(q.price):"暫無報價",age=q?marketQuoteAge(q.timestamp):"尚無可用時間",change=q&&Number.isFinite(q.change)&&Number.isFinite(q.changePercent)?(q.change>0?"+":"")+marketNumber(q.change)+" ("+(q.change>0?"+":"")+marketNumber(q.changePercent)+"%)":"漲跌資料暫缺",trend=q?(q.change>0?"up":q.change<0?"down":"flat"):"flat";return '<article class="market-card '+(selected?"is-selected":"")+'"><div class="market-card-top"><div class="market-card-name"><strong>'+s.name+'</strong><small>'+s.code+' · '+s.unit+'</small></div><button type="button" class="market-star '+(watched?"is-active":"")+'" data-market-watch="'+s.id+'" aria-label="'+(watched?"移除自選":"加入自選")+'" aria-pressed="'+watched+'">★</button></div><button type="button" class="market-select" data-market-select="'+s.id+'"><span class="market-price">'+price+'</span><span class="market-change '+trend+'">'+(q?change:"尚未取得報價")+'</span></button><div class="market-card-foot"><span>'+(q?"Yahoo Finance · 可能延遲":"資料尚未取得")+'</span><span>'+age+'</span></div></article>';}
function renderMarketCards(){const render=(id,list)=>{const el=$(id);if(el)el.innerHTML=list.length?list.map(marketCard).join(""):'<div class="market-empty">尚未加入自選標的。</div>';};render("market-watchlist",MARKET_SYMBOLS.filter(s=>marketWatchlist.includes(s.id)));render("market-gold",MARKET_SYMBOLS.filter(s=>s.group==="gold"));render("market-us",MARKET_SYMBOLS.filter(s=>s.group==="us"));render("market-tw",MARKET_SYMBOLS.filter(s=>s.group==="tw"));}
async function fetchYahooChart(symbol,range,interval){const endpoint="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?range="+encodeURIComponent(range)+"&interval="+encodeURIComponent(interval),urls=["https://proxy.cors.dev/"+endpoint,"https://api.allorigins.win/raw?url="+encodeURIComponent(endpoint)];let last;for(const url of urls){try{const r=await fetch(url,{cache:"no-store",credentials:"omit",signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error("行情服務 HTTP "+r.status);const data=await r.json(),result=data?.chart?.result?.[0];if(data?.chart?.error)throw new Error(data.chart.error.description||"行情來源回傳錯誤");if(!result?.meta)throw new Error("行情資料格式不完整");return result;}catch(e){last=e;}}throw last||new Error("目前無法連接行情來源");}
function quoteFromChart(result){const m=result.meta||{},values=(result.indicators?.quote?.[0]?.close||[]).filter(Number.isFinite),price=Number.isFinite(m.regularMarketPrice)?m.regularMarketPrice:(values.length?values[values.length-1]:null),previous=Number.isFinite(m.chartPreviousClose)?m.chartPreviousClose:m.previousClose,change=Number.isFinite(price)&&Number.isFinite(previous)?price-previous:null;return {price,change,changePercent:Number.isFinite(change)&&previous?change/previous*100:null,timestamp:m.regularMarketTime||((result.timestamp||[]).filter(Boolean).slice(-1)[0]||null),currency:m.currency||""};}
async function loadMarketQuotes(){const status=$("market-status"),dot=$("market-live-dot"),button=$("market-refresh"),request=++marketQuoteRequest;if(status)status.textContent=Object.keys(marketQuotes).length?"正在更新行情；保留上次成功資料…":"正在連線取得市場資料…";if(dot)dot.classList.remove("is-live");if(button){button.disabled=true;button.textContent="更新中…";}const results=await Promise.allSettled(MARKET_SYMBOLS.map(async s=>[s.id,quoteFromChart(await fetchYahooChart(s.providerSymbol,"1d","1d"))]));if(request!==marketQuoteRequest)return;let successes=0;const next={...marketQuotes};results.forEach((r,i)=>{if(r.status==="fulfilled"&&Number.isFinite(r.value[1].price)){next[r.value[0]]=r.value[1];successes++;}else console.warn("Market quote unavailable:",MARKET_SYMBOLS[i].id,r.reason);});marketQuotes=next;if(successes)marketLastUpdated=new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei"});renderMarketCards();if(status){const times=MARKET_SYMBOLS.map(s=>marketQuotes[s.id]?.timestamp).filter(Boolean).map(t=>t*1000),latest=times.length?new Date(Math.max(...times)).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):"無可用報價時間";if(successes){status.textContent=successes+" / 6 項更新成功｜頁面更新："+marketLastUpdated+"｜最新來源報價時間："+latest;if(dot)dot.classList.add("is-live");}else status.textContent=Object.keys(marketQuotes).length?"本次更新失敗，保留上次成功資料；來源報價時間不變。":"目前無法取得行情，請稍後重試。";}if(button){button.disabled=false;button.textContent="↻ 更新行情";}if(!marketHistoryRequest)renderMarketChart();}
function drawMarketChart(points){const el=$("market-chart"),values=points.map(p=>p.value).filter(Number.isFinite);if(!el)return;if(values.length<2){el.innerHTML='<div class="market-empty">此期間暫無足夠的歷史走勢資料。</div>';return;}const w=900,h=220,p=18,min=Math.min(...values),max=Math.max(...values),span=max-min||Math.abs(max)*.001||1,xy=values.map((v,i)=>({x:p+(w-p*2)*i/(values.length-1),y:h-p-(v-min)/span*(h-p*2)})),line=xy.map(q=>q.x.toFixed(1)+","+q.y.toFixed(1)).join(" "),area="M "+xy[0].x+" "+(h-p)+" L "+xy.map(q=>q.x+" "+q.y).join(" L ")+" L "+xy[xy.length-1].x+" "+(h-p)+" Z";el.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="市場歷史走勢圖"><defs><linearGradient id="market-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#287fc7" stop-opacity=".28"/><stop offset="100%" stop-color="#287fc7" stop-opacity=".02"/></linearGradient></defs><path d="'+area+'" fill="url(#market-area-fill)"/><polyline points="'+line+'" fill="none" stroke="#287fc7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="'+p+'" y1="'+(h-p)+'" x2="'+(w-p)+'" y2="'+(h-p)+'" stroke="currentColor" opacity=".16"/></svg>';}
async function renderMarketChart(){const s=MARKET_SYMBOLS.find(x=>x.id===marketSelected);if(!s)return;const req=++marketHistoryRequest;$("market-chart-title").textContent=s.name+" 走勢";$("market-chart-meta").textContent=MARKET_CHART_RANGES[marketRange].label+"｜"+s.unit+"｜來源：Yahoo Finance（可能延遲）";$("market-chart").innerHTML='<div class="market-empty">正在載入歷史走勢…</div>';try{const cfg=MARKET_CHART_RANGES[marketRange],r=await fetchYahooChart(s.providerSymbol,cfg.range,cfg.interval);if(req!==marketHistoryRequest)return;const ts=r.timestamp||[],closes=r.indicators?.quote?.[0]?.close||[],points=ts.map((time,i)=>({time,value:closes[i]})).filter(x=>Number.isFinite(x.value));drawMarketChart(points);$("market-chart-note").textContent="來源：Yahoo Finance Chart 資料服務；最後資料點："+(points.length?marketQuoteAge(points[points.length-1].time):"未知")+"。歷史資料時間可能與報價卡不同。";}catch(e){if(req!==marketHistoryRequest)return;console.warn("Market history unavailable",e);$("market-chart").innerHTML='<div class="market-empty">目前無法取得此標的的歷史走勢。請稍後重試；不會以模擬數值取代。</div>';$("market-chart-note").textContent="歷史走勢目前不可用；上方報價卡不會因圖表失敗而被虛構值覆蓋。";}}
document.addEventListener("click",event=>{const watch=event.target.closest("[data-market-watch]");if(watch){const id=watch.dataset.marketWatch;marketWatchlist=marketWatchlist.includes(id)?marketWatchlist.filter(x=>x!==id):[...marketWatchlist,id];saveMarketWatchlist();renderMarketCards();return;}const select=event.target.closest("[data-market-select]");if(select){marketSelected=select.dataset.marketSelect;renderMarketCards();renderMarketChart();}});
document.querySelectorAll("[data-market-range]").forEach(button=>button.addEventListener("click",()=>{marketRange=button.dataset.marketRange;document.querySelectorAll("[data-market-range]").forEach(b=>b.classList.toggle("is-active",b===button));renderMarketChart();}));
$("market-refresh")?.addEventListener("click",loadMarketQuotes);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&document.querySelector("#market-tool:not([hidden])"))loadMarketQuotes();});
setInterval(()=>{if(!document.hidden&&document.querySelector("#market-tool:not([hidden])"))loadMarketQuotes();},300000);



/* PAYMENT_HUB_GOLD_ONLY_FIX_V2
 * Isolated gold quote/history integration. Does not replace shared index quote loaders.
 */
(() => {
  const GOLD_CACHE_KEY = "payment-hub-gold-quote-cache-v2";
  const GOLD_SYMBOL = "XAUUSD=X";
  let goldRequestInFlight = null;
  let goldChartRequestId = 0;

  function goldToSeconds(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 1000000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }

  function goldFormatPrice(value) {
    return Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function goldReadCache() {
    try {
      const value = JSON.parse(localStorage.getItem(GOLD_CACHE_KEY) || "null");
      if (value && Number.isFinite(Number(value.price)) && Number(value.price) > 0) {
        return {
          price: Number(value.price),
          change: null,
          changePercent: null,
          timestamp: goldToSeconds(value.timestamp),
          source: "XAUS",
          stale: true,
          cached: true
        };
      }
    } catch (error) {
      console.warn("Gold cache unavailable", error);
    }
    return null;
  }

  function goldApplyCardText() {
    if (typeof marketQuotes === "undefined") return;
    const quote = marketQuotes.GOLD;
    document.querySelectorAll('[data-market-card="GOLD"]').forEach(card => {
      const priceNode = card.querySelector(".market-price");
      const changeNode = card.querySelector(".market-change");
      const footNodes = card.querySelectorAll(".market-card-foot span");

      if (priceNode) {
        priceNode.textContent = quote && Number.isFinite(Number(quote.price))
          ? goldFormatPrice(quote.price)
          : "暫無報價";
      }
      if (changeNode) {
        changeNode.classList.remove("up", "down");
        changeNode.classList.add("flat");
        if (quote && Number.isFinite(Number(quote.price))) {
          changeNode.textContent = quote.stale
            ? "上次成功取得的黃金參考價（資料可能延遲）"
            : "黃金現貨中間參考價";
        } else {
          changeNode.textContent = "XAUS 黃金資料尚未取得";
        }
      }
      if (footNodes[0]) {
        footNodes[0].textContent = quote
          ? (quote.stale ? "XAUS · 上次成功資料" : "XAUS · 黃金現貨")
          : "XAUS 黃金資料";
      }
      if (footNodes[1]) {
        footNodes[1].textContent = quote && quote.timestamp
          ? marketQuoteAge(quote.timestamp)
          : "尚無可用時間";
      }
    });
  }

  async function goldFetchJson(path, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://xaus.com/api/v1/" + path, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      const raw = await response.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (_) {
        throw new Error("XAUS 回傳內容不是有效 JSON");
      }
      if (!response.ok) {
        throw new Error(data?.error || ("XAUS HTTP " + response.status));
      }
      if (data?.data_state?.status === "unavailable") {
        throw new Error(data.error || "XAUS 暫時沒有可用的黃金資料");
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function refreshGoldOnly() {
    if (goldRequestInFlight) return goldRequestInFlight;

    goldRequestInFlight = (async () => {
      // Show last successful gold value immediately, clearly marked as cached.
      if (!marketQuotes.GOLD) {
        const cached = goldReadCache();
        if (cached) {
          marketQuotes.GOLD = cached;
          if (typeof renderMarketCards === "function") renderMarketCards();
          goldApplyCardText();
        }
      }

      try {
        const data = await goldFetchJson("spot?compact=1");
        const price = Number(data.spot_usd_oz ?? data.xau?.price);
        const state = data.data_state?.status || (data.stale ? "stale" : "fresh");
        if (!Number.isFinite(price) || price <= 0 || state === "unavailable") {
          throw new Error("XAUS 沒有提供有效的黃金現貨價格");
        }

        const asOf = data.price_as_of || data.data_state?.as_of || data.updated_at;
        const quote = {
          price,
          change: null,
          changePercent: null,
          timestamp: goldToSeconds(asOf),
          source: "XAUS",
          stale: state !== "fresh",
          cached: false,
          asOf: asOf || null,
          ageSeconds: Number.isFinite(Number(data.data_state?.age_seconds))
            ? Number(data.data_state.age_seconds) : null
        };

        marketQuotes.GOLD = quote;
        try {
          localStorage.setItem(GOLD_CACHE_KEY, JSON.stringify({
            price: quote.price,
            timestamp: quote.timestamp,
            asOf: quote.asOf
          }));
        } catch (error) {
          console.warn("Gold cache could not be saved", error);
        }

        if (typeof renderMarketCards === "function") renderMarketCards();
        goldApplyCardText();
      } catch (error) {
        console.warn("Gold-only refresh failed", error);
        // Do not clear an existing successful quote on a temporary API failure.
        if (marketQuotes.GOLD) {
          marketQuotes.GOLD = { ...marketQuotes.GOLD, stale: true, cached: true };
        }
        if (typeof renderMarketCards === "function") renderMarketCards();
        goldApplyCardText();
      }
    })().finally(() => {
      goldRequestInFlight = null;
    });

    return goldRequestInFlight;
  }

  function goldHistoryTime(value) {
    return goldToSeconds(value);
  }

  async function fetchGoldHistory(range) {
    if (range === "day") {
      const data = await goldFetchJson("intraday?symbol=xau&hours=24");
      const rows = Array.isArray(data.points) ? data.points : [];
      return rows.map(row => ({
        time: goldHistoryTime(row.t ?? row.time ?? row.timestamp),
        value: Number(row.p ?? row.price ?? row.close ?? row.c)
      })).filter(point => point.time && Number.isFinite(point.value))
        .sort((a, b) => a.time - b.time);
    }

    const data = await goldFetchJson("history");
    const rows = Array.isArray(data.points) ? data.points : [];
    const days = range === "week" ? 7 : 31;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return rows.map(row => ({
      time: goldHistoryTime(row.d ?? row.date ?? row.t ?? row.timestamp),
      value: Number(row.c ?? row.close ?? row.p ?? row.price)
    })).filter(point => point.time && point.time * 1000 >= cutoff && Number.isFinite(point.value))
      .sort((a, b) => a.time - b.time);
  }

  const originalFetchYahooChart = fetchYahooChart;
  fetchYahooChart = async function(symbol, range, interval) {
    // Yahoo is used for the five indices only; XAU uses XAUS exclusively.
    if (symbol === GOLD_SYMBOL) {
      throw new Error("黃金行情改由 XAUS 獨立資料來源提供");
    }
    return originalFetchYahooChart(symbol, range, interval);
  };

  const originalRenderMarketCards = renderMarketCards;
  renderMarketCards = function() {
    originalRenderMarketCards();
    goldApplyCardText();
  };

  const originalRenderMarketChart = renderMarketChart;
  renderMarketChart = async function() {
    if (marketSelected !== "GOLD") {
      return originalRenderMarketChart();
    }

    const requestId = ++goldChartRequestId;
    const symbol = MARKET_SYMBOLS.find(item => item.id === "GOLD");
    const rangeConfig = MARKET_CHART_RANGES[marketRange];

    $("market-chart-title").textContent = (symbol?.name || "黃金現貨") + " 走勢";
    $("market-chart-meta").textContent = rangeConfig.label + "｜USD / oz｜來源：XAUS";
    $("market-chart").innerHTML = '<div class="market-empty">正在載入 XAUS 黃金歷史資料…</div>';
    $("market-chart-note").textContent = "歷史資料時間可能與現貨報價時間不同。";

    try {
      const points = await fetchGoldHistory(marketRange);
      if (requestId !== goldChartRequestId || marketSelected !== "GOLD") return;
      if (!Array.isArray(points) || points.length < 2) {
        throw new Error("此期間目前沒有足夠的黃金歷史資料點");
      }
      drawMarketChart(points);
      const lastPoint = points[points.length - 1];
      $("market-chart-note").textContent =
        "來源：XAUS 黃金資料 API｜最後資料點：" + marketQuoteAge(lastPoint.time) +
        "。此為歷史參考資料，不代表即時成交價。";
    } catch (error) {
      if (requestId !== goldChartRequestId || marketSelected !== "GOLD") return;
      console.warn("XAUS gold history unavailable", error);
      $("market-chart").innerHTML =
        '<div class="market-empty">目前無法取得黃金歷史走勢；請稍後重試，不會以模擬數值取代。</div>';
      $("market-chart-note").textContent =
        "來源：XAUS。若日內資料尚未累積，日線可能暫時沒有足夠資料；週線及月線使用每日歷史收盤資料。";
    }
  };

  const originalOpenTool = openTool;
  openTool = function(name) {
    const result = originalOpenTool.apply(this, arguments);
    if (name === "market") refreshGoldOnly();
    return result;
  };

  $("market-refresh")?.addEventListener("click", refreshGoldOnly);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && document.querySelector("#market-tool:not([hidden])")) {
      refreshGoldOnly();
    }
  });

  setInterval(() => {
    if (!document.hidden && document.querySelector("#market-tool:not([hidden])")) {
      refreshGoldOnly();
    }
  }, 120000);

  // Restore the gold cache into memory before the first market render when present.
  const initialGoldCache = goldReadCache();
  if (!marketQuotes.GOLD && initialGoldCache) marketQuotes.GOLD = initialGoldCache;
})();

