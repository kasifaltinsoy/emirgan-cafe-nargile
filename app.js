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

const APP_VERSION = "v12";

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
  billingCycles: {},
  appSettings: {},
  search: "",
  unsubProducts: null,
  unsubOrders: null,
  unsubPriceHistory: null,
  unsubDayStatus: null,
  unsubTrash: null,
  unsubBillingCycles: null,
  unsubAppSettings: null
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

function cycleId(c=getBillingCycle()){
  return `${c.startKey}__${c.endKey}`;
}

function cycleForDateKey(dateKey){
  const d=new Date(dateKey+"T12:00:00");
  return getBillingCycle(d);
}

function allCycleRanges(){
  const dates=state.orders.map(o=>o.dateKey).filter(Boolean).sort();
  if(!dates.length) return [getBillingCycle()];
  const first=cycleForDateKey(dates[0]);
  const last=getBillingCycle(new Date(dates[dates.length-1]+"T12:00:00"));
  const ranges=[];
  let cursor=new Date(first.start);
  while(cursor<=last.start){
    const c=getBillingCycle(cursor);
    ranges.push(c);
    cursor=new Date(c.start.getFullYear(),c.start.getMonth()+1,20);
  }
  return ranges.reverse();
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

function hapticAddFeedback(productId){
  if(navigator.vibrate) navigator.vibrate(35);
  const btn=document.querySelector(`[data-add-product="${productId}"]`);
  const card=btn?.closest(".product-card");
  if(card){
    card.classList.remove("just-added");
    void card.offsetWidth;
    card.classList.add("just-added");
    setTimeout(()=>card.classList.remove("just-added"),650);
  }
}

async function sha256Hex(text){
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function verifyAdminPin(promptText="Yönetici PIN'ini girin:"){
  const hash=state.appSettings?.adminPinHash;
  if(!hash) return true;
  const pin=prompt(promptText);
  if(pin===null) return false;
  if(!/^\d{4}$/.test(pin)){ alert("PIN 4 haneli olmalıdır."); return false; }
  const entered=await sha256Hex(pin);
  if(entered!==hash){ alert("PIN hatalı."); return false; }
  return true;
}

function renderAdminPinStatus(){
  if(!$("adminPinStatus")) return;
  $("adminPinStatus").textContent=state.appSettings?.adminPinHash ? "PIN aktif" : "PIN henüz belirlenmedi";
}

function isCycleLockedForDate(dateKey){
  const c=cycleForDateKey(dateKey);
  return !!state.billingCycles[cycleId(c)]?.locked;
}

async function requireUnlockedDate(dateKey){
  if(!isCycleLockedForDate(dateKey)) return true;
  alert("Bu sipariş ödenmiş ve kilitlenmiş bir hesap dönemine ait. Önce Arşiv'den dönem kilidini açın.");
  return false;
}

const DASHBOARD_BLOCKS=[
  ["cycleProgress","Dönem İlerlemesi"],
  ["personSummary","Kişi Özeti"],
  ["daySummary","Gün Sonu Özeti"],
  ["quickRecent","Son 5 Sipariş"],
  ["autoFavorites","Otomatik Sık Siparişler"],
  ["categories","Kategori Sekmeleri"],
  ["products","Ürünler"],
  ["recentOrders","Son Siparişler"]
];

function getDashboardLayout(){
  try{
    const saved=JSON.parse(localStorage.getItem("emirganDashboardLayout")||"null");
    if(Array.isArray(saved)&&saved.length) return saved;
  }catch{}
  return DASHBOARD_BLOCKS.map(([id])=>({id,visible:true}));
}

function saveDashboardLayout(layout){
  localStorage.setItem("emirganDashboardLayout",JSON.stringify(layout));
  applyDashboardLayout();
  renderLayoutEditor();
}

function applyDashboardLayout(){
  const layout=getDashboardLayout();
  const today=$("todayPanel");
  const blocks=new Map([...document.querySelectorAll("[data-dashboard-block]")].map(el=>[el.dataset.dashboardBlock,el]));
  const anchor=$("personTodaySummary")?.parentElement;
  layout.forEach(item=>{
    const el=blocks.get(item.id); if(!el)return;
    el.style.display=item.visible?"":"none";
  });
  // Visual order via CSS order, avoiding DOM disruption.
  layout.forEach((item,idx)=>{
    const el=blocks.get(item.id); if(el) el.style.order=String(idx+1);
  });
}

function renderLayoutEditor(){
  if(!$("layoutEditor")) return;
  const layout=getDashboardLayout();
  $("layoutEditor").innerHTML=layout.map((item,i)=>{
    const label=DASHBOARD_BLOCKS.find(x=>x[0]===item.id)?.[1]||item.id;
    return `<div class="layout-row">
      <label><input type="checkbox" data-layout-visible="${item.id}" ${item.visible?"checked":""}/> ${label}</label>
      <div>
        <button data-layout-move="${item.id}" data-dir="-1" ${i===0?"disabled":""}>↑</button>
        <button data-layout-move="${item.id}" data-dir="1" ${i===layout.length-1?"disabled":""}>↓</button>
      </div>
    </div>`;
  }).join("");
  document.querySelectorAll("[data-layout-visible]").forEach(cb=>cb.addEventListener("change",()=>{
    const l=getDashboardLayout(), item=l.find(x=>x.id===cb.dataset.layoutVisible); if(item)item.visible=cb.checked; saveDashboardLayout(l);
  }));
  document.querySelectorAll("[data-layout-move]").forEach(btn=>btn.addEventListener("click",()=>{
    const l=getDashboardLayout(), i=l.findIndex(x=>x.id===btn.dataset.layoutMove), j=i+Number(btn.dataset.dir);
    if(i<0||j<0||j>=l.length)return; [l[i],l[j]]=[l[j],l[i]]; saveDashboardLayout(l);
  }));
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
  [state.unsubProducts,state.unsubOrders,state.unsubPriceHistory,state.unsubDayStatus,state.unsubTrash,state.unsubBillingCycles,state.unsubAppSettings].forEach(fn => fn && fn());

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

  state.unsubBillingCycles = onSnapshot(collection(db,"billingCycles"), snap => {
    state.billingCycles = Object.fromEntries(snap.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
    renderReports();
    renderArchive();
  }, err => console.warn("billingCycles",err));

  state.unsubAppSettings = onSnapshot(doc(db,"appSettings","main"), snap => {
    state.appSettings = snap.exists() ? snap.data() : {};
    renderAdminPinStatus();
  }, err => console.warn("appSettings",err));
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
    <div class="product-actions fast-counter">
      <button class="minus-btn" data-remove-product="${p.id}" ${count===0?"disabled":""}>−</button>
      <div class="daily-count"><span>Bugün</span><strong>${count}</strong></div>
      <button class="add-btn" data-add-product="${p.id}">+</button>
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
  if(!(await requireUnlockedDate(localDateKey()))) return;
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
  hapticAddFeedback(product.id);
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
  const cycleOrders=ordersInCurrentCycle();
  const now=new Date();
  const totalDays=Math.round((c.end-c.start)/(1000*60*60*24))+1;
  const elapsed=Math.max(1,Math.min(totalDays,Math.round((new Date(now.getFullYear(),now.getMonth(),now.getDate())-c.start)/(1000*60*60*24))+1));
  const pct=Math.max(0,Math.min(100,(elapsed/totalDays)*100));
  $("cycleProgressCard").innerHTML=`
    <div class="cycle-progress-head">
      <div><span>Mevcut Hesap Dönemi</span><strong>${cycleLabel(c)}</strong></div>
      <b>${elapsed}/${totalDays} gün</b>
    </div>
    <div class="cycle-progress-bar"><i style="width:${pct}%"></i></div>
    <div class="cycle-progress-foot"><span>${cycleOrders.length} sipariş</span><strong>${money(totalOf(cycleOrders))}</strong></div>`;

  const quick = today.slice(0,5);
  $("recentQuickStrip").innerHTML = quick.length ? quick.map(o=>`
    <button class="quick-recent-item" data-quick-repeat="${o.id}">
      <strong>${escapeHtml(o.productName)}</strong>
      <span>${displayTime(orderDate(o))} • ${escapeHtml(o.member)}</span>
      <em>↻ Tekrarla</em>
    </button>`).join("") : `<div class="empty quick-empty">Henüz sipariş yok.</div>`;
  document.querySelectorAll("[data-quick-repeat]").forEach(btn=>btn.addEventListener("click",()=>{
    const o=state.orders.find(x=>x.id===btn.dataset.quickRepeat);
    if(!o)return;
    const p=state.products.find(x=>x.id===o.productId);
    if(p) addOrder(p.id,o.note||"");
  }));

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
    const target=state.orders.find(o=>o.id===btn.dataset.deleteOrder);
    if(target && !(await requireUnlockedDate(target.dateKey))) return;
    if (!confirm("Bu sipariş kaydı silinsin mi?")) return;
    await moveOrderToTrash(btn.dataset.deleteOrder); toast("Sipariş çöp kutusuna taşındı");
  }));
  root.querySelectorAll("[data-edit-price]").forEach(btn => btn.addEventListener("click",async()=>{
    const order = state.orders.find(o=>o.id===btn.dataset.editPrice);
    if(order && !(await requireUnlockedDate(order.dateKey))) return;
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

  root.querySelectorAll("[data-edit-order]").forEach(btn => btn.addEventListener("click",async()=>{
    const order=state.orders.find(o=>o.id===btn.dataset.editOrder);
    if(order && !(await requireUnlockedDate(order.dateKey))) return;
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
  const cycleMeta=state.billingCycles[cycleId(cycle)]||{};
  if($("cafeStatementAmount")) $("cafeStatementAmount").value=cycleMeta.cafeAmount??"";
  const diff=(cycleMeta.cafeAmount===null||cycleMeta.cafeAmount===undefined)?null:Number(cycleMeta.cafeAmount)-totalOf(cycleOrders);
  if($("reconciliationResult")) $("reconciliationResult").innerHTML=`
    <div><span>Uygulama</span><strong>${money(totalOf(cycleOrders))}</strong></div>
    <div><span>Kafe</span><strong>${cycleMeta.cafeAmount===undefined?"—":money(cycleMeta.cafeAmount)}</strong></div>
    <div><span>Fark</span><strong class="${diff===null?"":(Math.abs(diff)<0.01?"ok":"warn")}">${diff===null?"—":money(diff)}</strong></div>
    <div><span>Durum</span><strong>${cycleMeta.paid?"✓ Ödendi":"Bekliyor"}</strong></div>`;
  if($("markCyclePaidButton")){
    $("markCyclePaidButton").textContent=cycleMeta.paid?"✓ Dönem Ödendi":"Dönemi Ödendi İşaretle";
    $("markCyclePaidButton").classList.toggle("cycle-paid",!!cycleMeta.paid);
  }

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
  renderAnnualSummary();
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
  const pinned=state.products
    .filter(p=>p.active!==false&&p.favoritePinned)
    .sort((a,b)=>(Number(a.favoriteOrder??9999)-Number(b.favoriteOrder??9999)) || a.name.localeCompare(b.name,"tr",{sensitivity:"base"}));
  const today=todayOrders();
  $("pinnedFavoritesGrid").innerHTML=pinned.length?pinned.map((p,i)=>{
    const html=productCardHtml(p,today).replace('<article class="product-card"', `<article draggable="true" data-favorite-card="${p.id}" class="product-card favorite-draggable"`);
    return html.replace("</article>", `
      <div class="favorite-order-controls">
        <button data-move-favorite="${p.id}" data-direction="-1" ${i===0?"disabled":""}>↑</button>
        <button data-move-favorite="${p.id}" data-direction="1" ${i===pinned.length-1?"disabled":""}>↓</button>
      </div>
      <button class="remove-favorite-btn" data-unpin-product="${p.id}">★ Sık Kullanılanlardan Çıkar</button></article>`);
  }).join(""):`<div class="empty">Henüz sık kullanılan ürün eklemediniz. Yukarıdaki “+ Ürün Ekle” düğmesine basın.</div>`;
  bindProductButtons($("pinnedFavoritesGrid"));
  document.querySelectorAll("[data-unpin-product]").forEach(btn=>btn.addEventListener("click",async()=>{
    await updateDoc(doc(db,"products",btn.dataset.unpinProduct),{favoritePinned:false});
    toast("Sık kullanılanlardan çıkarıldı.");
  }));

  document.querySelectorAll("[data-move-favorite]").forEach(btn=>btn.addEventListener("click",async()=>{
    const id=btn.dataset.moveFavorite, dir=Number(btn.dataset.direction);
    const current=[...pinned];
    const i=current.findIndex(p=>p.id===id), j=i+dir;
    if(i<0||j<0||j>=current.length)return;
    [current[i],current[j]]=[current[j],current[i]];
    await Promise.all(current.map((p,idx)=>updateDoc(doc(db,"products",p.id),{favoriteOrder:idx})));
  }));

  let dragId=null;
  document.querySelectorAll("[data-favorite-card]").forEach(card=>{
    card.addEventListener("dragstart",e=>{dragId=card.dataset.favoriteCard; card.classList.add("dragging");});
    card.addEventListener("dragend",()=>{dragId=null; card.classList.remove("dragging");});
    card.addEventListener("dragover",e=>e.preventDefault());
    card.addEventListener("drop",async e=>{
      e.preventDefault();
      const targetId=card.dataset.favoriteCard;
      if(!dragId||dragId===targetId)return;
      const current=[...pinned];
      const from=current.findIndex(p=>p.id===dragId), to=current.findIndex(p=>p.id===targetId);
      const [moved]=current.splice(from,1); current.splice(to,0,moved);
      await Promise.all(current.map((p,idx)=>updateDoc(doc(db,"products",p.id),{favoriteOrder:idx})));
    });
  });
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
    const existingPinned=state.products.filter(x=>x.favoritePinned);
    await updateDoc(doc(db,"products",p.id),{
      favoritePinned:!p.favoritePinned,
      favoriteOrder:p.favoritePinned ? (p.favoriteOrder??9999) : existingPinned.length
    });
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


function renderArchive(){
  if(!$("archiveCycleList")) return;
  const ranges=allCycleRanges();
  const current=getBillingCycle();
  const currentOrders=ordersInCurrentCycle();
  const currentMeta=state.billingCycles[cycleId(current)]||{};
  $("archiveCurrentCycle").innerHTML=`
    <span>Aktif Dönem</span>
    <strong>${cycleLabel(current)}</strong>
    <em>${currentOrders.length} ürün • ${money(totalOf(currentOrders))}</em>
    <b>${currentMeta.paid?"✓ Ödendi":"Devam ediyor"}</b>`;

  $("archiveCycleList").innerHTML=ranges.map(c=>{
    const cid=cycleId(c);
    const os=state.orders.filter(o=>o.dateKey>=c.startKey&&o.dateKey<=c.endKey);
    const meta=state.billingCycles[cid]||{};
    const kasif=totalOf(os.filter(o=>o.member==="Kaşif"));
    const ayse=totalOf(os.filter(o=>o.member==="Ayşe Merve"));
    const cafe=meta.cafeAmount;
    const diff=cafe===undefined||cafe===null?null:Number(cafe)-totalOf(os);
    return `<div class="card archive-cycle">
      <div class="archive-cycle-head">
        <div><span>Hesap Dönemi</span><strong>${cycleLabel(c)}</strong></div>
        <em class="${meta.paid?"paid":"open"}">${meta.paid?"✓ ÖDENDİ":"AÇIK"}</em>
      </div>
      <div class="archive-cycle-stats">
        <div><span>Toplam</span><strong>${money(totalOf(os))}</strong></div>
        <div><span>Sipariş</span><strong>${os.length}</strong></div>
        <div><span>Kaşif</span><strong>${money(kasif)}</strong></div>
        <div><span>Ayşe Merve</span><strong>${money(ayse)}</strong></div>
        <div><span>Kafe Hesabı</span><strong>${cafe===undefined?"—":money(cafe)}</strong></div>
        <div><span>Fark</span><strong>${diff===null?"—":money(diff)}</strong></div>
      </div>
      <div class="archive-actions">
        <button class="secondary-btn" data-print-cycle="${cid}">PDF Özeti</button>
        <button class="${meta.locked?"danger-btn":"secondary-btn"}" data-toggle-lock="${cid}">
          ${meta.locked?"🔒 Kilidi Aç":"🔓 Dönemi Kilitle"}
        </button>
      </div>
    </div>`;
  }).join("");

  document.querySelectorAll("[data-print-cycle]").forEach(btn=>btn.addEventListener("click",()=>{
    const [s,e]=btn.dataset.printCycle.split("__");
    printCycleSummary({startKey:s,endKey:e,start:new Date(s+"T12:00:00"),end:new Date(e+"T12:00:00")});
  }));

  document.querySelectorAll("[data-toggle-lock]").forEach(btn=>btn.addEventListener("click",async()=>{
    const cid=btn.dataset.toggleLock, meta=state.billingCycles[cid]||{}, next=!meta.locked;
    if(!next){
      if(!(await verifyAdminPin("Dönem kilidini açmak için yönetici PIN'ini girin:"))) return;
    }else if(!confirm("Bu hesap dönemi kilitlensin mi? Kilitliyken siparişler değiştirilemez veya silinemez.")) return;
    const [s,e]=cid.split("__");
    await setDoc(doc(db,"billingCycles",cid),{startKey:s,endKey:e,locked:next,lockedAt:next?serverTimestamp():null},{merge:true});
    toast(next?"Dönem kilitlendi.":"Dönem kilidi açıldı.");
  }));

  const opts=ranges.map(c=>`<option value="${cycleId(c)}">${cycleLabel(c)}</option>`).join("");
  $("compareCycleA").innerHTML=opts;
  $("compareCycleB").innerHTML=opts;
  if(ranges[1]) $("compareCycleB").value=cycleId(ranges[1]);
}


function cycleStatsById(cid){
  const [s,e]=cid.split("__");
  const os=state.orders.filter(o=>o.dateKey>=s&&o.dateKey<=e);
  const days=new Set(os.map(o=>o.dateKey)).size;
  return {
    orders:os,
    count:os.length,
    total:totalOf(os),
    days,
    kasif:totalOf(os.filter(o=>o.member==="Kaşif")),
    ayse:totalOf(os.filter(o=>o.member==="Ayşe Merve"))
  };
}

function runCycleComparison(){
  const a=$("compareCycleA").value,b=$("compareCycleB").value;
  if(!a||!b) return;
  const A=cycleStatsById(a),B=cycleStatsById(b);
  const diff=A.total-B.total;
  const pct=B.total>0?(diff/B.total)*100:null;
  $("cycleCompareResult").innerHTML=`
    <div><span>A Dönemi</span><strong>${money(A.total)}</strong><em>${A.count} sipariş • ${A.days} gün</em></div>
    <div><span>B Dönemi</span><strong>${money(B.total)}</strong><em>${B.count} sipariş • ${B.days} gün</em></div>
    <div><span>Fark</span><strong>${diff>=0?"+":""}${money(diff)}</strong><em>${pct===null?"—":`${pct>=0?"+":""}${pct.toFixed(1)}%`}</em></div>
    <div><span>Kaşif Farkı</span><strong>${money(A.kasif-B.kasif)}</strong></div>
    <div><span>Ayşe Merve Farkı</span><strong>${money(A.ayse-B.ayse)}</strong></div>`;
}

function renderAnnualSummary(){
  if(!$("annualYearSelect")) return;
  const years=[...new Set(state.orders.map(o=>String(o.dateKey||"").slice(0,4)).filter(Boolean))].sort().reverse();
  if(!years.length) years.push(String(new Date().getFullYear()));
  const current=$("annualYearSelect").value||years[0];
  $("annualYearSelect").innerHTML=years.map(y=>`<option value="${y}" ${y===current?"selected":""}>${y}</option>`).join("");
  const os=state.orders.filter(o=>String(o.dateKey||"").startsWith(current+"-"));
  const days=new Set(os.map(o=>o.dateKey)).size;
  const months=new Map();
  os.forEach(o=>months.set(o.monthKey,(months.get(o.monthKey)||0)+(Number(o.unitPrice)||0)));
  const maxMonth=[...months.entries()].sort((a,b)=>b[1]-a[1])[0];
  const grouped=new Map();
  os.forEach(o=>grouped.set(o.productName,(grouped.get(o.productName)||0)+1));
  const top=[...grouped.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  $("annualSummary").innerHTML=`
    <div class="annual-kpis">
      <div><span>Yıllık Toplam</span><strong>${money(totalOf(os))}</strong></div>
      <div><span>Ziyaret Günü</span><strong>${days}</strong></div>
      <div><span>Toplam Sipariş</span><strong>${os.length}</strong></div>
      <div><span>Aylık Ortalama</span><strong>${money(months.size?totalOf(os)/months.size:0)}</strong></div>
      <div><span>En Pahalı Ay</span><strong>${maxMonth?`${maxMonth[0]} • ${money(maxMonth[1])}`:"—"}</strong></div>
      <div><span>Kaşif</span><strong>${money(totalOf(os.filter(o=>o.member==="Kaşif")))}</strong></div>
      <div><span>Ayşe Merve</span><strong>${money(totalOf(os.filter(o=>o.member==="Ayşe Merve")))}</strong></div>
    </div>
    <div class="annual-top"><h4>En Çok Tüketilen 10 Ürün</h4>
      ${top.length?top.map(([n,c],i)=>`<div><span>${i+1}. ${escapeHtml(n)}</span><strong>${c} adet</strong></div>`).join(""):`<p>Kayıt yok.</p>`}
    </div>`;
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
  renderLayoutEditor();
  renderAdminPinStatus();
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
  renderCategoryTabs(); renderProducts(); renderToday(); renderHistory(); renderReports(); renderArchive(); renderSettings(); renderPinnedFavorites(); renderFavoritePicker(); renderTrash();
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
    priceHistory:state.priceHistory.map(h=>({...h,changedAt:undefined})), days:state.dayStatus,
    billingCycles:state.billingCycles
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
  if(!(await requireUnlockedDate(dateKey))) return false;
  const orders=state.orders.filter(o=>o.dateKey===dateKey);
  if(!orders.length) return toast("Bu tarihte silinecek kayıt yok.");
  for(const o of orders) await moveOrderToTrash(o.id);
  if(state.dayStatus[dateKey]) await deleteDoc(doc(db,"days",dateKey));
  return true;
}


function printCycleSummary(c=getBillingCycle()){
  const os=state.orders.filter(o=>o.dateKey>=c.startKey&&o.dateKey<=c.endKey);
  const meta=state.billingCycles[cycleId(c)]||{};
  const grouped=new Map();
  os.forEach(o=>{
    const cur=grouped.get(o.productName)||{count:0,total:0};
    cur.count++; cur.total+=Number(o.unitPrice)||0; grouped.set(o.productName,cur);
  });
  const rows=[...grouped.entries()].sort((a,b)=>b[1].count-a[1].count);
  const w=window.open("","_blank");
  if(!w) return alert("PDF özeti için açılır pencereye izin verin.");
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Emirgan ${cycleLabel(c)}</title>
  <style>body{font-family:Arial,sans-serif;padding:32px;color:#222}h1{margin:0}small{color:#666}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:24px 0}.box{border:1px solid #ddd;border-radius:10px;padding:12px}.box span{display:block;color:#666;font-size:12px}.box strong{display:block;margin-top:4px}@media print{button{display:none}}</style>
  </head><body>
  <h1>Emirgan Cafe & Nargile</h1><small>Hesap Dönemi: ${cycleLabel(c)}</small>
  <div class="sum">
    <div class="box"><span>Toplam</span><strong>${money(totalOf(os))}</strong></div>
    <div class="box"><span>Sipariş</span><strong>${os.length}</strong></div>
    <div class="box"><span>Kafe Hesabı</span><strong>${meta.cafeAmount===undefined?"—":money(meta.cafeAmount)}</strong></div>
    <div class="box"><span>Durum</span><strong>${meta.paid?"Ödendi":"Açık"}</strong></div>
  </div>
  <table><thead><tr><th>Ürün</th><th>Adet</th><th>Tutar</th></tr></thead><tbody>
  ${rows.map(([n,v])=>`<tr><td>${escapeHtml(n)}</td><td>${v.count}</td><td>${money(v.total)}</td></tr>`).join("")}
  </tbody></table>
  <p><button onclick="window.print()">PDF / Yazdır</button></p>
  </body></html>`;
  w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>w.print(),350);
}

function runSystemCheck(){
  const issues=[];
  state.products.forEach(p=>{
    if(!p.name?.trim()) issues.push("Adsız ürün kaydı var.");
    if(p.price!==null&&p.price!==undefined&&(!Number.isFinite(Number(p.price))||Number(p.price)<0)) issues.push(`${p.name}: geçersiz fiyat.`);
  });
  state.orders.forEach(o=>{
    if(!o.dateKey) issues.push(`${o.productName||"Sipariş"}: tarih eksik.`);
    if(!o.member) issues.push(`${o.productName||"Sipariş"}: kişi eksik.`);
    if(!o.productName) issues.push("Ürün adı eksik sipariş var.");
    if(o.productId && !state.products.some(p=>p.id===o.productId)) issues.push(`${o.productName}: katalog ürünü artık bulunmuyor.`);
  });
  const fingerprints=new Map();
  state.orders.forEach(o=>{
    const fp=[o.productId,o.member,o.createdAtLocal,o.unitPrice,o.note].join("|");
    fingerprints.set(fp,(fingerprints.get(fp)||0)+1);
  });
  const dup=[...fingerprints.values()].filter(n=>n>1).length;
  if(dup) issues.push(`${dup} olası mükerrer kayıt grubu bulundu.`);

  const el=$("systemCheckResult");
  el.classList.remove("hidden");
  el.innerHTML=issues.length
    ? `<h3>Sistem Kontrolü</h3><p>${issues.length} uyarı bulundu:</p><ul>${issues.slice(0,30).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`
    : `<h3>Sistem Kontrolü</h3><p class="system-ok">✓ Belirgin veri bütünlüğü sorunu bulunmadı.</p>`;
}

async function restoreBackupFile(file){
  const text=await file.text();
  let data;
  try{data=JSON.parse(text);}catch{return alert("Geçerli bir JSON yedek dosyası değil.");}
  if(!data||!Array.isArray(data.products)||!Array.isArray(data.orders)) return alert("Bu dosya Emirgan yedeği olarak tanınmadı.");
  if(!confirm(`Yedekte ${data.products.length} ürün ve ${data.orders.length} sipariş var. Mevcut verilerin üzerine eklenerek/aynı kimliklerde güncellenerek geri yüklensin mi?`)) return;

  for(const p of data.products){
    if(!p.id) continue;
    const {id,...payload}=p;
    await setDoc(doc(db,"products",id),{...payload,createdAt:serverTimestamp()},{merge:true});
  }
  for(const o of data.orders){
    if(!o.id) continue;
    const {id,...payload}=o;
    await setDoc(doc(db,"orders",id),{...payload,createdAt:serverTimestamp()},{merge:true});
  }
  for(const h of (data.priceHistory||[])){
    if(!h.id) continue;
    const {id,...payload}=h;
    await setDoc(doc(db,"priceHistory",id),{...payload,changedAt:serverTimestamp()},{merge:true});
  }
  if(data.days){
    for(const [id,payload] of Object.entries(data.days)) await setDoc(doc(db,"days",id),payload,{merge:true});
  }
  if(data.billingCycles){
    for(const [id,payload] of Object.entries(data.billingCycles)) await setDoc(doc(db,"billingCycles",id),payload,{merge:true});
  }
  toast("Yedek geri yükleme tamamlandı.");
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
  if(btn.dataset.panel==="archivePanel")renderArchive();
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
  if(!(await verifyAdminPin("Fiyat geçmişini sıfırlamak için yönetici PIN'ini girin:"))) return;
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
  if(!(await verifyAdminPin("Bugünkü kayıtları toplu silmek için yönetici PIN'ini girin:"))) return;
  const key=localDateKey();
  const count=state.orders.filter(o=>o.dateKey===key).length;
  if(!count) return toast("Bugün silinecek kayıt yok.");
  if(!confirm(`Bugüne ait ${count} sipariş kaydı tamamen silinsin mi?`)) return;
  await deleteOrdersForDate(key); toast("Bugünkü kayıtlar sıfırlandı.");
});

$("deleteSelectedDayButton").addEventListener("click",async()=>{
  if(!(await verifyAdminPin("Seçilen günün kayıtlarını toplu silmek için yönetici PIN'ini girin:"))) return;
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


$("adminPinSetupButton").addEventListener("click",async()=>{
  const oldHash=state.appSettings?.adminPinHash;
  if(oldHash && !(await verifyAdminPin("Mevcut yönetici PIN'ini girin:"))) return;
  const pin=prompt("Yeni 4 haneli yönetici PIN'ini girin:");
  if(pin===null)return;
  if(!/^\d{4}$/.test(pin)) return alert("PIN tam olarak 4 rakam olmalıdır.");
  const again=prompt("PIN'i tekrar girin:");
  if(again!==pin) return alert("PIN'ler eşleşmedi.");
  const hash=await sha256Hex(pin);
  await setDoc(doc(db,"appSettings","main"),{adminPinHash:hash,updatedAt:serverTimestamp()},{merge:true});
  toast("Yönetici PIN'i kaydedildi.");
});

$("resetLayoutButton").addEventListener("click",()=>{
  localStorage.removeItem("emirganDashboardLayout");
  applyDashboardLayout(); renderLayoutEditor(); toast("Ana ekran düzeni sıfırlandı.");
});

$("runCycleCompareButton").addEventListener("click",runCycleComparison);
$("annualYearSelect").addEventListener("change",renderAnnualSummary);

$("saveReconciliationButton").addEventListener("click",async()=>{
  const c=getBillingCycle(), cid=cycleId(c);
  const raw=$("cafeStatementAmount").value.trim();
  const amount=raw===""?null:Number(raw);
  if(amount!==null&&(!Number.isFinite(amount)||amount<0)) return alert("Geçerli bir tutar girin.");
  await setDoc(doc(db,"billingCycles",cid),{
    startKey:c.startKey,endKey:c.endKey,cafeAmount:amount,
    updatedBy:state.activeMember,updatedAt:serverTimestamp()
  },{merge:true});
  toast("Mutabakat kaydedildi.");
});

$("markCyclePaidButton").addEventListener("click",async()=>{
  const c=getBillingCycle(), cid=cycleId(c), meta=state.billingCycles[cid]||{};
  const next=!meta.paid;
  if(next && !confirm(`${cycleLabel(c)} dönemi ödendi olarak işaretlensin mi?`)) return;
  await setDoc(doc(db,"billingCycles",cid),{
    startKey:c.startKey,endKey:c.endKey,paid:next,locked:next ? true : (meta.locked??false),
    paidAt:next?serverTimestamp():null,paidBy:next?state.activeMember:null
  },{merge:true});
  toast(next?"Dönem ödendi olarak arşivlendi.":"Ödendi işareti kaldırıldı.");
});

$("printCyclePdfButton").addEventListener("click",()=>printCycleSummary(getBillingCycle()));
$("systemCheckButton").addEventListener("click",runSystemCheck);
$("restoreBackupInput").addEventListener("change",async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  if(!(await verifyAdminPin("Yedek geri yüklemek için yönetici PIN'ini girin:"))){e.target.value="";return;}
  try{await restoreBackupFile(file);}catch(err){console.error(err);alert("Yedek geri yüklenirken hata oluştu.");}
  e.target.value="";
});

$("emptyTrashButton").addEventListener("click",async()=>{
  if(!(await verifyAdminPin("Çöp kutusunu boşaltmak için yönetici PIN'ini girin:"))) return;
  if(!state.trash.length) return toast("Çöp kutusu zaten boş.");
  if(!confirm(`Çöp kutusundaki ${state.trash.length} kayıt kalıcı olarak silinsin mi?`)) return;
  await Promise.all(state.trash.map(t=>deleteDoc(doc(db,"trash",t.id))));
  toast("Çöp kutusu boşaltıldı.");
});

onAuthStateChanged(auth,async user=>{
  if(!user){
    [state.unsubProducts,state.unsubOrders,state.unsubPriceHistory,state.unsubDayStatus,state.unsubTrash,state.unsubBillingCycles,state.unsubAppSettings].forEach(fn=>fn&&fn());
    showView("login"); return;
  }
  try{
    await ensureDefaults(); startRealtime();
    if(state.activeMember){$("activeMemberButton").textContent=state.activeMember;showView("main");}
    else showView("member");
  }catch(err){console.error(err);alert("Firebase bağlantısı kurulamadı. Firestore kurallarını kontrol edin.");}
});

setupCategorySelects(); setTodayLabel(); applyTheme(); applyDashboardLayout(); renderLayoutEditor();
if($("appVersionLabel")) $("appVersionLabel").textContent=`Emirgan ${APP_VERSION}`;

function updateOnlineStatus(){
  $("offlineBanner").classList.toggle("hidden",navigator.onLine);
}
window.addEventListener("online",updateOnlineStatus);
window.addEventListener("offline",updateOnlineStatus);
updateOnlineStatus();

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
