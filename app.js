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

const APP_VERSION = "v10";

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
  trash: [],
  search: "",
  unsubProducts: null,
  unsubOrders: null,
  unsubPriceHistory: null,
  unsubDayStatus: null,
  unsubTrash: null
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

function getBillingCycle(date=new Date()){
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  let start, end;
  if(d.getDate()>=20){
    start=new Date(d.getFullYear(),d.getMonth(),20);
    end=new Date(d.getFullYear(),d.getMonth()+1,18);
  }else{
    start=new Date(d.getFullYear(),d.getMonth()-1,20);
    end=new Date(d.getFullYear(),d.getMonth(),18);
  }
  return {startKey:localDateKey(start),endKey:localDateKey(end),start,end};
}

function ordersInCurrentCycle(){
  const c=getBillingCycle();
  return state.orders.filter(o=>o.dateKey>=c.startKey && o.dateKey<=c.endKey);
}

function cycleLabel(c=getBillingCycle()){
  const f=d=>new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
  return `${f(c.start)} – ${f(c.end)}`;
}

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
  [state.unsubProducts,state.unsubOrders,state.unsubPriceHistory,state.unsubDayStatus,state.unsubTrash].forEach(fn => fn && fn());

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

  state.unsubTrash = onSnapshot(query(collection(db,"trash"),orderBy("deletedAt","desc")), snap => {
    state.trash = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderTrash();
  }, err => console.warn("trash",err));
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
  await moveOrderToTrash(matching[0].id); toast(`${matching[0].productName} • 1 adet çöp kutusuna taşındı`);
}

async function addOrder(productId,note="") {
  const product = state.products.find(p => p.id===productId);
  if (!product || !state.activeMember) return;
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
  const active = state.products.filter(p => p.active!==false);
  const favorites = [...active].sort((a,b)=>{
    const pinDiff = Number(!!b.favoritePinned) - Number(!!a.favoritePinned);
    if (pinDiff) return pinDiff;
    return (counts.get(b.id)||0) - (counts.get(a.id)||0);
  }).slice(0,6);

  const visible = favorites.filter(p => p.favoritePinned || (counts.get(p.id)||0)>0);
  $("favoritesSection").classList.toggle("hidden", visible.length===0);
  $("favoriteProducts").innerHTML = visible.map(p => {
    const cat = categoryById(p.category);
    return `<button class="favorite-btn" data-favorite="${p.id}" style="--fav-bg:${cat.color}">
      <span>${p.favoritePinned ? "★" : cat.icon}</span><strong>${escapeHtml(p.name)}</strong>
      <small>${p.favoritePinned ? "Sabit favori" : `${counts.get(p.id)||0} kez`}</small>
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

  const kasifOrders = today.filter(o=>o.member==="Kaşif");
  const ayseOrders = today.filter(o=>o.member==="Ayşe Merve");
  $("dayEndSummary").innerHTML = `
    <div class="day-end-title">Gün Sonu Özeti</div>
    <strong>Bugün toplam ${today.length} ürün • ${money(totalOf(today))}</strong>
    <span>Kaşif: ${money(totalOf(kasifOrders))} • Ayşe Merve: ${money(totalOf(ayseOrders))}</span>
  `;

  const c=getBillingCycle();
  if($("cycleBadge")) $("cycleBadge").textContent=`${cycleLabel(c)} • ödeme: 19'u`;

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
      <button class="icon-btn repeat-btn" data-repeat-order="${o.id}" title="Siparişi tekrarla">↻</button>
      <button class="icon-btn" data-edit-order="${o.id}" title="Siparişi düzenle">✎</button>
      ${allowEditPrice?`<button class="icon-btn" data-edit-price="${o.id}" title="Fiyatı düzenle">₺</button>`:""}
      <button class="icon-btn" data-delete-order="${o.id}" title="Siparişi sil">×</button>
    </div>
  </div>`;
}

function bindDeleteButtons(root) {
  root.querySelectorAll("[data-delete-order]").forEach(btn => btn.addEventListener("click",async()=>{
    if (!confirm("Bu sipariş kaydı silinsin mi?")) return;
    await moveOrderToTrash(btn.dataset.deleteOrder); toast("Sipariş çöp kutusuna taşındı");
  }));
  root.querySelectorAll("[data-edit-price]").forEach(btn => btn.addEventListener("click",async()=>{
    const order = state.orders.find(o=>o.id===btn.dataset.editPrice);
    const next = prompt("Bu sipariş için uygulanacak fiyatı yazın (TL):", order?.unitPrice ?? "");
    if (next===null) return;
    const normalized = next.trim()===""?null:Number(next.replace(",","."));
    if (normalized!==null && (!Number.isFinite(normalized)||normalized<0)) return alert("Geçerli bir fiyat girin.");
    await updateDoc(doc(db,"orders",btn.dataset.editPrice),{unitPrice:normalized}); toast("Sipariş fiyatı güncellendi");
  }));
  root.querySelectorAll("[data-repeat-order]").forEach(btn => btn.addEventListener("click",async()=>{
    const o=state.orders.find(x=>x.id===btn.dataset.repeatOrder);
    if(!o) return;
    const product=state.products.find(p=>p.id===o.productId);
    if(product) await addOrder(product.id,o.note||"");
    else {
      const now=new Date();
      await addDoc(collection(db,"orders"),{
        productId:o.productId||"", productName:o.productName, category:o.category, member:state.activeMember,
        unitPrice:o.unitPrice??null, note:o.note||"", dateKey:localDateKey(now), monthKey:localMonthKey(now),
        createdAtLocal:now.toISOString(), createdAt:serverTimestamp()
      });
      toast(`${o.productName} tekrarlandı`);
    }
  }));

  root.querySelectorAll("[data-edit-order]").forEach(btn => btn.addEventListener("click",()=>{
    openEditOrder(btn.dataset.editOrder);
  }));
}


function openEditOrder(orderId){
  const o=state.orders.find(x=>x.id===orderId);
  if(!o) return;
  $("editOrderId").value=o.id;
  $("editOrderMember").value=o.member||"Kaşif";
  $("editOrderProduct").innerHTML=sortTr(state.products.filter(p=>p.active!==false)).map(p=>
    `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  $("editOrderProduct").value=o.productId||"";
  $("editOrderPrice").value=o.unitPrice??"";
  $("editOrderNote").value=o.note||"";
  $("editOrderModal").classList.remove("hidden");
}

function closeEditOrder(){
  $("editOrderModal").classList.add("hidden");
}

function renderHistory() {
  const key = $("historyDate").value || localDateKey();
  const orders = state.orders.filter(o=>o.dateKey===key).sort((a,b)=>orderDate(b)-orderDate(a));
  const known = orders.filter(o=>o.unitPrice!==null && o.unitPrice!==undefined).length;
  $("historySummary").innerHTML = `
    <div><span>Sipariş</span><strong>${orders.length}</strong></div>
    <div><span>Toplam</span><strong>${money(totalOf(orders))}</strong></div>
    <div><span>Fiyatı Girilmiş</span><strong>${known}/${orders.length}</strong></div>`;
  $("historyOrders").innerHTML = orders.length ? orders.map(o=>orderRowHtml(o,true)).join("") : `<div class="empty">Bu tarihte kayıt bulunmuyor.</div>`;
  bindDeleteButtons($("historyOrders"));

  const month=key.slice(0,7);
  const monthDays=[...new Set(state.orders.filter(o=>o.monthKey===month).map(o=>o.dateKey))].sort().reverse();
  $("historyDayStatusList").innerHTML = monthDays.length ? monthDays.map(day=>{
    const dayOrders=state.orders.filter(o=>o.dateKey===day);
    return `<button class="day-status-item" data-history-day="${day}">
      <span>${new Date(day+"T12:00:00").toLocaleDateString("tr-TR")}</span>
      <strong>${dayOrders.length} ürün • ${money(totalOf(dayOrders))}</strong>
    </button>`;
  }).join("") : `<div class="empty">Bu ayda kayıt yok.</div>`;
  document.querySelectorAll("[data-history-day]").forEach(btn=>btn.addEventListener("click",()=>{
    $("historyDate").value=btn.dataset.historyDay; renderHistory();
  }));
}

function renderReports() {
  const month = $("reportMonth").value || localMonthKey();
  let orders = state.orders.filter(o=>o.monthKey===month);
  if (state.reportPerson!=="Tümü") orders=orders.filter(o=>o.member===state.reportPerson);
  const days = new Set(orders.map(o=>o.dateKey)).size, total=totalOf(orders), avg=days?total/days:0;

  const cycle=getBillingCycle();
  const cycleOrders=ordersInCurrentCycle();
  $("billingCycleCard").innerHTML=`
    <div><span>Mevcut Hesap Dönemi</span><strong>${cycleLabel(cycle)}</strong></div>
    <div><span>Dönem Toplamı</span><strong>${money(totalOf(cycleOrders))}</strong></div>
    <div><span>Dönem Siparişi</span><strong>${cycleOrders.length} ürün</strong></div>
    <div><span>Ödeme Günü</span><strong>Her ayın 19'u</strong></div>`;

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
  renderAdvancedStats(orders);
  renderPriceIncreaseAnalysis();
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


function renderAdvancedStats(orders){
  const days=[...new Set(orders.map(o=>o.dateKey))];
  const byDay=new Map();
  orders.forEach(o=>byDay.set(o.dateKey,(byDay.get(o.dateKey)||0)+(Number(o.unitPrice)||0)));
  const priciest=[...byDay.entries()].sort((a,b)=>b[1]-a[1])[0];

  const hourMap=new Map();
  orders.forEach(o=>{
    const h=orderDate(o).getHours();
    hourMap.set(h,(hourMap.get(h)||0)+1);
  });
  const peak=[...hourMap.entries()].sort((a,b)=>b[1]-a[1])[0];

  const kasif=totalOf(orders.filter(o=>o.member==="Kaşif"));
  const ayse=totalOf(orders.filter(o=>o.member==="Ayşe Merve"));
  const total=kasif+ayse || 1;

  let prevStart,prevEnd;
  const reportMonth=$("reportMonth").value||localMonthKey();
  const [yy,mm]=reportMonth.split("-").map(Number);
  const prevMonth=`${mm===1?yy-1:yy}-${String(mm===1?12:mm-1).padStart(2,"0")}`;
  const prevOrders=state.orders.filter(o=>o.monthKey===prevMonth);
  const prevTotal=totalOf(prevOrders);
  const currentTotal=totalOf(orders);
  const change=prevTotal>0?((currentTotal-prevTotal)/prevTotal)*100:null;

  $("advancedStats").innerHTML=`
    <div><span>Kafeye Gidilen Gün</span><strong>${days.length}</strong></div>
    <div><span>Ortalama Günlük Harcama</span><strong>${money(days.length?currentTotal/days.length:0)}</strong></div>
    <div><span>En Pahalı Gün</span><strong>${priciest?`${priciest[0]} • ${money(priciest[1])}`:"—"}</strong></div>
    <div><span>En Yoğun Saat</span><strong>${peak?`${String(peak[0]).padStart(2,"0")}:00–${String((peak[0]+1)%24).padStart(2,"0")}:00`:"—"}</strong></div>
    <div><span>Kaşif Payı</span><strong>%${((kasif/total)*100).toFixed(1)}</strong></div>
    <div><span>Ayşe Merve Payı</span><strong>%${((ayse/total)*100).toFixed(1)}</strong></div>
    <div><span>Geçen Aya Göre</span><strong>${change===null?"—":`${change>=0?"+":""}${change.toFixed(1)}%`}</strong></div>
  `;
}

function renderPriceIncreaseAnalysis(){
  const grouped=new Map();
  state.priceHistory.forEach(h=>{
    if(h.oldPrice===null||h.oldPrice===undefined||h.newPrice===null||h.newPrice===undefined) return;
    const arr=grouped.get(h.productId)||[];
    arr.push(h); grouped.set(h.productId,arr);
  });
  const rows=[];
  grouped.forEach((arr,productId)=>{
    arr.sort((a,b)=>{
      const da=a.changedAt?.toDate?a.changedAt.toDate():new Date(a.changedAtLocal||0);
      const db=b.changedAt?.toDate?b.changedAt.toDate():new Date(b.changedAtLocal||0);
      return da-db;
    });
    const first=Number(arr[0].oldPrice), last=Number(arr[arr.length-1].newPrice);
    if(!Number.isFinite(first)||!Number.isFinite(last)||first<=0) return;
    rows.push({name:arr[arr.length-1].productName,first,last,pct:((last-first)/first)*100});
  });
  rows.sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
  $("priceIncreaseAnalysis").innerHTML=rows.length?rows.slice(0,12).map(r=>`
    <div class="price-analysis-row">
      <strong>${escapeHtml(r.name)}</strong>
      <span>${money(r.first)} → ${money(r.last)}</span>
      <em class="${r.pct>=0?"up":"down"}">${r.pct>=0?"+":""}${r.pct.toFixed(1)}%</em>
    </div>`).join(""):`<div class="empty">Analiz için yeterli fiyat değişikliği yok.</div>`;
}

function renderPinnedFavorites(){
  if(!$("pinnedFavoritesGrid")) return;
  const pinned=sortTr(state.products.filter(p=>p.active!==false&&p.favoritePinned));
  const today=todayOrders();
  $("pinnedFavoritesGrid").innerHTML=pinned.length?pinned.map(p=>{
    const html=productCardHtml(p,today);
    return html.replace("</article>", `<button class="remove-favorite-btn" data-unpin-product="${p.id}">★ Sık Kullanılanlardan Çıkar</button></article>`);
  }).join(""):`<div class="empty">Henüz sık kullanılan ürün eklemediniz. Yukarıdaki “+ Ürün Ekle” düğmesine basın.</div>`;
  bindProductButtons($("pinnedFavoritesGrid"));
  document.querySelectorAll("[data-unpin-product]").forEach(btn=>btn.addEventListener("click",async()=>{
    await updateDoc(doc(db,"products",btn.dataset.unpinProduct),{favoritePinned:false});
    toast("Sık kullanılanlardan çıkarıldı.");
  }));
}

function renderFavoritePicker(){
  if(!$("favoritePickerList")) return;
  const q=($("favoritePickerSearch")?.value||"").trim().toLocaleLowerCase("tr-TR");
  const products=sortTr(state.products.filter(p=>p.active!==false && (!q || p.name.toLocaleLowerCase("tr-TR").includes(q))));
  $("favoritePickerList").innerHTML=products.length?products.map(p=>`
    <button class="favorite-picker-item ${p.favoritePinned?"selected":""}" data-picker-product="${p.id}">
      <span>${categoryById(p.category).icon}</span>
      <strong>${escapeHtml(p.name)}</strong>
      <em>${p.favoritePinned?"★ Eklendi":"+ Ekle"}</em>
    </button>`).join(""):`<div class="empty">Ürün bulunamadı.</div>`;
  document.querySelectorAll("[data-picker-product]").forEach(btn=>btn.addEventListener("click",async()=>{
    const p=state.products.find(x=>x.id===btn.dataset.pickerProduct);
    if(!p) return;
    await updateDoc(doc(db,"products",p.id),{favoritePinned:!p.favoritePinned});
    toast(p.favoritePinned?"Sık kullanılanlardan çıkarıldı.":"Sık kullanılanlara eklendi.");
  }));
}

async function moveOrderToTrash(orderId){
  const o=state.orders.find(x=>x.id===orderId);
  if(!o) return;
  const trashRef=doc(collection(db,"trash"));
  await setDoc(trashRef,{
    originalId:o.id,
    orderData:{
      productId:o.productId||"",productName:o.productName||"",category:o.category||"",
      member:o.member||"",unitPrice:o.unitPrice??null,note:o.note||"",
      dateKey:o.dateKey||"",monthKey:o.monthKey||"",createdAtLocal:o.createdAtLocal||orderDate(o).toISOString()
    },
    deletedBy:state.activeMember||"",deletedAtLocal:new Date().toISOString(),deletedAt:serverTimestamp()
  });
  await deleteDoc(doc(db,"orders",orderId));
}

function renderTrash(){
  if(!$("trashList")) return;
  $("trashList").innerHTML=state.trash.length?state.trash.map(t=>{
    const o=t.orderData||{};
    return `<div class="trash-row">
      <div><strong>${escapeHtml(o.productName||"Sipariş")}</strong><span>${escapeHtml(o.member||"")} • ${o.dateKey||""} • ${money(o.unitPrice)}</span></div>
      <div class="trash-actions">
        <button class="secondary-btn trash-restore" data-restore-trash="${t.id}">Geri Al</button>
        <button class="danger-btn trash-delete" data-delete-trash="${t.id}">Kalıcı Sil</button>
      </div>
    </div>`;
  }).join(""):`<div class="empty">Çöp kutusu boş.</div>`;

  document.querySelectorAll("[data-restore-trash]").forEach(btn=>btn.addEventListener("click",async()=>{
    const t=state.trash.find(x=>x.id===btn.dataset.restoreTrash); if(!t)return;
    const o=t.orderData||{};
    await addDoc(collection(db,"orders"),{
      ...o, createdAtLocal:o.createdAtLocal||new Date().toISOString(), createdAt:serverTimestamp()
    });
    await deleteDoc(doc(db,"trash",t.id)); toast("Sipariş geri yüklendi.");
  }));
  document.querySelectorAll("[data-delete-trash]").forEach(btn=>btn.addEventListener("click",async()=>{
    if(!confirm("Bu kayıt çöp kutusundan kalıcı olarak silinsin mi?"))return;
    await deleteDoc(doc(db,"trash",btn.dataset.deleteTrash)); toast("Kayıt kalıcı silindi.");
  }));
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

    const oldName = product?.name || "";
    const productId = input.dataset.productName;

    try {
      await updateDoc(doc(db,"products",productId),{name:newName});

      const relatedOrders = state.orders.filter(o => o.productId === productId);
      const relatedHistory = state.priceHistory.filter(h => h.productId === productId);

      await Promise.all([
        ...relatedOrders.map(o => updateDoc(doc(db,"orders",o.id),{productName:newName})),
        ...relatedHistory.map(h => updateDoc(doc(db,"priceHistory",h.id),{productName:newName}))
      ]);

      toast(`"${oldName}" adı "${newName}" olarak tüm geçmişte güncellendi.`);
    } catch(err) {
      console.error(err);
      alert("Ürün adı güncellenirken hata oluştu.");
    }
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
  renderCategoryTabs(); renderProducts(); renderToday(); renderHistory(); renderReports(); renderSettings(); renderPinnedFavorites(); renderFavoritePicker(); renderTrash();
}

function setupCategorySelects() {
  const options=CATEGORIES.map(c=>`<option value="${c.id}">${c.icon} ${c.label}</option>`).join("");
  $("newProductCategory").innerHTML=options; $("settingsCategoryFilter").innerHTML=options; $("settingsCategoryFilter").value=state.activeCategory;
}


function downloadTextFile(filename, content, mime="text/plain;charset=utf-8"){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function csvCell(value){
  const s=String(value??"").replace(/"/g,'""');
  return `"${s}"`;
}

function exportCsv(){
  const month=$("reportMonth").value||localMonthKey();
  let orders=state.orders.filter(o=>o.monthKey===month);
  if(state.reportPerson!=="Tümü") orders=orders.filter(o=>o.member===state.reportPerson);
  const rows=[["Tarih","Saat","Kişi","Ürün","Kategori","Fiyat","Not","Durum"]];
  orders.slice().sort((a,b)=>orderDate(a)-orderDate(b)).forEach(o=>{
    const dt=orderDate(o);
    rows.push([
      o.dateKey, displayTime(dt), o.member, o.productName, categoryById(o.category).label,
      o.unitPrice??"", o.note||"", "Aylık dönem"
    ]);
  });
  const csv="\ufeff"+rows.map(r=>r.map(csvCell).join(";")).join("\r\n");
  downloadTextFile(`emirgan-${month}.csv`,csv,"text/csv;charset=utf-8");
  toast("CSV dosyası hazırlandı.");
}

function backupJson(){
  const data={
    app:"Emirgan Cafe & Nargile", version:APP_VERSION, exportedAt:new Date().toISOString(),
    products:state.products, orders:state.orders.map(o=>({...o,createdAt:undefined})),
    priceHistory:state.priceHistory.map(h=>({...h,changedAt:undefined})), days:state.dayStatus
  };
  downloadTextFile(`emirgan-yedek-${localDateKey()}.json`,JSON.stringify(data,null,2),"application/json;charset=utf-8");
  toast("JSON yedeği indirildi.");
}

function runRangeReport(){
  const start=$("rangeStart").value, end=$("rangeEnd").value;
  if(!start||!end) return alert("Başlangıç ve bitiş tarihini seçin.");
  if(start>end) return alert("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
  let orders=state.orders.filter(o=>o.dateKey>=start&&o.dateKey<=end);
  if(state.reportPerson!=="Tümü") orders=orders.filter(o=>o.member===state.reportPerson);
  const activeDays=new Set(orders.map(o=>o.dateKey)).size;
  $("rangeReportResult").innerHTML=`
    <div><span>Sipariş</span><strong>${orders.length}</strong></div>
    <div><span>Toplam</span><strong>${money(totalOf(orders))}</strong></div>
    <div><span>Aktif Gün</span><strong>${activeDays}</strong></div>`;
}

async function deleteOrdersForDate(dateKey){
  const orders=state.orders.filter(o=>o.dateKey===dateKey);
  if(!orders.length) return toast("Bu tarihte silinecek kayıt yok.");
  for(const o of orders) await moveOrderToTrash(o.id);
  if(state.dayStatus[dateKey]) await deleteDoc(doc(db,"days",dateKey));
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

$("activeMemberButton").addEventListener("click",()=>{
  state.activeMember = state.activeMember==="Kaşif" ? "Ayşe Merve" : "Kaşif";
  localStorage.setItem("emirganActiveMember",state.activeMember);
  $("activeMemberButton").textContent=state.activeMember;
  toast(`Aktif kullanıcı: ${state.activeMember}`);
  renderAll();
});
$("changeMemberButton").addEventListener("click",()=>showView("member"));
$("logoutButton").addEventListener("click",async()=>{await signOut(auth);state.activeMember="";localStorage.removeItem("emirganActiveMember");});
$("logoutFromMember").addEventListener("click",async()=>{await signOut(auth);state.activeMember="";localStorage.removeItem("emirganActiveMember");});

document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id===btn.dataset.panel));
  if(btn.dataset.panel==="favoritesPanel")renderPinnedFavorites();
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
  await moveOrderToTrash(last.id);toast("Son sipariş çöp kutusuna taşındı");
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


$("editOrderForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("editOrderId").value;
  const old=state.orders.find(o=>o.id===id);
  const product=state.products.find(p=>p.id===$("editOrderProduct").value);
  if(!old||!product) return;
  const raw=$("editOrderPrice").value.trim();
  const price=raw===""?null:Number(raw);
  if(price!==null&&(!Number.isFinite(price)||price<0)) return alert("Geçerli bir fiyat girin.");
  await updateDoc(doc(db,"orders",id),{
    member:$("editOrderMember").value,
    productId:product.id,
    productName:product.name,
    category:product.category,
    unitPrice:price,
    note:$("editOrderNote").value.trim()
  });
  closeEditOrder(); toast("Sipariş güncellendi.");
});
$("closeEditOrderModal").addEventListener("click",closeEditOrder);
document.querySelectorAll("[data-close-modal]").forEach(el=>el.addEventListener("click",closeEditOrder));

$("runRangeReportButton").addEventListener("click",runRangeReport);
$("exportCsvButton").addEventListener("click",exportCsv);
$("backupJsonButton").addEventListener("click",backupJson);
$("backupJsonButtonSettings").addEventListener("click",backupJson);

$("deleteTodayButton").addEventListener("click",async()=>{
  const key=localDateKey();
  const count=state.orders.filter(o=>o.dateKey===key).length;
  if(!count) return toast("Bugün silinecek kayıt yok.");
  if(!confirm(`Bugüne ait ${count} sipariş kaydı tamamen silinsin mi?`)) return;
  await deleteOrdersForDate(key); toast("Bugünkü kayıtlar sıfırlandı.");
});

$("deleteSelectedDayButton").addEventListener("click",async()=>{
  const key=$("historyDate").value;
  const count=state.orders.filter(o=>o.dateKey===key).length;
  if(!count) return toast("Seçilen günde silinecek kayıt yok.");
  if(!confirm(`${key} tarihine ait ${count} sipariş kaydı tamamen silinsin mi?`)) return;
  await deleteOrdersForDate(key); toast("Seçilen gün sıfırlandı.");
});


$("manageFavoritesButton").addEventListener("click",()=>{
  $("favoritePicker").classList.remove("hidden");
  $("favoritePickerSearch").value="";
  renderFavoritePicker();
  $("favoritePickerSearch").focus();
});
$("closeFavoritePicker").addEventListener("click",()=>$("favoritePicker").classList.add("hidden"));
$("favoritePickerSearch").addEventListener("input",renderFavoritePicker);

$("emptyTrashButton").addEventListener("click",async()=>{
  if(!state.trash.length) return toast("Çöp kutusu zaten boş.");
  if(!confirm(`Çöp kutusundaki ${state.trash.length} kayıt kalıcı olarak silinsin mi?`)) return;
  await Promise.all(state.trash.map(t=>deleteDoc(doc(db,"trash",t.id))));
  toast("Çöp kutusu boşaltıldı.");
});

onAuthStateChanged(auth,async user=>{
  if(!user){
    [state.unsubProducts,state.unsubOrders,state.unsubPriceHistory,state.unsubDayStatus,state.unsubTrash].forEach(fn=>fn&&fn());
    showView("login"); return;
  }
  try{
    await ensureDefaults(); startRealtime();
    if(state.activeMember){$("activeMemberButton").textContent=state.activeMember;showView("main");}
    else showView("member");
  }catch(err){console.error(err);alert("Firebase bağlantısı kurulamadı. Firestore kurallarını kontrol edin.");}
});

setupCategorySelects(); setTodayLabel(); applyTheme();
if($("appVersionLabel")) $("appVersionLabel").textContent=`Emirgan ${APP_VERSION}`;

if("serviceWorker"in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./sw.js");
      const showUpdate=()=>{
        $("updateBanner").classList.remove("hidden");
        $("applyUpdateButton").onclick=()=>{
          if(reg.waiting) reg.waiting.postMessage({type:"SKIP_WAITING"});
          else location.reload();
        };
      };
      if(reg.waiting) showUpdate();
      reg.addEventListener("updatefound",()=>{
        const worker=reg.installing;
        if(!worker) return;
        worker.addEventListener("statechange",()=>{
          if(worker.state==="installed" && navigator.serviceWorker.controller) showUpdate();
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange",()=>location.reload());
      reg.update().catch(()=>{});
    }catch(err){ console.error(err); }
  });
}
