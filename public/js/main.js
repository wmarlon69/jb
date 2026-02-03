/* public/js/main.js - VERSÃO FINAL ATUALIZADA - PARTE 1 */

import { db } from "../core/firebase-config.js";
import { 
    collection, getDocs, getDoc, doc, updateDoc, increment, query, where, orderBy, onSnapshot, addDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CACHE_KEY = 'jb_produtos_cache';
const CACHE_TIME_KEY = 'jb_produtos_time';
const TEMPO_EXPIRACAO = 10 * 60 * 1000;

let carrinho = JSON.parse(localStorage.getItem('cart_jb')) || [];
let listaProdutosGlobal = [];
let descontoAtivo = 0;

const estruturaCategorias = {
    "todos": { label: "Tudo", icon: "th-large", subs: [] },
    "feminino": { label: "Feminino", icon: "female", subs: ["Vestidos", "Blusas", "Calças", "Shorts", "Conjuntos"] },
    "masculino": { label: "Masculino", icon: "male", subs: ["Camisetas", "Polos", "Bermudas", "Jeans"] },
    "infantil": { label: "Infantil", icon: "child", subs: ["Menino", "Menina", "Calçados"] },
    "eletronicos": { label: "Eletrônicos", icon: "mobile-alt", subs: ["Celulares", "Fones", "Acessórios"] },
    "promocao": { label: "Ofertas", icon: "fire", subs: [] }
};

// --- FUNÇÕES PRINCIPAIS ---

async function carregarBannersHome() {
    console.log("Iniciando carregarBannersHome");
    const container = document.getElementById('slider-principal') || document.querySelector('.hero-slider-container');
    if (!container) return;
    
    container.innerHTML = '';
    let temBanner = false, bannersEncontrados = 0;
    
    for (let i = 1; i <= 3; i++) {
        try {
            const docRef = doc(db, "banners_fixos", `slot_${i}`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const b = docSnap.data();
                const slide = document.createElement('div');
                slide.className = (!temBanner) ? 'hero-slide active' : 'hero-slide';
                slide.style.backgroundImage = `url('${b.imagem}')`;
                slide.innerHTML = `<div class="hero-overlay"></div>`;
                container.appendChild(slide);
                temBanner = true;
                bannersEncontrados++;
            }
        } catch (e) { 
            console.error("Erro ao carregar banner slot", i, e); 
        }
    }
    
    if (!temBanner) {
        container.innerHTML = `
            <div class="hero-slide active" style="background: linear-gradient(45deg, #0f172a, #334155); display: flex; align-items: center; justify-content: center;">
                <div class="hero-content" style="text-align: center; color: white;"><h1>Bem-vindo à Loja</h1><p>Confira nossas ofertas!</p></div>
            </div>`;
    } else {
        iniciarAnimacaoSlider(bannersEncontrados);
    }
}

function iniciarAnimacaoSlider(qtd) {
    if (qtd < 2) return;
    const slides = document.querySelectorAll('.hero-slide');
    let indexAtual = 0;
    setInterval(() => {
        slides[indexAtual].classList.remove('active');
        indexAtual = (indexAtual + 1) % slides.length;
        slides[indexAtual].classList.add('active');
    }, 5000);
}

// --- CARREGAR VITRINE (VERSÃO TEMPO REAL) ---
function carregarVitrine() {
    const container = document.getElementById('lista-produtos');
    if (!container) return;

    if (listaProdutosGlobal.length === 0) {
        container.innerHTML = Array(4).fill('<div class="skeleton-card"></div>').join('');
    }

    const q = query(collection(db, "produtos"), orderBy("nome"));

    onSnapshot(q, (querySnapshot) => {
        if (querySnapshot.empty) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:50px;">Nenhum produto cadastrado.</div>`;
            return;
        }

        listaProdutosGlobal = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const termo = `${data.nome} ${data.marca||''} ${data.categoria} ${data.subcategoria||''}`;
            return { id: docSnap.id, ...data, tagsBusca: normalizarTexto(termo) };
        });

        renderizarProdutos(listaProdutosGlobal);
        
    }, (error) => {
        console.error("Erro no Tempo Real:", error);
        container.innerHTML = '<p style="text-align:center;">Erro ao sincronizar produtos.</p>';
    });
}

function renderizarProdutos(lista) {
    const container = document.getElementById('lista-produtos');
    container.innerHTML = '';
    if (lista.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888;">Nenhum item encontrado.</div>`;
        return;
    }
    const fragmento = document.createDocumentFragment();
    lista.forEach((produto) => {
        const estoque = produto.estoque !== undefined ? produto.estoque : 10;
        const isEsgotado = estoque <= 0;
        const fotoCapa = (produto.galeria && produto.galeria.length > 0) ? produto.galeria[0] : produto.imagem;
        const resumoVitrine = produto.resumo ? `<p style="font-size: 0.75rem; color: #666; margin-bottom: 5px; line-height: 1.2;">${produto.resumo}</p>` : '';
        let seloHTML = "";
        if (!isEsgotado && produto.precoAntigo) {
            const pAntigo = parsePreco(produto.precoAntigo), pAtual = parsePreco(produto.preco);
            if (pAntigo > pAtual) {
                const off = Math.round(((pAntigo - pAtual) / pAntigo) * 100);
                if (off > 0) seloHTML = `<span class="badge-desconto">${off}% OFF</span>`;
            }
        }
        if (isEsgotado) seloHTML = `<div class="selo-esgotado">ESGOTADO</div>`;

        const card = document.createElement('div');
        card.className = `card-produto ${isEsgotado ? 'card-esgotado' : ''}`;
        card.innerHTML = `
            ${seloHTML}
            <div class="img-container" data-action="abrir-detalhes" data-id="${produto.id}">
                <img src="${fotoCapa}" alt="${produto.nome}" loading="lazy">
            </div>
            <div class="info-produto" data-action="abrir-detalhes" data-id="${produto.id}">
                <span class="marca-item">${produto.categoria}</span>
                <h3>${produto.nome}</h3>
                ${resumoVitrine}
                <div class="precos-area">
                    ${produto.precoAntigo ? `<span class="preco-de">${produto.precoAntigo}</span>` : ''}
                    <span class="preco-por">${produto.preco}</span>
                </div>
            </div>
            <div class="acoes-card-duplo">
                ${isEsgotado ? 
                    `<button class="btn-comprar-agora-card" disabled style="background:#ccc; cursor:not-allowed;">Indisponível</button>` : 
                    `<button class="btn-comprar-agora-card" data-action="comprar-direto" data-id="${produto.id}">Comprar</button>
                     <button class="btn-add-cart-icone" data-action="adicionar-carrinho" data-id="${produto.id}">
                        <i class="fas fa-cart-plus"></i>
                     </button>`
                }
            </div>`;
        fragmento.appendChild(card);
    });
    container.appendChild(fragmento);
}
/* public/js/main.js - VERSÃO FINAL ATUALIZADA - PARTE 2 */

function abrirDetalhes(id) {
    const produto = listaProdutosGlobal.find(p => p.id === id);
    if (!produto) return;
    registrarInteresse(id); 
    const modal = document.getElementById('modal-detalhes');
    const container = document.getElementById('conteudo-modal-dinamico');
    const imagens = produto.galeria || [produto.imagem];
    let htmlMiniaturas = '';
    if (imagens.length > 1) {
        htmlMiniaturas = `<div class="miniaturas-scroll">
            ${imagens.map((img, i) => `<img src="${img}" class="miniatura-item ${i===0?'ativa':''}" data-action="trocar-foto" data-src="${img}">`).join('')}
            </div>`;
    }
    const estoque = (produto.estoque !== undefined) ? produto.estoque : 10;
    const isEsgotado = estoque <= 0;
    const botoesAcao = isEsgotado 
        ? `<button class="btn-comprar-agora" disabled style="background:#ccc;">Produto Esgotado</button>` 
        : `<button class="btn-comprar-agora" data-action="comprar-direto" data-id="${produto.id}">
             <i class="fab fa-whatsapp"></i> Comprar
           </button>
           <button class="btn-add-detalhe" data-action="adicionar-carrinho" data-id="${produto.id}">
             <i class="fas fa-cart-plus"></i>
           </button>`;
    container.innerHTML = `
        <div class="modal-galeria-container">
            <img id="img-principal-modal" src="${imagens[0]}" class="foto-principal">
            ${htmlMiniaturas}
        </div>
        <div class="modal-info-container">
            <span class="marca-detalhe">${produto.categoria} > ${produto.subcategoria || ''}</span>
            <h2 class="titulo-detalhe">${produto.nome}</h2>
            <p class="preco-por-grande">${produto.preco}</p>
            <div class="descricao-box">
                <h4>Descrição</h4>
                <p>${produto.descricao ? produto.descricao.replace(/\n/g, '<br>') : 'Sem descrição detalhada.'}</p>
            </div>
            <div class="acoes-detalhe">${botoesAcao}</div>
        </div>`;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; 
}

function trocarFotoPrincipal(el, src) {
    document.getElementById('img-principal-modal').src = src;
    document.querySelectorAll('.miniatura-item').forEach(i => i.classList.remove('ativa'));
    el.classList.add('ativa');
}

function fecharModalDetalhes() {
    document.getElementById('modal-detalhes').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function iniciarSistemaDeCategorias() {
    const trilho = document.getElementById('trilho-principal');
    if (!trilho) return;
    let subContainer = document.getElementById('sub-trilho');
    if (!subContainer) {
        subContainer = document.createElement('div');
        subContainer.id = 'sub-trilho';
        subContainer.className = 'trilho-categorias sub-trilho';
        subContainer.style.display = 'none'; 
        trilho.parentNode.insertBefore(subContainer, trilho.nextSibling);
    }
    Object.keys(estruturaCategorias).forEach(key => {
        const btn = document.createElement('button');
        btn.className = `btn-cat-premium ${key==='todos'?'active':''}`;
        btn.innerHTML = `<i class="fas fa-${estruturaCategorias[key].icon}"></i> ${estruturaCategorias[key].label}`;
        btn.dataset.action = 'filtrar-categoria';
        btn.dataset.cat = key;
        trilho.appendChild(btn);
    });
}

function mostrarSubcategorias(categoria) {
    const container = document.getElementById('sub-trilho');
    if (!container) return;
    const subs = estruturaCategorias[categoria]?.subs || [];
    container.innerHTML = '';
    if (subs.length > 0) {
        container.style.display = 'flex'; 
        container.innerHTML += `<button class="chip-sub active" data-action="filtrar-sub" data-cat="${categoria}" data-sub="">Todos</button>`;
        subs.forEach(sub => {
            container.innerHTML += `<button class="chip-sub" data-action="filtrar-sub" data-cat="${categoria}" data-sub="${sub}">${sub}</button>`;
        });
    } else {
        container.style.display = 'none'; 
    }
}

function filtrarSub(btn, cat, sub) {
    document.querySelectorAll('.chip-sub').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (sub === '') {
        filtrarPorCategoria(cat); 
    } else {
        const termo = normalizarTexto(sub);
        const filtrados = listaProdutosGlobal.filter(p => 
            p.categoria === cat && normalizarTexto(p.subcategoria || "").includes(termo)
        );
        renderizarProdutos(filtrados);
    }
}

function filtrarPorCategoria(cat) {
    if (cat === 'todos') { renderizarProdutos(listaProdutosGlobal); } else { renderizarProdutos(listaProdutosGlobal.filter(p => p.categoria === cat)); }
}

function adicionarAoCarrinho(id) {
    const produto = listaProdutosGlobal.find(p => p.id === id);
    if (!produto) return;
    const existe = carrinho.find(item => item.id === id);
    if (existe) {
        existe.qtd++;
    } else {
        const precoNum = parsePreco(produto.preco);
        carrinho.push({ id: produto.id, nome: produto.nome, preco: precoNum, imagem: (produto.galeria && produto.galeria.length > 0) ? produto.galeria[0] : produto.imagem, qtd: 1 });
    }
    salvarCarrinho();
    fecharModalDetalhes(); 
    const modalCart = document.getElementById('cart-modal');
    if (modalCart.style.display !== 'flex') {
        toggleCart();
    }
}

function removerItem(idx) {
    carrinho.splice(idx, 1);
    salvarCarrinho();
}

function alterarQuantidade(idx, delta) {
    if (carrinho[idx]) {
        carrinho[idx].qtd += delta;
        if (carrinho[idx].qtd <= 0) carrinho.splice(idx, 1);
        salvarCarrinho();
    }
}

function salvarCarrinho() {
    localStorage.setItem('cart_jb', JSON.stringify(carrinho));
    atualizarCarrinhoUI();
}

function atualizarCarrinhoUI() {
    const countBadge = document.getElementById('cart-count');
    const floatBtn = document.getElementById('cart-float');
    const lista = document.getElementById('cart-items');
    const totalItens = carrinho.reduce((acc, item) => acc + item.qtd, 0);

    if (countBadge) {
        countBadge.innerText = totalItens;
        floatBtn.style.display = totalItens > 0 ? 'flex' : 'none';
    }

    if (lista) {
        const footer = document.querySelector('.cart-footer');
        if (carrinho.length === 0) {
            lista.innerHTML = '<div style="text-align:center; padding:30px; color:#999;"><i class="fas fa-shopping-basket" style="font-size:3rem; margin-bottom:10px;"></i><br>Sua sacola está vazia.</div>';
            if (footer) footer.style.display = 'none';
        } else {
            if (footer) footer.style.display = 'block';
            let total = 0;
            lista.innerHTML = carrinho.map((item, idx) => {
                const sub = item.preco * item.qtd;
                total += sub;
                return `
                    <div class="cart-item">
                        <div class="cart-item-img"><img src="${item.imagem}"></div>
                        <div class="cart-item-info">
                            <strong>${item.nome}</strong>
                            <span>R$ ${sub.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        </div>
                        <div class="qtd-selector">
                            <button class="btn-qtd" data-action="alterar-qtd" data-idx="${idx}" data-delta="-1">-</button>
                            <span class="qtd-numero">${item.qtd}</span>
                            <button class="btn-qtd" data-action="alterar-qtd" data-idx="${idx}" data-delta="1">+</button>
                            <button class="remove-btn" data-action="remover-item" data-idx="${idx}"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`;
            }).join('');
            atualizarTotais(total);
        }
    }
}

function atualizarTotais(subtotal) {
    const footer = document.querySelector('.cart-footer');
    if (!footer) return;
    const descontoValor = subtotal * descontoAtivo;
    const totalFinal = subtotal - descontoValor;
    footer.innerHTML = `
        <div class="cupom-area">
            <div class="cupom-input-group">
                <input type="text" id="input-cupom" placeholder="CUPOM">
                <button data-action="aplicar-cupom">APLICAR</button>
            </div>
            <small id="msg-cupom">${descontoAtivo > 0 ? `<span style="color:green; font-weight:bold;">Desconto ativo!</span>` : ''}</small>
        </div>
        <div class="cart-total">
            <span>Total:</span>
            <div style="text-align:right">
                ${descontoAtivo > 0 ? `<div style="font-size:0.9rem; color:red; text-decoration:line-through;">R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>` : ''}
                <span style="font-size:1.4rem;">R$ ${totalFinal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
        </div>
        <button class="btn-checkout" data-action="enviar-whatsapp">
            <i class="fab fa-whatsapp"></i> Finalizar Compra
        </button>`;
}

function toggleCart() {
    const m = document.getElementById('cart-modal');
    m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
}

// --- FUNÇÃO ATUALIZADA: PEDE NOME E ZAP ANTES DE REGISTRAR ---
async function comprarDireto(id) {
    const produto = listaProdutosGlobal.find(p => p.id === id);
    if (!produto) return;
    registrarInteresse(id);

    // 1. Pergunta o nome
    const nomeCliente = prompt("Para agilizar seu pedido, qual seu NOME?");
    if (!nomeCliente) return;

    // 2. Pergunta o Zap (IMPORTANTE PARA O ADMIN)
    let zapCliente = prompt("Informe seu WhatsApp (DDD+Número) para contato:");
    if (!zapCliente) return;
    zapCliente = zapCliente.replace(/\D/g, ''); // Remove traços e parenteses

    // 3. Salva no Firebase
    try {
        await addDoc(collection(db, "pedidos"), {
            data: Date.now(),
            clienteNome: nomeCliente,
            clienteZap: zapCliente, // Agora salvamos o zap do cliente!
            resumoItens: produto.nome,
            total: produto.preco, 
            status: "pendente",
            zapVendedor: "5583996695516"
        });
    } catch (e) { console.error("Erro ao registrar pedido:", e); }

    // 4. Abre WhatsApp da loja
    const msg = `*👋 Olá JB Importes!*

Me chamo *${nomeCliente}* e tenho interesse no produto:
🔹 *${produto.nome}*
💰 Valor: ${produto.preco}

Ainda está disponível?`;
    window.open(`https://wa.me/5583996695516?text=${encodeURIComponent(msg)}`, '_blank');
}

async function aplicarCupom() {
    const input = document.getElementById('input-cupom');
    const msg = document.getElementById('msg-cupom');
    const codigo = input.value.trim().toUpperCase();
    if (!codigo) { descontoAtivo = 0; salvarCarrinho(); return; }
    try {
        const q = query(collection(db, "cupons"), where("codigo", "==", codigo));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const dados = snap.docs[0].data();
            descontoAtivo = dados.desconto;
            msg.innerHTML = `<span style="color:green">Cupom de ${(dados.desconto*100).toFixed(0)}% aplicado!</span>`;
        } else {
            descontoAtivo = 0;
            msg.innerHTML = `<span style="color:red">Cupom inválido.</span>`;
        }
    } catch (e) { console.error(e); }
    salvarCarrinho();
}

// --- FUNÇÃO CARRINHO ATUALIZADA: PEDE NOME E ZAP ---
async function enviarPedidoWhatsApp() {
    if (carrinho.length === 0) return; 

    const nomeCliente = prompt("Para finalizar, qual seu NOME?");
    if (!nomeCliente) return;

    let zapCliente = prompt("Informe seu WhatsApp (DDD+Número):");
    if (!zapCliente) return;
    zapCliente = zapCliente.replace(/\D/g, '');

    let total = 0;
    let texto = `*🛒 PEDIDO SITE - JB IMPORTES*\n*Cliente:* ${nomeCliente}\n\n`;
    
    carrinho.forEach(item => {
        const sub = item.preco * item.qtd;
        total += sub;
        texto += `▪️ ${item.qtd}x ${item.nome}\n`;
    });
    
    const desc = total * descontoAtivo;
    const final = total - desc;
    const valorFinalFormatado = final.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

    texto += `\nSubtotal: R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (descontoAtivo > 0) texto += `\nDesconto: -R$ ${desc.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    texto += `\n*TOTAL: ${valorFinalFormatado}*`;

    try {
        await addDoc(collection(db, "pedidos"), {
            data: Date.now(),
            clienteNome: nomeCliente,
            clienteZap: zapCliente, // Salvando zap
            resumoItens: `${carrinho.length} itens (Carrinho)`, 
            detalhesCarrinho: carrinho,
            total: valorFinalFormatado,
            status: "pendente",
            zapVendedor: "5583996695516"
        });
    } catch (e) { console.error("Erro carrinho:", e); }

    window.open(`https://wa.me/5583996695516?text=${encodeURIComponent(texto)}`, '_blank');
}

function normalizarTexto(t) { return String(t).normalize('NFD').replace(/[̀-ͯ]/g, "").toLowerCase(); }
function parsePreco(v) { return typeof v === 'number' ? v : parseFloat(String(v).replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0; }
async function registrarInteresse(id) { try { await updateDoc(doc(db, "produtos", id), { cliques: increment(1) }); } catch (e) {} }

function configurarBusca() {
    const input = document.getElementById('inputBusca');
    if (input) {
        input.addEventListener('input', (e) => {
            const termo = normalizarTexto(e.target.value);
            renderizarProdutos(listaProdutosGlobal.filter(p => p.tagsBusca.includes(termo)));
        });
    }
}

// --- EVENT HANDLER ---

function masterEventHandler(event) {
    const el = event.target;
    const actionElement = el.closest('[data-action]');
    if (!actionElement) return;

    const action = actionElement.dataset.action;
    const id = actionElement.dataset.id;

    switch (action) {
        case 'abrir-detalhes':
            abrirDetalhes(id);
            break;
        case 'comprar-direto':
            comprarDireto(id);
            break;
        case 'adicionar-carrinho':
            adicionarAoCarrinho(id);
            break;
        case 'trocar-foto':
            trocarFotoPrincipal(actionElement, actionElement.dataset.src);
            break;
        case 'fechar-modal':
            fecharModalDetalhes();
            break;
        case 'toggle-cart':
            toggleCart();
            break;
        case 'remover-item':
            removerItem(parseInt(actionElement.dataset.idx));
            break;
        case 'alterar-qtd':
            alterarQuantidade(parseInt(actionElement.dataset.idx), parseInt(actionElement.dataset.delta));
            break;
        case 'aplicar-cupom':
            aplicarCupom();
            break;
        case 'enviar-whatsapp':
            enviarPedidoWhatsApp();
            break;
        case 'filtrar-categoria':
            document.querySelectorAll('.btn-cat-premium').forEach(b => b.classList.remove('active'));
            actionElement.classList.add('active');
            mostrarSubcategorias(actionElement.dataset.cat);
            filtrarPorCategoria(actionElement.dataset.cat);
            break;
        case 'filtrar-sub':
             filtrarSub(actionElement, actionElement.dataset.cat, actionElement.dataset.sub);
            break;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    carregarBannersHome();
    carregarVitrine();
    iniciarSistemaDeCategorias();
    configurarBusca();
    atualizarCarrinhoUI();

    document.body.addEventListener('click', masterEventHandler);

    const fecharModalBtn = document.querySelector('.fechar-modal');
    if(fecharModalBtn) {
        fecharModalBtn.dataset.action = 'fechar-modal';
    }

    const cartFloatBtn = document.getElementById('cart-float');
    if(cartFloatBtn) {
       cartFloatBtn.dataset.action = 'toggle-cart';
    }
     const cartCloseBtn = document.getElementById('close-cart-btn');
    if(cartCloseBtn) {
       cartCloseBtn.dataset.action = 'toggle-cart';
    }
});

// --- CÓDIGO DO PWA (Mantido do index.html para referência futura) ---
// Para ativar a instalação do App, descomente as linhas abaixo quando tiver o service-worker.js
/*
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(e => console.log('PWA:', e));
}
*/