import { firebaseConfig, usernameDomain } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const CATEGORIES = [
  { id: "icecekler", label: "İçecekler", color: "#e5f2f5" },
  { id: "atistirmaliklar", label: "Atıştırmalıklar", color: "#f6eddc" },
  { id: "dondurma", label: "Dondurma", color: "#f8e7ef" },
  { id: "gozleme", label: "Gözleme", color: "#e8f2e5" },
  { id: "tost", label: "Tost", color: "#faecd9" },
  { id: "nargile", label: "Nargile", color: "#eee7f6" }
];

const DEFAULT_PRODUCTS = [
  ["icecekler","Çay"], ["icecekler","Su"], ["icecekler","Sade Soda"], ["icecekler","Meyveli Soda"],
  ["icecekler","Kivili Oralet"], ["icecekler","Kekikli Oralet"], ["icecekler","Nane Limonlu Oralet"],
  ["icecekler","Sade Türk Kahvesi"], ["icecekler","Sütlü Nescafe"], ["icecekler","Limonata"],
  ["icecekler","Churchill"], ["icecekler","Büyük Termos"], ["icecekler","Küçük Termos"], ["icecekler","Semaver"],
  ["icecekler","Ayran"], ["icecekler","Kola"], ["icecekler","Fanta"], ["icecekler","Red Bull"],
  ["atistirmaliklar","Küçük Çekirdek (100 gr)"], ["atistirmaliklar","Orta Çekirdek (150 gr)"],
  ["atistirmaliklar","Büyük Çekirdek (200 gr)"], ["atistirmaliklar","Cips"], ["atistirmaliklar","Küçük Çikolata"],
  ["atistirmaliklar","Büyük Çikolata"], ["atistirmaliklar","Bisküvi"], ["atistirmaliklar","Patates Kızartması"],
  ["dondurma","Magnum Badem"], ["dondurma","Algida Maraş"], ["dondurma","Cornetto Antep"],
  ["gozleme","Kaşarlı Gözleme"], ["gozleme","Tulum Peynir + Kaşarlı Gözleme"],
  ["gozleme","Sebzeli Kaşarlı Gözleme"], ["gozleme","Sucuk Kaşarlı Gözleme"],
  ["tost","Karışık Tost"], ["tost","Kaşarlı Tost"],
  ["nargile","Nargile"]
];

const configReady = !Object.values(firebaseConfig).some(v => String(v).startsWith("BURAYA_"));
if (!configReady) {
  console.warn("Firebase yapılandırması henüz girilmedi.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const state = {
  activeMember: localStorage.getItem("emirganActiveMember") || "",
  activeCategory: "icecekler",
  reportPerson: "Tümü",
  products: [],
  orders: [],
  unsubProducts: null,
  unsubOrders: null
};

const views = {
  login: $("loginView"),
  member: $("memberView"),
  main: $("mainView")
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function money(value) {
  if (value === null || value === undefined || value === "") return "Fiyat belirlenmedi";
  const num = Number(value);
  if (!Number.isFinite(num)) return "Fiyat belirlenmedi";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(num);
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function localMonthKey(date = new Date()) {
  return localDateKey(date).slice(0,7);
}

function displayDate(date = new Date()) {
  return new Intl.DateTimeFormat("tr-TR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" }).format(date);
}

function displayTime(date) {
  return new Intl.DateTimeFormat("tr-TR", { hour:"2-digit", minute:"2-digit" }).format(date);
}

function orderDate(order) {
  if (order.createdAt?.toDate) return order.createdAt.toDate();
  if (order.createdAtLocal) return new Date(order.createdAtLocal);
  return new Date();
}

function usernameToEmail(username) {
  const cleaned = username.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g,"");
  return `${cleaned}@${usernameDomain}`;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 2200);
}

function categoryById(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
}

function setTodayLabel() {
  $("todayLabel").textContent = displayDate(new Date());
  $("historyDate").value ||= localDateKey();
  $("reportMonth").value ||= localMonthKey();
}

async function ensureDefaults() {
  const snapshot = await getDocs(collection(db, "products"));
  if (!snapshot.empty) return;
  await Promise.all(DEFAULT_PRODUCTS.map(([category, name], index) =>
    setDoc(doc(db, "products", `default-${String(index+1).padStart(3,"0")}`), {
      name,
      category,
      price: null,
      active: true,
      createdAt: serverTimestamp(),
      sortOrder: index
    })
  ));
}

function startRealtime() {
  if (state.unsubProducts) state.unsubProducts();
  if (state.unsubOrders) state.unsubOrders();

  state.unsubProducts = onSnapshot(
    query(collection(db, "products"), orderBy("sortOrder")),
    (snap) => {
      state.products = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      renderAll();
    },
    (err) => {
      console.error(err);
      toast("Ürünler yüklenemedi. Firestore kurallarını kontrol edin.");
    }
  );

  state.unsubOrders = onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc")),
    (snap) => {
      state.orders = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      renderAll();
    },
    (err) => {
      console.error(err);
      toast("Siparişler yüklenemedi. Firestore kurallarını kontrol edin.");
    }
  );
}

function renderCategoryTabs() {
  $("categoryTabs").innerHTML = CATEGORIES.map(c => `
    <button class="category-tab ${state.activeCategory===c.id?"active":""}"
      data-category="${c.id}" style="--tab-bg:${c.color}">${c.label}</button>
  `).join("");

  document.querySelectorAll(".category-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeCategory = btn.dataset.category;
      renderCategoryTabs();
      renderProducts();
    });
  });
}

function todayOrders() {
  const key = localDateKey();
  return state.orders.filter(o => o.dateKey === key);
}

function renderProducts() {
  const products = state.products.filter(p => p.active !== false && p.category === state.activeCategory);
  const today = todayOrders();
  $("productGrid").innerHTML = products.length ? products.map(p => {
    const count = today.filter(o => o.productId === p.id).length;
    const cat = categoryById(p.category);
    return `
      <article class="product-card" style="--card-bg:${cat.color}">
        <div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-price">${money(p.price)}</div>
        </div>
        <div class="product-actions">
          <div class="daily-count">Bugün: <strong>${count}</strong></div>
          <button class="add-btn" data-add-product="${p.id}" aria-label="${escapeHtml(p.name)} ekle">+</button>
        </div>
      </article>
    `;
  }).join("") : `<div class="empty">Bu kategoride aktif ürün yok.</div>`;

  document.querySelectorAll("[data-add-product]").forEach(btn => {
    btn.addEventListener("click", () => addOrder(btn.dataset.addProduct));
  });
}

async function addOrder(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product || !state.activeMember) return;
  const now = new Date();

  await addDoc(collection(db, "orders"), {
    productId: product.id,
    productName: product.name,
    category: product.category,
    member: state.activeMember,
    unitPrice: product.price ?? null,
    dateKey: localDateKey(now),
    monthKey: localMonthKey(now),
    createdAtLocal: now.toISOString(),
    createdAt: serverTimestamp()
  });
  toast(`${product.name} • ${state.activeMember} adına kaydedildi`);
}

function totalOf(orders) {
  return orders.reduce((sum,o) => sum + (Number.isFinite(Number(o.unitPrice)) ? Number(o.unitPrice) : 0), 0);
}

function renderToday() {
  const today = todayOrders();
  $("todayOrderCount").textContent = `${today.length} ürün`;
  $("todayTotal").textContent = money(totalOf(today));
  const recent = today.slice(0, 8);
  $("recentOrders").innerHTML = recent.length ? recent.map(orderRowHtml).join("") : `<div class="empty">Bugün henüz sipariş yok.</div>`;
  bindDeleteButtons($("recentOrders"));
}

function orderRowHtml(o, allowEditPrice=false) {
  const dt = orderDate(o);
  const priceText = money(o.unitPrice);
  return `
    <div class="order-row">
      <div class="order-time">${displayTime(dt)}</div>
      <div class="order-main">
        <strong>${escapeHtml(o.productName)}</strong>
        <span>${escapeHtml(o.member)} • ${escapeHtml(categoryById(o.category).label)}</span>
      </div>
      <div class="order-price">
        ${priceText}
        ${allowEditPrice ? `<button class="icon-btn" data-edit-price="${o.id}" title="Fiyatı düzenle">₺</button>` : ""}
        <button class="icon-btn" data-delete-order="${o.id}" title="Siparişi sil">×</button>
      </div>
    </div>
  `;
}

function bindDeleteButtons(root) {
  root.querySelectorAll("[data-delete-order]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Bu sipariş kaydı silinsin mi?")) return;
      await deleteDoc(doc(db, "orders", btn.dataset.deleteOrder));
      toast("Sipariş silindi");
    });
  });
  root.querySelectorAll("[data-edit-price]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const order = state.orders.find(o => o.id === btn.dataset.editPrice);
      const current = order?.unitPrice ?? "";
      const next = prompt("Bu sipariş için uygulanacak fiyatı yazın (TL):", current);
      if (next === null) return;
      const normalized = next.trim() === "" ? null : Number(next.replace(",","."));
      if (normalized !== null && (!Number.isFinite(normalized) || normalized < 0)) {
        alert("Geçerli bir fiyat girin.");
        return;
      }
      await updateDoc(doc(db, "orders", btn.dataset.editPrice), { unitPrice: normalized });
      toast("Sipariş fiyatı güncellendi");
    });
  });
}

function renderHistory() {
  const key = $("historyDate").value || localDateKey();
  const orders = state.orders.filter(o => o.dateKey === key).sort((a,b) => orderDate(b)-orderDate(a));
  const knownPriceCount = orders.filter(o => o.unitPrice !== null && o.unitPrice !== undefined).length;
  $("historySummary").innerHTML = `
    <div><span>Sipariş</span><strong>${orders.length}</strong></div>
    <div><span>Toplam</span><strong>${money(totalOf(orders))}</strong></div>
    <div><span>Fiyatı Girilmiş</span><strong>${knownPriceCount}/${orders.length}</strong></div>
  `;
  $("historyOrders").innerHTML = orders.length ? orders.map(o => orderRowHtml(o,true)).join("") : `<div class="empty">Bu tarihte kayıt bulunmuyor.</div>`;
  bindDeleteButtons($("historyOrders"));
}

function renderReports() {
  const month = $("reportMonth").value || localMonthKey();
  let orders = state.orders.filter(o => o.monthKey === month);
  if (state.reportPerson !== "Tümü") orders = orders.filter(o => o.member === state.reportPerson);

  const days = new Set(orders.map(o => o.dateKey)).size;
  const total = totalOf(orders);
  const avg = days ? total / days : 0;

  $("reportCards").innerHTML = `
    <div class="card report-card"><span>Toplam Sipariş</span><strong>${orders.length}</strong></div>
    <div class="card report-card"><span>Toplam Hesap</span><strong>${money(total)}</strong></div>
    <div class="card report-card"><span>Aktif Gün Ortalaması</span><strong>${money(avg)}</strong></div>
  `;

  const grouped = new Map();
  orders.forEach(o => {
    const key = o.productName;
    const cur = grouped.get(key) || { count:0, total:0 };
    cur.count += 1;
    cur.total += Number.isFinite(Number(o.unitPrice)) ? Number(o.unitPrice) : 0;
    grouped.set(key,cur);
  });

  const rows = [...grouped.entries()].sort((a,b) => b[1].count - a[1].count);
  $("productReport").innerHTML = rows.length ? rows.map(([name,v]) => `
    <div class="report-line">
      <span>${escapeHtml(name)}</span><span>${v.count} adet</span><span>${money(v.total)}</span>
    </div>`).join("") : `<div class="empty">Bu ay için kayıt bulunmuyor.</div>`;
}

function renderSettings() {
  const filter = $("settingsCategoryFilter").value || state.activeCategory;
  const products = state.products.filter(p => p.category === filter);
  $("settingsProductList").innerHTML = products.length ? products.map(p => `
    <div class="settings-product">
      <div>
        <strong>${escapeHtml(p.name)}</strong>
        <div class="meta">${escapeHtml(categoryById(p.category).label)}</div>
      </div>
      <input class="mini-input" data-product-price="${p.id}" type="number" min="0" step="0.01" value="${p.price ?? ""}" placeholder="Fiyat" />
      <button class="toggle-btn ${p.active===false?"off":""}" data-toggle-product="${p.id}">
        ${p.active===false ? "Pasif" : "Aktif"}
      </button>
    </div>
  `).join("") : `<div class="empty">Ürün bulunmuyor.</div>`;

  document.querySelectorAll("[data-product-price]").forEach(input => {
    input.addEventListener("change", async () => {
      const raw = input.value.trim();
      const price = raw === "" ? null : Number(raw);
      if (price !== null && (!Number.isFinite(price) || price < 0)) {
        alert("Geçerli bir fiyat girin.");
        return;
      }
      await updateDoc(doc(db, "products", input.dataset.productPrice), { price });
      toast("Yeni fiyat kaydedildi. Eski siparişler değişmedi.");
    });
  });

  document.querySelectorAll("[data-toggle-product]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const p = state.products.find(x => x.id === btn.dataset.toggleProduct);
      await updateDoc(doc(db, "products", p.id), { active: p.active === false });
    });
  });
}

function renderAll() {
  renderCategoryTabs();
  renderProducts();
  renderToday();
  renderHistory();
  renderReports();
  renderSettings();
}

function setupCategorySelects() {
  const options = CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join("");
  $("newProductCategory").innerHTML = options;
  $("settingsCategoryFilter").innerHTML = options;
  $("settingsCategoryFilter").value = state.activeCategory;
}

function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  })[c]);
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginMessage").textContent = "";
  if (!configReady) {
    $("loginMessage").textContent = "Önce firebase-config.js dosyasına Firebase bilgilerini girin.";
    return;
  }

  try {
    await setPersistence(auth, $("rememberInput").checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, usernameToEmail($("usernameInput").value), $("passwordInput").value);
  } catch (err) {
    console.error(err);
    $("loginMessage").textContent = "Kullanıcı adı veya şifre hatalı.";
  }
});

document.querySelectorAll(".member-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    state.activeMember = btn.dataset.member;
    localStorage.setItem("emirganActiveMember", state.activeMember);
    $("activeMemberButton").textContent = state.activeMember;
    showView("main");
    renderAll();
  });
});

$("activeMemberButton").addEventListener("click", () => showView("member"));
$("changeMemberButton").addEventListener("click", () => showView("member"));
$("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  state.activeMember = "";
  localStorage.removeItem("emirganActiveMember");
});
$("logoutFromMember").addEventListener("click", async () => {
  await signOut(auth);
  state.activeMember = "";
  localStorage.removeItem("emirganActiveMember");
});

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(x => x.classList.toggle("active", x===btn));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === btn.dataset.panel));
    if (btn.dataset.panel === "historyPanel") renderHistory();
    if (btn.dataset.panel === "reportsPanel") renderReports();
    if (btn.dataset.panel === "settingsPanel") renderSettings();
  });
});

$("historyDate").addEventListener("change", renderHistory);
$("reportMonth").addEventListener("change", renderReports);
document.querySelectorAll("[data-report-person]").forEach(btn => {
  btn.addEventListener("click", () => {
    state.reportPerson = btn.dataset.reportPerson;
    document.querySelectorAll("[data-report-person]").forEach(x => x.classList.toggle("active", x===btn));
    renderReports();
  });
});

$("settingsCategoryFilter").addEventListener("change", renderSettings);

$("addProductForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("newProductName").value.trim();
  if (!name) return;
  const rawPrice = $("newProductPrice").value.trim();
  const price = rawPrice === "" ? null : Number(rawPrice);
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    alert("Geçerli bir fiyat girin.");
    return;
  }
  const sortOrder = state.products.length ? Math.max(...state.products.map(p => Number(p.sortOrder)||0)) + 1 : 1;
  await addDoc(collection(db, "products"), {
    name,
    category: $("newProductCategory").value,
    price,
    active: true,
    sortOrder,
    createdAt: serverTimestamp()
  });
  $("newProductName").value = "";
  $("newProductPrice").value = "";
  toast("Yeni ürün eklendi");
});

$("undoLastButton").addEventListener("click", async () => {
  const today = todayOrders();
  if (!today.length) return toast("Geri alınacak sipariş yok.");
  const last = [...today].sort((a,b) => orderDate(b)-orderDate(a))[0];
  if (!confirm(`${last.productName} siparişi geri alınsın mı?`)) return;
  await deleteDoc(doc(db, "orders", last.id));
  toast("Son sipariş geri alındı");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (state.unsubProducts) state.unsubProducts();
    if (state.unsubOrders) state.unsubOrders();
    showView("login");
    return;
  }

  try {
    await ensureDefaults();
    startRealtime();
    if (state.activeMember) {
      $("activeMemberButton").textContent = state.activeMember;
      showView("main");
    } else {
      showView("member");
    }
  } catch (err) {
    console.error(err);
    alert("Firebase bağlantısı kurulamadı. Firestore veritabanını ve güvenlik kurallarını kontrol edin.");
  }
});

setupCategorySelects();
setTodayLabel();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
}
