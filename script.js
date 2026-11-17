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
  "013": "https://static01-ipass.cdn.hinet.net/ipassweb/iPassWebV2/Images/Card/Bank500/bank-500-24.png",
  "822": "https://unitednpl.com/storage/2025/12/CTBC-Bank.png",
  "812": "https://prod-s3.pxpayplus.com/MKT_Event/Event_Img/Partner_Logo/Partner_TaishinBank.png",
  "103": "https://cdn.brandfetch.io/idsW5ztmfi/w/2048/h/2048/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1760344175612",
  "808": "https://www.asifma.org/wp-content/uploads/2024/07/esun.png",
  "807": "https://www.temenos.com/wp-content/uploads/2019/06/client-sinopac-square-image-19-jun-27.jpg",
  "700": "https://taipei2026.post.gov.tw/taipei2026/en/images/index-2-04.png",
  "004": "https://color-matching.s3.ap-northeast-1.amazonaws.com/color-image/%E8%87%BA%E7%81%A3%E9%8A%80%E8%A1%8C%EF%BC%8C%E6%A8%99%E8%AA%8C%EF%BC%9A%EF%BC%91.jpg"
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
  adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}
function exitAdminMode() {
  adminMode = false;
  adminPanel.hidden = true;
  editor.hidden = true;
  adminToggle.textContent = "Admin Mode";
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

/* ---------- Startup ---------- ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  startLiveClock();
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
