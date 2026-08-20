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
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const CATEGORIES = [
  { id: "icecekler", label: "İçecekler", icon: "☕", color: "#e5f2f5" },
  { id: "atistirmaliklar", label: "Atıştırmalıklar", icon: "🍟", color: "#f6eddc" },
  { id: "dondurma", label: "Dondurma", icon: "🍦", color: "#f8e7ef" },
  { id: "gozleme", label: "Gözleme", icon: "🫓", color: "#e8f2e5" },
  { id: "tost", label: "Tost", icon: "🥪", color: "#faecd9" },
  { id: "nargile", label: "Nargile", icon: "💨", color: "#eee7f6" }
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
  priceHistory: [],
  dayStatus: {},
  search: "",
  unsubProducts: null,
  unsubOrders: null,
  unsubPriceHistory: null,
  unsubDayStatus: null
};

const views = { login: $("loginView"), member: $("memberView"), main: $("mainView") };

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
  const y = date.getFullYear(), m = String(date.getMonth()+1).padStart(2,"0"), d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function localMonthKey(date = new Date()) { return localDateKey(date).slice(0,7); }
function displayDate(date = new Date()) {
  return new Intl.DateTimeFormat("tr-TR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" }).format(date);
}
function displayTime(date) { return new Intl.DateTimeFormat("tr-TR", { hour:"2-digit", minute:"2-digit" }).format(date); }
function orderDate(order) {
  if (order.createdAt?.toDate) return order.createdAt.toDate();
  if (order.createdAtLocal) return new Date(order.createdAtLocal);
  return new Date();
}
function usernameToEmail(username) {
  return `${username.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g,"")}@${usernameDomain}`;
}
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.remove("hidden");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add("hidden"), 2400);
}
function categoryById(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[0]; }
function setTodayLabel() {
  $("todayLabel").textContent = displayDate(new Date());
  $("historyDate").value ||= localDateKey();
  $("reportMonth").value ||= localMonthKey();
}
function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function sortTr(items) {
  return [...items].sort((a,b) => a.name.localeCompare(b.name, "tr", {sensitivity:"base"}));
}

async function ensureDefaults() {
  const snapshot = await getDocs(collection(db, "products"));
  if (!snapshot.empty) return;
  await Promise.all(DEFAULT_PRODUCTS.map(([category, name], index) =>
    setDoc(doc(db, "products", `default-${String(index+1).padStart(3,"0")}`), {
      name, category, price: null, active: true, createdAt: serverTimestamp(), sortOrder: index
    })
  ));
}

function startRealtime() {
  [state.unsubProducts,state.unsubOrders,state.unsubPriceHistory,state.unsubDayStatus].forEach(fn => fn && fn());

  state.unsubProducts = onSnapshot(query(collection(db,"products"),orderBy("sortOrder")), snap => {
    state.products = snap.docs.map(d => ({id:d.id,...d.data()})); renderAll();
  }, err => { console.error(err); toast("Ürünler yüklenemedi."); });

  state.unsubOrders = onSnapshot(query(collection(db,"orders"),orderBy("createdAt","desc")), snap => {
    state.orders = snap.docs.map(d => ({id:d.id,...d.data()})); renderAll();
  }, err => { console.error(err); toast("Siparişler yüklenemedi."); });

  state.unsubPriceHistory = onSnapshot(query(collection(db,"priceHistory"),orderBy("changedAt","desc")), snap => {
    state.priceHistory = snap.docs.map(d => ({id:d.id,...d.data()})); renderPriceHistory();
  }, err => console.warn("priceHistory", err));

  state.unsubDayStatus = onSnapshot(collection(db,"days"), snap => {
    state.dayStatus = Object.fromEntries(snap.docs.map(d => [d.id,{id:d.id,...d.data()}]));
    renderToday();
  }, err => console.warn("days", err));
}

function renderCategoryTabs() {
  $("categoryTabs").innerHTML = CATEGORIES.map(c => `
    <button class="category-tab ${state.activeCategory===c.id?"active":""}" data-category="${c.id}" style="--tab-bg:${c.color}">
      <span class="cat-icon">${c.icon}</span>${c.label}
    </button>`).join("");
  document.querySelectorAll(".category-tab").forEach(btn => btn.addEventListener("click", () => {
    state.activeCategory = btn.dataset.category; renderCategoryTabs(); renderProducts();
  }));
}

function todayOrders() { return state.orders.filter(o => o.dateKey === localDateKey()); }
function totalOf(orders) { return orders.reduce((sum,o) => sum + (Number.isFinite(Number(o.unitPrice)) ? Number(o.unitPrice) : 0),0); }

function filteredProducts() {
  const active = state.products.filter(p => p.active !== false);
  if (state.search.trim()) {
    const q = state.search.toLocaleLowerCase("tr-TR");
    return sortTr(active.filter(p => p.name.toLocaleLowerCase("tr-TR").includes(q)));
  }
  return sortTr(active.filter(p => p.category === state.activeCategory));
}

function renderProducts() {
  const products = filteredProducts(), today = todayOrders();
  $("productGrid").innerHTML = products.length ? products.map(p => productCardHtml(p,today)).join("") : `<div class="empty">Ürün bulunamadı.</div>`;
  bindProductButtons($("productGrid"));
}

function productCardHtml(p,today) {
  const count = today.filter(o => o.productId === p.id).length;
  const cat = categoryById(p.category);
  return `<article class="product-card" style="--card-bg:${cat.color}">
    <div>
      <div class="product-name">${escapeHtml(p.name)}</div>
      <div class="product-price">${money(p.price)}</div>
    </div>
    <div class="product-actions">
      <div class="daily-count">Bugün: <strong>${count}</strong></div>
      <div class="qty-buttons">
        <button class="minus-btn" data-remove-product="${p.id}" ${count===0?"disabled":""}>−</button>
        <button class="add-btn" data-add-product="${p.id}">+</button>
      </div>
    </div>
    <button class="note-order-btn" data-note-product="${p.id}">✎ Notlu sipariş</button>
  </article>`;
}

function bindProductButtons(root) {
  root.querySelectorAll("[data-add-product]").forEach(btn => btn.addEventListener("click", () => addOrder(btn.dataset.addProduct)));
  root.querySelectorAll("[data-remove-product]").forEach(btn => btn.addEventListener("click", () => removeLastProductOrder(btn.dataset.removeProduct)));
  root.querySelectorAll("[data-note-product]").forEach(btn => btn.addEventListener("click", () => {
    const note = prompt("Sipariş notunu yazın (örn. az şekerli, buzsuz):");
    if (note === null) return;
    addOrder(btn.dataset.noteProduct, note.trim());
  }));
}

async function removeLastProductOrder(productId) {
  const matching = todayOrders().filter(o => o.productId===productId && o.member===state.activeMember).sort((a,b)=>orderDate(b)-orderDate(a));
  if (!matching.length) return toast("Geri alınacak sipariş yok.");
  await deleteDoc(doc(db,"orders",matching[0].id)); toast(`${matching[0].productName} • 1 adet geri alındı`);
}

async function addOrder(productId,note="") {
  const product = state.products.find(p => p.id===productId);
  if (!product || !state.activeMember) return;
  const day = state.dayStatus[localDateKey()];
  if (day?.paid) {
    const ok = confirm("Bugünün hesabı kapatılmış/ödendi olarak işaretlenmiş. Yine de yeni sipariş eklensin mi?");
    if (!ok) return;
  }
  const now = new Date();
  await addDoc(collection(db,"orders"), {
    productId:product.id, productName:product.name, category:product.category, member:state.activeMember,
    unitPrice:product.price ?? null, note:note || "", dateKey:localDateKey(now), monthKey:localMonthKey(now),
    createdAtLocal:now.toISOString(), createdAt:serverTimestamp()
  });
  toast(`${product.name} • ${state.activeMember} adına kaydedildi`);
}

function renderFavorites() {
  const counts = new Map();
  state.orders.forEach(o => counts.set(o.productId,(counts.get(o.productId)||0)+1));
  const favorites = state.products.filter(p => p.active!==false).sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0)).slice(0,6);
  $("favoritesSection").classList.toggle("hidden", favorites.every(p => (counts.get(p.id)||0)===0));
  $("favoriteProducts").innerHTML = favorites.filter(p => (counts.get(p.id)||0)>0).map(p => {
    const cat = categoryById(p.category);
    return `<button class="favorite-btn" data-favorite="${p.id}" style="--fav-bg:${cat.color}">
      <span>${cat.icon}</span><strong>${escapeHtml(p.name)}</strong><small>${counts.get(p.id)||0} kez</small>
    </button>`;
  }).join("");
  document.querySelectorAll("[data-favorite]").forEach(btn => btn.addEventListener("click",()=>addOrder(btn.dataset.favorite)));
}

function renderToday() {
  const today = todayOrders();
  $("todayOrderCount").textContent = `${today.length} ürün`;
  $("todayTotal").textContent = money(totalOf(today));

  const people = ["Kaşif","Ayşe Merve"];
  $("personTodaySummary").innerHTML = people.map(person => {
    const arr = today.filter(o=>o.member===person);
    return `<div class="person-card"><span>${person}</span><strong>${arr.length} ürün</strong><em>${money(totalOf(arr))}</em></div>`;
  }).join("");

  const paid = !!state.dayStatus[localDateKey()]?.paid;
  const btn = $("closeDayButton");
  btn.textContent = paid ? "✓ Ödendi" : "Hesabı Kapat";
  btn.classList.toggle("paid",paid);

  const recent = today.slice(0,8);
  $("recentOrders").innerHTML = recent.length ? recent.map(orderRowHtml).join("") : `<div class="empty">Bugün henüz sipariş yok.</div>`;
  bindDeleteButtons($("recentOrders"));
  renderFavorites();
}

function orderRowHtml(o,allowEditPrice=false) {
  const dt = orderDate(o);
  return `<div class="order-row">
    <div class="order-time">${displayTime(dt)}</div>
    <div class="order-main"><strong>${escapeHtml(o.productName)}</strong>
      <span>${escapeHtml(o.member)} • ${escapeHtml(categoryById(o.category).label)}${o.note ? ` • 📝 ${escapeHtml(o.note)}` : ""}</span>
    </div>
    <div class="order-price">${money(o.unitPrice)}
      ${allowEditPrice?`<button class="icon-btn" data-edit-price="${o.id}" title="Fiyatı düzenle">₺</button>`:""}
      <button class="icon-btn" data-delete-order="${o.id}" title="Siparişi sil">×</button>
    </div>
  </div>`;
}

function bindDeleteButtons(root) {
  root.querySelectorAll("[data-delete-order]").forEach(btn => btn.addEventListener("click",async()=>{
    if (!confirm("Bu sipariş kaydı silinsin mi?")) return;
    await deleteDoc(doc(db,"orders",btn.dataset.deleteOrder)); toast("Sipariş silindi");
  }));
  root.querySelectorAll("[data-edit-price]").forEach(btn => btn.addEventListener("click",async()=>{
    const order = state.orders.find(o=>o.id===btn.dataset.editPrice);
    const next = prompt("Bu sipariş için uygulanacak fiyatı yazın (TL):", order?.unitPrice ?? "");
    if (next===null) return;
    const normalized = next.trim()===""?null:Number(next.replace(",","."));
    if (normalized!==null && (!Number.isFinite(normalized)||normalized<0)) return alert("Geçerli bir fiyat girin.");
    await updateDoc(doc(db,"orders",btn.dataset.editPrice),{unitPrice:normalized}); toast("Sipariş fiyatı güncellendi");
  }));
}

function renderHistory() {
  const key = $("historyDate").value || localDateKey();
  const orders = state.orders.filter(o=>o.dateKey===key).sort((a,b)=>orderDate(b)-orderDate(a));
  const known = orders.filter(o=>o.unitPrice!==null && o.unitPrice!==undefined).length;
  const paid = !!state.dayStatus[key]?.paid;
  $("historySummary").innerHTML = `
    <div><span>Sipariş</span><strong>${orders.length}</strong></div>
    <div><span>Toplam</span><strong>${money(totalOf(orders))}</strong></div>
    <div><span>Durum</span><strong>${paid?"✓ Ödendi":`${known}/${orders.length} fiyatlı`}</strong></div>`;
  $("historyOrders").innerHTML = orders.length ? orders.map(o=>orderRowHtml(o,true)).join("") : `<div class="empty">Bu tarihte kayıt bulunmuyor.</div>`;
  bindDeleteButtons($("historyOrders"));
}

function renderReports() {
  const month = $("reportMonth").value || localMonthKey();
  let orders = state.orders.filter(o=>o.monthKey===month);
  if (state.reportPerson!=="Tümü") orders=orders.filter(o=>o.member===state.reportPerson);
  const days = new Set(orders.map(o=>o.dateKey)).size, total=totalOf(orders), avg=days?total/days:0;

  $("reportCards").innerHTML = `
    <div class="card report-card"><span>Toplam Sipariş</span><strong>${orders.length}</strong></div>
    <div class="card report-card"><span>Toplam Hesap</span><strong>${money(total)}</strong></div>
    <div class="card report-card"><span>Aktif Gün Ortalaması</span><strong>${money(avg)}</strong></div>`;

  const grouped = new Map();
  orders.forEach(o => {
    const cur=grouped.get(o.productName)||{count:0,total:0};
    cur.count++; cur.total += Number.isFinite(Number(o.unitPrice))?Number(o.unitPrice):0;
    grouped.set(o.productName,cur);
  });
  const rows=[...grouped.entries()].sort((a,b)=>b[1].count-a[1].count);

  $("topProducts").innerHTML = rows.slice(0,5).length ? rows.slice(0,5).map(([name,v],i)=>
    `<div class="top-product"><span class="rank">${i+1}</span><strong>${escapeHtml(name)}</strong><span>${v.count} adet</span></div>`
  ).join("") : `<div class="empty">Bu ay için kayıt bulunmuyor.</div>`;

  $("productReport").innerHTML = rows.length ? rows.map(([name,v])=>`
    <div class="report-line"><span>${escapeHtml(name)}</span><span>${v.count} adet</span><span>${money(v.total)}</span></div>`
  ).join("") : `<div class="empty">Bu ay için kayıt bulunmuyor.</div>`;

  drawMonthlyChart(orders,month);
}

function drawMonthlyChart(orders,month) {
  const canvas=$("monthlyChart"), ctx=canvas.getContext("2d");
  const dpr=window.devicePixelRatio||1, cssWidth=canvas.clientWidth||700, cssHeight=220;
  canvas.width=cssWidth*dpr; canvas.height=cssHeight*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,cssWidth,cssHeight);

  const [y,m]=month.split("-").map(Number), daysInMonth=new Date(y,m,0).getDate();
  const vals=Array.from({length:daysInMonth},(_,i)=>{
    const key=`${month}-${String(i+1).padStart(2,"0")}`;
    return totalOf(orders.filter(o=>o.dateKey===key));
  });
  const max=Math.max(...vals,1), pad={l:30,r:10,t:15,b:28}, w=cssWidth-pad.l-pad.r, h=cssHeight-pad.t-pad.b;
  const styles=getComputedStyle(document.body), text=styles.color||"#2f342f";
  ctx.strokeStyle="rgba(120,120,120,.18)"; ctx.fillStyle=text; ctx.font="10px system-ui";
  ctx.beginPath(); ctx.moveTo(pad.l,pad.t); ctx.lineTo(pad.l,pad.t+h); ctx.lineTo(pad.l+w,pad.t+h); ctx.stroke();
  const barW=Math.max(2,w/daysInMonth*0.62);
  vals.forEach((v,i)=>{
    const x=pad.l+(i+0.5)*w/daysInMonth, bh=(v/max)*(h-8), y0=pad.t+h-bh;
    ctx.fillStyle="rgba(111,135,116,.65)"; ctx.fillRect(x-barW/2,y0,barW,bh);
    if ((i+1)%5===0 || i===0 || i===daysInMonth-1) { ctx.fillStyle=text; ctx.textAlign="center"; ctx.fillText(String(i+1),x,pad.t+h+16); }
  });
}

function renderSettings() {
  const filter=$("settingsCategoryFilter").value||state.activeCategory;
  const products=sortTr(state.products.filter(p=>p.category===filter));
  $("settingsProductList").innerHTML = products.length ? products.map(p=>`
    <div class="settings-product">
      <div>
        <input class="mini-input product-name-input" data-product-name="${p.id}" value="${escapeHtml(p.name)}" aria-label="Ürün adı" />
        <div class="meta">${escapeHtml(categoryById(p.category).label)}</div>
      </div>
      <input class="mini-input" data-product-price="${p.id}" type="number" min="0" step="0.01" value="${p.price??""}" placeholder="Fiyat" />
      <div class="product-admin-actions">
        <button class="toggle-btn ${p.active===false?"off":""}" data-toggle-product="${p.id}">${p.active===false?"Pasif":"Aktif"}</button>
        <button class="delete-product-btn" data-delete-product="${p.id}">Sil</button>
      </div>
    </div>`).join("") : `<div class="empty">Ürün bulunmuyor.</div>`;

  document.querySelectorAll("[data-product-price]").forEach(input=>input.addEventListener("change",async()=>{
    const product=state.products.find(p=>p.id===input.dataset.productPrice);
    const raw=input.value.trim(), price=raw===""?null:Number(raw);
    if (price!==null&&(!Number.isFinite(price)||price<0)) return alert("Geçerli bir fiyat girin.");
    const oldPrice=product?.price??null;
    if (String(oldPrice??"")===String(price??"")) return;
    await updateDoc(doc(db,"products",input.dataset.productPrice),{price});
    await addDoc(collection(db,"priceHistory"),{
      productId:product.id, productName:product.name, oldPrice, newPrice:price,
      changedBy:state.activeMember||"", changedAtLocal:new Date().toISOString(), changedAt:serverTimestamp()
    });
    toast("Yeni fiyat kaydedildi. Eski siparişler değişmedi.");
  }));

  document.querySelectorAll("[data-product-name]").forEach(input=>input.addEventListener("change",async()=>{
    const product=state.products.find(p=>p.id===input.dataset.productName);
    const newName=input.value.trim();
    if(!newName){
      input.value=product?.name||"";
      return alert("Ürün adı boş bırakılamaz.");
    }
    if(newName===product?.name) return;
    await updateDoc(doc(db,"products",input.dataset.productName),{name:newName});
    toast("Ürün adı güncellendi. Geçmiş siparişler değişmedi.");
  }));

  document.querySelectorAll("[data-toggle-product]").forEach(btn=>btn.addEventListener("click",async()=>{
    const p=state.products.find(x=>x.id===btn.dataset.toggleProduct);
    await updateDoc(doc(db,"products",p.id),{active:p.active===false});
  }));

  document.querySelectorAll("[data-delete-product]").forEach(btn=>btn.addEventListener("click",async()=>{
    const p=state.products.find(x=>x.id===btn.dataset.deleteProduct);
    if(!p) return;
    const ok=confirm(`"${p.name}" ürününü tamamen silmek istiyor musunuz?\n\nGeçmiş sipariş kayıtları silinmeyecek.`);
    if(!ok) return;
    await deleteDoc(doc(db,"products",p.id));
    toast("Ürün katalogdan silindi. Geçmiş siparişler korundu.");
  }));

  renderPriceHistory();
}

function renderPriceHistory() {
  if (!$("priceHistoryList")) return;
  const items=state.priceHistory.slice(0,30);
  $("priceHistoryList").innerHTML = items.length ? items.map(h=>{
    const dt=h.changedAt?.toDate?h.changedAt.toDate():new Date(h.changedAtLocal||Date.now());
    return `<div class="price-history-row">
      <div><strong>${escapeHtml(h.productName)}</strong><span>${dt.toLocaleDateString("tr-TR")} ${displayTime(dt)} • ${escapeHtml(h.changedBy||"")}</span></div>
      <div>${money(h.oldPrice)} <b>→</b> ${money(h.newPrice)}</div>
    </div>`;
  }).join("") : `<div class="empty">Henüz fiyat değişikliği kaydı yok.</div>`;
}

function renderAll() {
  renderCategoryTabs(); renderProducts(); renderToday(); renderHistory(); renderReports(); renderSettings();
}

function setupCategorySelects() {
  const options=CATEGORIES.map(c=>`<option value="${c.id}">${c.icon} ${c.label}</option>`).join("");
  $("newProductCategory").innerHTML=options; $("settingsCategoryFilter").innerHTML=options; $("settingsCategoryFilter").value=state.activeCategory;
}

function applyTheme() {
  const dark=localStorage.getItem("emirganTheme")==="dark";
  document.body.dataset.theme=dark?"dark":"light";
  if ($("themeToggleButton")) $("themeToggleButton").textContent=dark?"☀️ Açık Moda Geç":"🌙 Koyu Moda Geç";
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("loginMessage").textContent="";
  if (!configReady) return $("loginMessage").textContent="Önce Firebase yapılandırmasını tamamlayın.";
  try {
    await setPersistence(auth,$("rememberInput").checked?browserLocalPersistence:browserSessionPersistence);
    await signInWithEmailAndPassword(auth,usernameToEmail($("usernameInput").value),$("passwordInput").value);
  } catch(err){ console.error(err); $("loginMessage").textContent="Kullanıcı adı veya şifre hatalı."; }
});

document.querySelectorAll(".member-btn").forEach(btn=>btn.addEventListener("click",()=>{
  state.activeMember=btn.dataset.member; localStorage.setItem("emirganActiveMember",state.activeMember);
  $("activeMemberButton").textContent=state.activeMember; showView("main"); renderAll();
}));

$("activeMemberButton").addEventListener("click",()=>showView("member"));
$("changeMemberButton").addEventListener("click",()=>showView("member"));
$("logoutButton").addEventListener("click",async()=>{await signOut(auth);state.activeMember="";localStorage.removeItem("emirganActiveMember");});
$("logoutFromMember").addEventListener("click",async()=>{await signOut(auth);state.activeMember="";localStorage.removeItem("emirganActiveMember");});

document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id===btn.dataset.panel));
  if(btn.dataset.panel==="historyPanel")renderHistory();
  if(btn.dataset.panel==="reportsPanel")renderReports();
  if(btn.dataset.panel==="settingsPanel")renderSettings();
}));

$("historyDate").addEventListener("change",renderHistory);
$("reportMonth").addEventListener("change",renderReports);
$("productSearch").addEventListener("input",e=>{state.search=e.target.value;renderProducts();});
document.querySelectorAll("[data-report-person]").forEach(btn=>btn.addEventListener("click",()=>{
  state.reportPerson=btn.dataset.reportPerson; document.querySelectorAll("[data-report-person]").forEach(x=>x.classList.toggle("active",x===btn)); renderReports();
}));
$("settingsCategoryFilter").addEventListener("change",renderSettings);

$("addProductForm").addEventListener("submit",async e=>{
  e.preventDefault(); const name=$("newProductName").value.trim(); if(!name)return;
  const raw=$("newProductPrice").value.trim(), price=raw===""?null:Number(raw);
  if(price!==null&&(!Number.isFinite(price)||price<0))return alert("Geçerli bir fiyat girin.");
  const sortOrder=state.products.length?Math.max(...state.products.map(p=>Number(p.sortOrder)||0))+1:1;
  await addDoc(collection(db,"products"),{name,category:$("newProductCategory").value,price,active:true,sortOrder,createdAt:serverTimestamp()});
  $("newProductName").value="";$("newProductPrice").value="";toast("Yeni ürün eklendi");
});

$("undoLastButton").addEventListener("click",async()=>{
  const today=todayOrders(); if(!today.length)return toast("Geri alınacak sipariş yok.");
  const last=[...today].sort((a,b)=>orderDate(b)-orderDate(a))[0];
  if(!confirm(`${last.productName} siparişi geri alınsın mı?`))return;
  await deleteDoc(doc(db,"orders",last.id));toast("Son sipariş geri alındı");
});

$("closeDayButton").addEventListener("click",async()=>{
  const key=localDateKey(), paid=!!state.dayStatus[key]?.paid;
  if(!paid){
    if(!confirm(`Bugünün hesabı ${money(totalOf(todayOrders()))}. "Ödendi" olarak kapatılsın mı?`))return;
    await setDoc(doc(db,"days",key),{paid:true,total:totalOf(todayOrders()),closedBy:state.activeMember,closedAtLocal:new Date().toISOString(),closedAt:serverTimestamp()},{merge:true});
    toast("Bugünün hesabı ödendi olarak kapatıldı.");
  } else {
    if(!confirm("Bugünün hesabı yeniden açılsın mı?"))return;
    await setDoc(doc(db,"days",key),{paid:false,reopenedBy:state.activeMember,reopenedAt:serverTimestamp()},{merge:true});
    toast("Hesap yeniden açıldı.");
  }
});

$("themeToggleButton").addEventListener("click",()=>{
  const dark=document.body.dataset.theme==="dark";
  localStorage.setItem("emirganTheme",dark?"light":"dark");applyTheme();renderReports();
});

$("clearPriceHistoryButton").addEventListener("click", async ()=>{
  if(!state.priceHistory.length) return toast("Silinecek fiyat geçmişi yok.");
  const ok = confirm(`Fiyat geçmişindeki ${state.priceHistory.length} kayıt tamamen silinsin mi?\n\nBu işlem ürünlerin mevcut fiyatlarını ve geçmiş siparişleri etkilemez.`);
  if(!ok) return;

  try{
    await Promise.all(state.priceHistory.map(h => deleteDoc(doc(db,"priceHistory",h.id))));
    toast("Fiyat geçmişi sıfırlandı.");
  }catch(err){
    console.error(err);
    alert("Fiyat geçmişi silinirken hata oluştu.");
  }
});

onAuthStateChanged(auth,async user=>{
  if(!user){
    [state.unsubProducts,state.unsubOrders,state.unsubPriceHistory,state.unsubDayStatus].forEach(fn=>fn&&fn());
    showView("login"); return;
  }
  try{
    await ensureDefaults(); startRealtime();
    if(state.activeMember){$("activeMemberButton").textContent=state.activeMember;showView("main");}
    else showView("member");
  }catch(err){console.error(err);alert("Firebase bağlantısı kurulamadı. Firestore kurallarını kontrol edin.");}
});

setupCategorySelects(); setTodayLabel(); applyTheme();

if("serviceWorker"in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
}
