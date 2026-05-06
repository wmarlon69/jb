/* ============================================================
   main.js — JB Importes | Versão Final Integrada (Novo Layout)
   Autor: WM Labs
   ============================================================ */

import { db } from "../core/firebase-config.js";
import {
  collection, getDocs, getDoc, doc,
  updateDoc, increment, query, where,
  orderBy, onSnapshot, addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


/* ============================================================
   1. CONFIGURAÇÃO GLOBAL
   ============================================================ */

const WPP_NUMBER = "5583996695516";
const GEMINI_API_KEY = "AIzaSyAx8tLLLnSL7CijSewZvSZzbtzng5Nk71g";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Versão do localStorage para evitar bugs antigos no cache
const STORAGE_VERSION = "v3";
const CART_KEY = `jb-cart-${STORAGE_VERSION}`;
const WISHLIST_KEY = `jb-wishlist-${STORAGE_VERSION}`;


/* ============================================================
   2. ESTADO DA APLICAÇÃO
   ============================================================ */

const state = {
  produtos: [],
  carrinho: _loadStorage(CART_KEY, []),
  wishlist: _loadStorage(WISHLIST_KEY, []),
  locaisEntrega: [],
  entregaSelecionada: { id: "retirada", nome: "📍 Retirada na Loja", valor: 0 },
  desconto: 0,
  cupomCodigo: "",
  currentFilter: "all",
  currentSort: "all",
  _unsubscribeProdutos: null,
};


/* ============================================================
   3. UTILITÁRIOS
   ============================================================ */

function _loadStorage(key, fallback) {
  try {
    // Limpa versões antigas para o usuário não ficar com erro na tela
    ["jb-cart", "cart_jb", "jb-wishlist", "jb-cart-v2", "jb-wishlist-v2"].forEach(k => localStorage.removeItem(k));
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) { return fallback; }
}

function _saveStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function normalizar(texto) {
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parsePreco(v) {
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
}

function formatBRL(n) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function registrarInteresse(id) {
  try { await updateDoc(doc(db, "produtos", id), { cliques: increment(1) }); } catch (_) {}
}

function toast(msg, type = "success") {
  const wrap = document.getElementById("toast-wrap");
  if (!wrap) return;
  const icons = { success: "check", info: "heart", warning: "triangle-exclamation", error: "xmark" };
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="toast-icon ${type}"><i class="fas fa-${icons[type] || "check"}"></i></div><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add("removing"); setTimeout(() => el.remove(), 300); }, 3000);
}

function pedirNome() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("name-modal");
    const input   = document.getElementById("name-modal-input");
    const btnOk   = document.getElementById("name-modal-confirm");
    const btnNao  = document.getElementById("name-modal-cancel");

    input.value = "";
    overlay.classList.add("open");
    input.focus();

    function confirmar() {
      const nome = input.value.trim();
      if (!nome) { input.focus(); return; }
      cleanup();
      resolve(nome);
    }
    function cancelar() { cleanup(); resolve(null); }
    function onKey(e) { if (e.key === "Enter") confirmar(); }
    function cleanup() {
      overlay.classList.remove("open");
      btnOk.removeEventListener("click", confirmar);
      btnNao.removeEventListener("click", cancelar);
      input.removeEventListener("keydown", onKey);
    }

    btnOk.addEventListener("click", confirmar);
    btnNao.addEventListener("click", cancelar);
    input.addEventListener("keydown", onKey);
  });
}


/* ============================================================
   4. BANNERS / SLIDER
   ============================================================ */

async function carregarBanners() {
  const container = document.querySelector(".hero-slider");
  if (!container) return;

  let totalBanners = 0;
  for (let i = 1; i <= 3; i++) {
    try {
      const snap = await getDoc(doc(db, "banners_fixos", `slot_${i}`));
      if (!snap.exists()) continue;
      const slide = container.querySelectorAll(".slide")[i - 1];
      if (slide && snap.data().imagem) {
        slide.style.backgroundImage = `url('${snap.data().imagem}')`;
        totalBanners++;
      }
    } catch (_) {}
  }
  if (totalBanners >= 2) _iniciarSlider();
}

let _sliderInterval = null;
function _iniciarSlider() {
  const slides = document.querySelectorAll(".slide");
  const dots   = document.querySelectorAll(".slider-dot");
  if(slides.length === 0) return;
  
  let atual = 0;
  function goTo(n) {
    slides[atual].classList.remove("active");
    if(dots[atual]) dots[atual].classList.remove("active");
    atual = (n + slides.length) % slides.length;
    slides[atual].classList.add("active");
    if(dots[atual]) dots[atual].classList.add("active");
  }

  document.getElementById("slide-prev")?.addEventListener("click", () => { clearInterval(_sliderInterval); goTo(atual - 1); _sliderInterval = setInterval(() => goTo(atual + 1), 5000); });
  document.getElementById("slide-next")?.addEventListener("click", () => { clearInterval(_sliderInterval); goTo(atual + 1); _sliderInterval = setInterval(() => goTo(atual + 1), 5000); });
  dots.forEach((dot, i) => dot.addEventListener("click", () => { clearInterval(_sliderInterval); goTo(i); _sliderInterval = setInterval(() => goTo(atual + 1), 5000); }));

  _sliderInterval = setInterval(() => goTo(atual + 1), 5000);
}


/* ============================================================
   5. PRODUTOS — CARREGAMENTO E RENDERIZAÇÃO
   ============================================================ */

function carregarVitrine() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;

  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-muted);"><i class="fas fa-circle-notch fa-spin" style="font-size:2rem;display:block;margin-bottom:12px;"></i>Carregando produtos...</div>`;

  if (state._unsubscribeProdutos) {
    state._unsubscribeProdutos();
    state._unsubscribeProdutos = null;
  }

  const q = query(collection(db, "produtos"), orderBy("nome"));

  state._unsubscribeProdutos = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-muted);">Nenhum produto cadastrado ainda.</div>`;
        state.produtos = [];
        _atualizarStats();
        return;
      }

      state.produtos = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          tagsBusca: normalizar(`${data.nome} ${data.marca || ""} ${data.categoria} ${data.subcategoria || ""}`),
        };
      });

      _atualizarStats();
      renderizarProdutos(_getFilteredProducts());
    },
    (err) => {
      console.error("Firestore erro:", err);
      grid.innerHTML = `<p style="text-align:center;padding:40px;color:#e11d48;">Erro ao carregar produtos. Tente novamente.</p>`;
    }
  );
}

// ----------------------------------------------------
// TELEMETRIA REAL DO BANCO DE DADOS
// ----------------------------------------------------
function _atualizarStats() {
  const totalProdutos = state.produtos.length;
  const totalCliques  = state.produtos.reduce((s, p) => s + (p.cliques || 0), 0);
  
  // Pegamos a quantidade de categorias únicas
  const categoriasUnicas = new Set(state.produtos.map(p => p.categoria)).size;
  
  // Pegamos a quantidade de ofertas reais
  const totalOfertas = state.produtos.filter(p => p.precoAntigo && parsePreco(p.precoAntigo) > parsePreco(p.preco)).length;

  _animarStat("stat1", totalCliques);
  _animarStat("stat2", totalProdutos);
  _animarStat("stat3", categoriasUnicas);
  _animarStat("stat4", totalOfertas);
}

function _animarStat(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  if(target === 0) { el.textContent = "0"; return; }
  
  let current = 0;
  const step = Math.ceil(target / 30);
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString("pt-BR");
    if (current >= target) clearInterval(interval);
  }, 40);
}

function renderizarProdutos(lista) {
  const grid = document.getElementById("product-grid");
  if (!grid) return;

  if (!lista || !lista.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);"><i class="fas fa-search" style="font-size:3rem;color:var(--text-dim);display:block;margin-bottom:16px;"></i><h3 style="font-family:var(--font-display);margin-bottom:8px;">Nenhum produto encontrado</h3><p style="font-size:0.88rem;">Tente buscar algo diferente</p></div>`;
    return;
  }

  grid.innerHTML = lista.map(p => {
    const preco     = parsePreco(p.preco);
    const precoAnt  = p.precoAntigo ? parsePreco(p.precoAntigo) : null;
    const disc      = precoAnt && precoAnt > preco ? Math.round((1 - preco / precoAnt) * 100) : 0;
    const inWish    = state.wishlist.includes(p.id);
    const imgCapa   = p.galeria?.[0] || p.imagem || "";
    const esgotado  = (p.estoque ?? 0) <= 0;

    let badgeHTML = "";
    if (esgotado)      badgeHTML = `<span class="badge badge-sold">Esgotado</span>`;
    else if (disc > 0) badgeHTML = `<span class="badge badge-sale">-${disc}%</span>`;
    else if (p.cliques > 10) badgeHTML = `<span class="badge badge-hot">🔥 Hot</span>`;

    const imgEl = imgCapa
      ? `<img src="${imgCapa}" alt="${p.nome}" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="product-img-placeholder"><i class="fas fa-image"></i><span>Sem foto</span></div>`;

    return `
    <div class="product-card" onclick="window.JB.openModal('${p.id}')">
      <div class="product-badge">${badgeHTML}</div>
      <button class="product-wish ${inWish ? "active" : ""}" onclick="window.JB.toggleWish(event,'${p.id}')">
        <i class="${inWish ? "fas" : "far"} fa-heart"></i>
      </button>
      <div class="product-img">${imgEl}</div>
      <div class="product-info">
        <div class="product-category">${p.categoria || "Diversos"}</div>
        <div class="product-name">${p.nome}</div>
        <div class="product-price-row">
          <span class="price-current">R$ ${formatBRL(preco)}</span>
          ${precoAnt ? `<span class="price-original">R$ ${formatBRL(precoAnt)}</span>` : ""}
          ${disc > 0 ? `<span class="price-discount">-${disc}%</span>` : ""}
        </div>
        <div class="product-actions">
          <button class="btn-buy" onclick="window.JB.addToCart(event,'${p.id}')" ${esgotado ? 'disabled style="background:var(--surface3);"' : ""}>
            <i class="fas fa-bag-shopping"></i> ${esgotado ? "Esgotado" : "Adicionar"}
          </button>
          <button class="btn-detail" onclick="window.JB.openModal('${p.id}');event.stopPropagation();" title="Ver detalhes">
            <i class="fas fa-expand-alt"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join("");
}

function _getFilteredProducts() {
  let list = [...state.produtos];
  if (state.currentFilter !== "all") {
    list = list.filter(p => p.categoria && normalizar(p.categoria) === normalizar(state.currentFilter));
  }
  if (state.currentSort === "menor") list.sort((a, b) => parsePreco(a.preco) - parsePreco(b.preco));
  else if (state.currentSort === "maior") list.sort((a, b) => parsePreco(b.preco) - parsePreco(a.preco));
  else if (state.currentSort === "oferta") list = list.filter(p => p.precoAntigo && parsePreco(p.precoAntigo) > parsePreco(p.preco));
  else if (state.currentSort === "novos") list.sort((a, b) => (b.dataCriacao || 0) - (a.dataCriacao || 0));

  return list;
}

function filterCat(cat) {
  state.currentFilter = cat;
  document.querySelectorAll(".nav-link").forEach(l => l.classList.toggle("active", l.dataset.cat === cat || (cat === "all" && l.dataset.cat === "all")));
  renderizarProdutos(_getFilteredProducts());
  document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" });
}


/* ============================================================
   6. MODAL DE PRODUTO
   ============================================================ */

function openModal(id) {
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;

  registrarInteresse(id);

  const preco    = parsePreco(p.preco);
  const precoAnt = p.precoAntigo ? parsePreco(p.precoAntigo) : null;
  const pix      = (preco * 0.9).toFixed(2).replace(".", ",");
  const imgSrc   = p.galeria?.[0] || p.imagem || "";
  const esgotado = (p.estoque ?? 0) <= 0;

  document.getElementById("modal-body").innerHTML = `
    <div class="modal-product">
      <div class="modal-img">${imgSrc ? `<img src="${imgSrc}">` : `<i class="fas fa-image"></i>`}</div>
      <div class="modal-details">
        <div class="modal-cat">${p.categoria || "Produto"}</div>
        <h2 class="modal-name">${p.nome}</h2>
        <p class="modal-desc">${p.descricao || p.resumo || "Sem descrição detalhada disponível."}</p>
        <div class="modal-price-big">R$ ${formatBRL(preco)}</div>
        ${precoAnt ? `<div style="font-size:0.82rem;color:var(--text-dim);text-decoration:line-through;margin-bottom:4px;">Era: R$ ${formatBRL(precoAnt)}</div>` : ""}
        <div class="modal-pix">💳 No PIX: R$ ${pix} (10% OFF)</div>
        <div class="modal-btns">
          <button class="btn-buy" onclick="window.JB.addToCart(event,'${p.id}');window.JB.closeModal();" ${esgotado ? 'disabled style="background:var(--surface3);"' : ""}>
            <i class="fas fa-bag-shopping"></i> ${esgotado ? "Esgotado" : "Adicionar à Sacola"}
          </button>
          <a href="https://wa.me/${WPP_NUMBER}?text=${encodeURIComponent(`Olá! Quero saber mais sobre: ${p.nome}`)}" target="_blank" class="btn-wpp">
            <i class="fab fa-whatsapp"></i> Dúvidas no Zap
          </a>
        </div>
      </div>
    </div>`;

  document.getElementById("product-modal").classList.add("open");
}

function closeModal() {
  document.getElementById("product-modal").classList.remove("open");
}


/* ============================================================
   7. CARRINHO (LÓGICA COMPLETA)
   ============================================================ */

function saveCart() {
  _saveStorage(CART_KEY, state.carrinho);
  updateCartUI();
}

function addToCart(e, id) {
  e.stopPropagation();
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;

  const existing = state.carrinho.find(i => i.id === id);
  if (existing) {
    existing.qty++;
  } else {
    state.carrinho.push({
      id,
      qty: 1,
      nome: p.nome,
      preco: parsePreco(p.preco),
      img: p.galeria?.[0] || p.imagem || "",
    });
  }

  saveCart();
  toast("Adicionado à sacola!", "success");
}

function removeFromCart(id) {
  state.carrinho = state.carrinho.filter(i => i.id !== id);
  saveCart();
  renderCart();
}

function changeQty(id, delta) {
  const item = state.carrinho.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  saveCart();
  renderCart();
}

function updateCartUI() {
  const total = state.carrinho.reduce((s, i) => s + i.qty, 0);
  ["cart-count", "float-count"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = total;
  });
}

function renderCart() {
  const wrap   = document.getElementById("cart-items-wrap");
  const empty  = document.getElementById("empty-cart");
  const footer = document.getElementById("cart-footer");

  if (!state.carrinho.length) {
    if (empty)  empty.style.display  = "flex";
    if (wrap)   wrap.style.display   = "none";
    if (footer) footer.style.display = "none";
    return;
  }

  if (empty)  empty.style.display  = "none";
  if (wrap)   wrap.style.display   = "block";
  if (footer) footer.style.display = "block";

  let subtotal = 0;
  if (wrap) {
    wrap.innerHTML = state.carrinho.map(item => {
      subtotal += item.preco * item.qty;
      const imgEl = item.img
        ? `<img src="${item.img}" alt="Produto" onerror="this.style.display='none'">`
        : `<i class="fas fa-image" style="font-size:1.5rem;color:var(--text-dim);"></i>`;
      return `
      <div class="cart-item">
        <button class="remove-item" onclick="window.JB.removeFromCart('${item.id}')"><i class="fas fa-times"></i></button>
        <div class="cart-item-img">${imgEl}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.nome}</div>
          <div class="cart-item-row" style="margin-top:10px;">
            <div class="qty-ctrl">
              <button class="qty-btn" onclick="window.JB.changeQty('${item.id}',-1)"><i class="fas fa-minus"></i></button>
              <span class="qty-num">${item.qty}</span>
              <button class="qty-btn" onclick="window.JB.changeQty('${item.id}',1)"><i class="fas fa-plus"></i></button>
            </div>
            <span class="cart-item-price">R$ ${formatBRL(item.preco * item.qty)}</span>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  // Cálculos finais para o painel inferior (Resumo, Frete e Cupom)
  const descontoValor = subtotal * state.desconto;
  const valorFrete = state.entregaSelecionada?.valor || 0;
  const total = subtotal - descontoValor + valorFrete;
  const pix = total * 0.9;

  document.getElementById("resumo-subtotal").textContent = `R$ ${formatBRL(subtotal)}`;
  
  const descRow = document.getElementById("resumo-desconto-row");
  if (state.desconto > 0) {
      descRow.style.display = "flex";
      document.getElementById("resumo-desconto-label").textContent = `Desconto (${state.cupomCodigo})`;
      document.getElementById("resumo-desconto-val").textContent = `- R$ ${formatBRL(descontoValor)}`;
  } else {
      descRow.style.display = "none";
  }

  document.getElementById("resumo-frete").textContent = valorFrete === 0 ? "Grátis" : `R$ ${formatBRL(valorFrete)}`;
  document.getElementById("resumo-total").textContent = `R$ ${formatBRL(total)}`;
  
  const totalEl = document.getElementById("cart-total");
  const pixEl   = document.getElementById("cart-pix-val");
  if (totalEl) totalEl.textContent = `R$ ${formatBRL(total)}`;
  if (pixEl)   pixEl.textContent   = `💳 No PIX: R$ ${formatBRL(pix)} (10% OFF)`;
}

function openCart() {
  renderCart();
  document.getElementById("cart-overlay").classList.add("open");
}

function closeCart() {
  document.getElementById("cart-overlay").classList.remove("open");
}


/* ============================================================
   8. ENTREGA E CUPOM
   ============================================================ */

async function carregarEntregas() {
  state.locaisEntrega = [{ id: "retirada", nome: "📍 Retirada na Loja", valor: 0 }];
  try {
    const snap = await getDocs(query(collection(db, "locais_entrega"), orderBy("valor", "asc")));
    snap.forEach(d => {
      if (!state.locaisEntrega.some(l => l.id === d.id)) {
        const { nome, valor } = d.data();
        state.locaisEntrega.push({ id: d.id, nome: `🚚 ${nome}`, valor });
      }
    });
  } catch (_) {}
  
  renderizarFretes();
  renderCart();
}

function renderizarFretes() {
  const container = document.getElementById("frete-options-container");
  if (!container) return;
  container.innerHTML = state.locaisEntrega.map((opcao, idx) => {
    const ativo = state.entregaSelecionada?.id === opcao.id ? "ativo" : "";
    const nomeClean = opcao.nome;
    const precoTxt = opcao.valor === 0 ? "Grátis" : `R$ ${formatBRL(opcao.valor)}`;
    return `
      <div class="frete-card ${ativo}" onclick="window.JB.mudarEntrega(${idx})">
        <div class="frete-nome"><div class="radio-icon"></div>${nomeClean}</div>
        <div class="frete-valor">${precoTxt}</div>
      </div>`;
  }).join("");
}

function mudarEntrega(idx) {
  const opcao = state.locaisEntrega[idx];
  if (!opcao) return;
  state.entregaSelecionada = opcao;
  renderizarFretes();
  renderCart();
}

async function aplicarCupom() {
  const input = document.getElementById("input-cupom");
  const msg = document.getElementById("msg-cupom");
  const codigo = input?.value.trim().toUpperCase();

  if (!codigo) {
    state.desconto = 0;
    state.cupomCodigo = "";
    if (msg) msg.innerHTML = "";
    renderCart();
    return;
  }

  try {
    if(msg) msg.innerHTML = `<span style="color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Verificando...</span>`;
    const snap = await getDocs(query(collection(db, "cupons"), where("codigo", "==", codigo), where("ativo", "==", true)));
    
    if (!snap.empty) {
      const { desconto } = snap.docs[0].data();
      state.desconto = desconto;
      state.cupomCodigo = codigo;
      if (msg) msg.innerHTML = `<span class="cupom-ok"><i class="fas fa-check-circle"></i> Cupom de ${(desconto * 100).toFixed(0)}% aplicado!</span>`;
      toast(`Cupom de ${(desconto * 100).toFixed(0)}% ativado!`, "success");
    } else {
      state.desconto = 0;
      state.cupomCodigo = "";
      if (msg) msg.innerHTML = `<span class="cupom-erro"><i class="fas fa-times-circle"></i> Cupom inválido ou expirado.</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span class="cupom-erro"><i class="fas fa-exclamation-circle"></i> Erro ao verificar cupom.</span>`;
  }
  renderCart();
}


/* ============================================================
   9. FAVORITOS
   ============================================================ */

function saveWishlist() {
  _saveStorage(WISHLIST_KEY, state.wishlist);
  const count = state.wishlist.length;
  const badge = document.getElementById("wishlist-count");
  if (badge) { badge.textContent = count; badge.style.display = count ? "flex" : "none"; }
}

function toggleWish(e, id) {
  e.stopPropagation();
  if (state.wishlist.includes(id)) {
    state.wishlist = state.wishlist.filter(i => i !== id);
    toast("Removido dos favoritos", "info");
  } else {
    state.wishlist.push(id);
    toast("Adicionado aos favoritos!", "info");
  }
  saveWishlist();
  renderizarProdutos(_getFilteredProducts());
}

function renderWishlist() {
  const wrap  = document.getElementById("wishlist-items-wrap");
  const empty = document.getElementById("empty-wishlist");

  if (!state.wishlist.length) {
    if (empty) empty.style.display = "flex";
    if (wrap)  wrap.style.display  = "none";
    return;
  }

  if (empty) empty.style.display = "none";
  if (wrap)  wrap.style.display  = "block";

  if (wrap) {
    wrap.innerHTML = state.wishlist.map(id => {
      const p = state.produtos.find(pr => pr.id === id);
      if (!p) return "";
      const preco = parsePreco(p.preco);
      const imgSrc = p.galeria?.[0] || p.imagem || "";
      return `
      <div class="cart-item">
        <button class="remove-item" onclick="window.JB.toggleWish(event,'${p.id}');window.JB.renderWishlist();"><i class="fas fa-times"></i></button>
        <div class="cart-item-img">${imgSrc ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">` : `<i class="fas fa-image" style="font-size:1.5rem;color:var(--text-dim);"></i>`}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${p.nome}</div>
          <div class="cart-item-row" style="margin-top:8px;">
            <span class="cart-item-price">R$ ${formatBRL(preco)}</span>
            <button class="btn-buy" style="padding:6px 12px;font-size:0.78rem;" onclick="window.JB.addToCart(event,'${p.id}')">
              <i class="fas fa-bag-shopping"></i> Add
            </button>
          </div>
        </div>
      </div>`;
    }).join("");
  }
}


/* ============================================================
   10. CHECKOUT — WHATSAPP (INTEGRADO AO FIREBASE)
   ============================================================ */

async function enviarPedidoWhatsApp() {
  if (!state.carrinho.length) { toast("Sua sacola está vazia!", "warning"); return; }

  const nomeCliente = await pedirNome();
  if (!nomeCliente) return;

  const janelaZap = window.open("", "_blank");
  if (janelaZap) {
    janelaZap.document.write(`<html><head><title>Processando...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f8fafc;color:#334155;flex-direction:column;gap:12px;"><div style="font-size:2rem;">🚀</div><h2>Quase lá, ${nomeCliente}!</h2><p>Preparando seu pedido e registrando sistema...</p></body></html>`);
  }

  let subtotal = 0;
  const linhasItens = state.carrinho.map(item => {
    subtotal += item.preco * item.qty;
    return `▪️ ${item.qty}x ${item.nome} - R$ ${formatBRL(item.preco * item.qty)}`;
  });

  const desconto     = subtotal * state.desconto;
  const frete        = state.entregaSelecionada?.valor || 0;
  const total        = subtotal - desconto + frete;
  const nomeEntrega  = (state.entregaSelecionada?.nome || "Retirada").replace(/^[^\w\s]+ ?/, "");

  let texto =
    `*🛒 PEDIDO — JB IMPORTES*\n` +
    `*Cliente:* ${nomeCliente}\n\n` +
    linhasItens.join("\n") + "\n\n" +
    `📦 *Entrega:* ${nomeEntrega}\n` +
    `💵 Subtotal: R$ ${formatBRL(subtotal)}`;

  if (state.desconto > 0) texto += `\n🏷️ Cupom (${state.cupomCodigo}): − R$ ${formatBRL(desconto)}`;
  if (frete > 0)           texto += `\n🚚 Frete: R$ ${formatBRL(frete)}`;
  texto += `\n\n*💰 TOTAL: R$ ${formatBRL(total)}*`;

  _salvarPedidoBackground({ nomeCliente, texto, subtotal, desconto, frete, total, nomeEntrega });

  const url = `https://wa.me/${WPP_NUMBER}?text=${encodeURIComponent(texto)}`;
  if (janelaZap) {
    janelaZap.location.href = url;
  } else {
    window.location.href = url;
  }

  // Limpa o carrinho
  state.carrinho = [];
  saveCart();
  closeCart();
}

/** Salva pedido no banco */
async function _salvarPedidoBackground({ nomeCliente, texto, subtotal, desconto, frete, total, nomeEntrega }) {
  try {
    let risco = "⚠️ Análise pendente";
    // Análise IA via proxy (não precisa aguardar o cliente ir pro WhatsApp)
    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: `Atue como analista de fraudes. Leia este pedido e responda APENAS com "ALTO", "MEDIO" ou "BAIXO".\n\nPedido: ${texto}` }] }] }),
    })
    .then(r => r.json())
    .then(data => { risco = data.candidates[0].content.parts[0].text.trim().replace(/[^a-zA-Z]/g, '').toUpperCase(); })
    .catch(() => {})
    .finally(async () => {
        await addDoc(collection(db, "pedidos"), {
          data: Date.now(),
          dataString: new Date().toLocaleString("pt-BR"),
          clienteNome: nomeCliente,
          resumoItens: `${state.carrinho.length} itens`,
          total, subtotal,
          valorFrete: frete,
          valorDesconto: desconto,
          cupomNome: state.cupomCodigo,
          tipoEntrega: nomeEntrega,
          detalhesCarrinho: state.carrinho,
          sentinelScore: risco,
          origem: "Carrinho Site",
          status: "pendente",
          zapVendedor: WPP_NUMBER,
        });
    });

  } catch (e) {
    console.error("Erro ao salvar pedido:", e);
  }
}


/* ============================================================
   11. STYLIST IA
   ============================================================ */

function setChip(text) {
  const input = document.getElementById("stylist-input");
  if (input) { input.value = text; runStylist(); }
}

async function runStylist() {
  const input   = document.getElementById("stylist-input");
  const btn     = document.getElementById("stylist-btn");
  const result  = document.getElementById("stylist-result");
  const textEl  = document.getElementById("stylist-text");
  const ocasiao = input?.value.trim();

  if (!ocasiao) { toast("Digite uma ocasião primeiro!", "warning"); return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Criando...';
  result.classList.add("visible");
  textEl.innerHTML = '<span style="color:var(--text-dim)">Consultando a IA...</span>';

  try {
    const nomesProdutos = state.produtos.slice(0, 15).map((p) => p.nome).join(", ");
    const promptText = `Você é o Personal Stylist da loja "JB Importes". O cliente pediu um look para: "${ocasiao}". Use esses produtos como base se possível: ${nomesProdutos}. Seja direto, em português, animado e use emojis. Não use markdown (* ou **).`;

    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
    });

    const data = await res.json();
    const resposta = data.candidates[0].content.parts[0].text;

    textEl.innerHTML = "";
    let i = 0;
    const cursor = document.createElement("span");
    cursor.className = "typing-cursor";
    textEl.appendChild(cursor);

    const interval = setInterval(() => {
      if (i < resposta.length) {
        cursor.before(resposta[i] === "\n" ? document.createElement("br") : resposta[i]);
        i++;
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        clearInterval(interval);
        cursor.remove();
      }
    }, 10);
  } catch (_) {
    textEl.innerHTML = "Ops! A IA está indisponível agora. Mas a JB Importes tem de tudo! Mande mensagem no WhatsApp e te ajudamos. 👕👗📱";
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-magic"></i> Criar Look';
}


/* ============================================================
   12. BUSCA
   ============================================================ */

function configurarBusca() {
  const searchInput    = document.getElementById("search-input");
  const searchDropdown = document.getElementById("search-dropdown");
  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    if (!q) { searchDropdown.classList.remove("open"); return; }

    const results = state.produtos
      .filter(p => p.tagsBusca.includes(q))
      .slice(0, 5);

    if (!results.length) {
      searchDropdown.innerHTML = `<div class="search-result-item" style="justify-content:center;color:var(--text-muted);">Nenhum produto encontrado</div>`;
    } else {
      searchDropdown.innerHTML = results.map(p => {
        const preco  = parsePreco(p.preco);
        const imgSrc = p.galeria?.[0] || p.imagem || "";
        const imgEl  = imgSrc
          ? `<img src="${imgSrc}" onerror="this.style.display='none'">`
          : `<i class="fas fa-image" style="font-size:1.2rem;color:var(--text-dim);"></i>`;
        return `
        <div class="search-result-item" onclick="window.JB.openModal('${p.id}');document.getElementById('search-dropdown').classList.remove('open');document.getElementById('search-input').value='';">
          <div class="search-result-thumb">${imgEl}</div>
          <div>
            <div class="search-result-name">${p.nome}</div>
            <div class="search-result-price">R$ ${formatBRL(preco)}</div>
          </div>
        </div>`;
      }).join("");
    }
    searchDropdown.classList.add("open");
  });

  document.addEventListener("click", e => {
    if (!document.getElementById("search-wrap")?.contains(e.target))
      searchDropdown.classList.remove("open");
  });
}


/* ============================================================
   13. INICIALIZAÇÃO
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  console.log("🛒 JB Importes iniciando...");

  carregarBanners();
  carregarVitrine();
  carregarEntregas(); // Garante o carregamento dos fretes e logo desenha eles no carrinho

  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", e => { e.preventDefault(); filterCat(link.dataset.cat); });
  });

  document.querySelectorAll(".filter-tag").forEach(tag => {
    tag.addEventListener("click", () => {
      document.querySelectorAll(".filter-tag").forEach(t => t.classList.remove("active"));
      tag.classList.add("active");
      state.currentSort = tag.dataset.sort;
      renderizarProdutos(_getFilteredProducts());
    });
  });

  // Carrinho e Favoritos (Handlers)
  document.getElementById("cart-btn")?.addEventListener("click", openCart);
  document.getElementById("float-cart")?.addEventListener("click", openCart);
  document.getElementById("close-cart")?.addEventListener("click", closeCart);
  document.getElementById("cart-overlay")?.addEventListener("click", e => { if (e.target === document.getElementById("cart-overlay")) closeCart(); });
  document.getElementById("checkout-btn")?.addEventListener("click", enviarPedidoWhatsApp);

  document.getElementById("wishlist-btn")?.addEventListener("click", () => { renderWishlist(); document.getElementById("wishlist-overlay").classList.add("open"); });
  document.getElementById("close-wishlist")?.addEventListener("click", () => document.getElementById("wishlist-overlay").classList.remove("open"));
  document.getElementById("wishlist-overlay")?.addEventListener("click", e => { if (e.target === document.getElementById("wishlist-overlay")) document.getElementById("wishlist-overlay").classList.remove("open"); });

  // Modal 
  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document.getElementById("product-modal")?.addEventListener("click", e => { if (e.target === document.getElementById("product-modal")) closeModal(); });

  // Stylist
  document.getElementById("stylist-input")?.addEventListener("keydown", e => { if (e.key === "Enter") runStylist(); });

  // Scroll Header
  window.addEventListener("scroll", () => {
    document.getElementById("header")?.classList.toggle("scrolled", window.scrollY > 50);
    document.getElementById("back-top")?.classList.toggle("visible", window.scrollY > 400);
  });

  configurarBusca();
  updateCartUI();
  saveWishlist();

  console.log("✅ JB Importes pronto.");
});


/* ============================================================
   14. API PÚBLICA — window.JB
   ============================================================ */

window.JB = {
  filterCat,
  openModal,
  closeModal,
  addToCart,
  removeFromCart,
  changeQty,
  toggleWish,
  renderWishlist,
  setChip,
  runStylist,
  mudarEntrega,
  aplicarCupom
};

window.registrarClique = registrarInteresse;