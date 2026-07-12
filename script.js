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
    name: "樂天銀行",
    code: "826",
    account: "8120100248962",
    image: "images/樂天.jpg",
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
const toastEl = document.getElementById("toast");
const qrModal = document.getElementById("qr-modal");
const modalImg = document.getElementById("modal-img");
const modalCaption = document.getElementById("modal-caption");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");
const usdtAddressEl = document.getElementById("usdt-address");
const copyUsdtBtn = document.getElementById("copy-usdt");

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

function showToast(text = "Copied Successfully", duration = 2000) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => {
    toastEl.classList.remove("show");
  }, duration);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied Successfully");
  } catch (err) {
    console.error("Copy failed", err);
    showToast("Copy failed");
  }
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
function openModal(imgSrc, caption = "") {
  modalImg.src = imgSrc;
  modalCaption.textContent = caption;
  qrModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  qrModal.setAttribute("aria-hidden", "true");
  modalImg.src = "";
  document.body.style.overflow = "";
}

/* ---------- Render functions ---------- */

function makeBankCard(bank) {
  const card = createEl("div", { class: "card glass" });

  // media area (QR or placeholder)
  const media = createEl("div", { class: "card-media center" });
  if (bank.hasQr && bank.image) {
    const img = createEl("img", { class: "card-img qr-img", src: bank.image, alt: `${bank.name} QR`, "data-full": bank.image });
    media.appendChild(img);
    // clicking image opens modal
    img.addEventListener("click", (e) => openModal(bank.image, `${bank.name} - ${bank.code}`));
  } else {
    const coming = createEl("div", { class: "center", style: "flex-direction:column; padding:12px; color:#f0f0f0;" },
      createEl("div", {}, "Coming Soon"),
      createEl("small", { class: "muted", style: "margin-top:6px; font-size:12px;" }, "QR Coming Soon")
    );
    media.appendChild(coming);
  }

  // body
  const body = createEl("div", { class: "card-body" });
  const name = createEl("h4", { class: "card-name" }, bank.name);
  const meta = createEl("div", { class: "meta" },
    createEl("div", { class: "code" }, `Code: ${bank.code}`),
    createEl("div", { class: "muted" }, `Account`)
  );
  const acc = createEl("pre", { class: "address" }, bank.account);

  const actions = createEl("div", { class: "card-actions" });
  const copyBtn = createEl("button", { class: "btn ripple" }, "Copy");
  copyBtn.addEventListener("click", async (e) => {
    createRipple(e);
    await copyText(`${bank.account}`);
  });

  actions.appendChild(copyBtn);

  body.appendChild(name);
  body.appendChild(meta);
  body.appendChild(acc);
  body.appendChild(actions);

  card.appendChild(media);
  card.appendChild(body);

  return card;
}

function makeEwalletCard(ew) {
  const card = createEl("div", { class: "card glass" });

  const media = createEl("div", { class: "card-media center" });
  const img = createEl("img", { class: "card-img qr-img", src: ew.image, alt: ew.name, "data-full": ew.image });
  img.addEventListener("click", () => openModal(ew.image, ew.name));
  media.appendChild(img);

  const body = createEl("div", { class: "card-body" });
  const name = createEl("h4", { class: "card-name" }, ew.name);
  const desc = createEl("p", { class: "muted" }, "Tap to enlarge QR");

  const actions = createEl("div", { class: "card-actions" });
  const copyBtn = createEl("button", { class: "btn ripple" }, "Copy Provider");
  copyBtn.addEventListener("click", async (e) => {
    createRipple(e);
    await copyText(ew.name);
  });

  actions.appendChild(copyBtn);

  body.appendChild(name);
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

/* ---------- Events ---------- */
copyUsdtBtn.addEventListener("click", async (e) => {
  createRipple(e);
  await copyText(USDT_ADDRESS);
});

/* Modal events */
modalOverlay.addEventListener("click", closeModal);
modalClose.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* Delegated click for clicking any .qr-img to open modal (covers dynamically created) */
document.addEventListener("click", (e) => {
  const target = e.target;
  if (target.matches(".qr-img")) {
    const src = target.dataset.full || target.src;
    const caption = target.alt || "";
    openModal(src, caption);
  }
});

/* Add ripple to all future .ripple buttons through delegation */
document.addEventListener("pointerdown", (e) => {
  const btn = e.target.closest(".ripple");
  if (btn) createRipple({ currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
});

/* IntersectionObserver for card reveal animations */
function setupObservers() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll(".card").forEach(c => observer.observe(c));
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
  renderAll();
  setupObservers();
  headerFadeIn();
});
