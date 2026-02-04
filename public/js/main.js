/* public/js/main.js - VERSÃO FINAL COMPLETA (PARTE 1/2) */

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

// --- VARIÁVEIS DO FRETE ---
let listaLocaisEntrega = []; 
let entregaSelecionada = { id: 'retirada', nome: '📍 Retirada na Loja', valor: 0 };

// --- VARIÁVEL GLOBAL DE TAMANHO ---
window.tamanhoSelecionadoModal = "";

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

/* --- CARREGAR FRETE (COLE ISTO SUBSTITUINDO A ANTERIOR) --- */
async function carregarOpcoesEntrega() {
    // Limpa a lista para começar do zero
    listaLocaisEntrega = [{ id: 'retirada', nome: '📍 Retirada na Loja', valor: 0 }];
    
    try {
        const q = query(collection(db, "locais_entrega"), orderBy("valor", "asc"));
        const snap = await getDocs(q);
        
        snap.forEach(doc => {
            const dados = doc.data();
            
            // TRAVA DE SEGURANÇA: Só adiciona se o ID ainda não estiver na lista
            const existe = listaLocaisEntrega.some(item => item.id === doc.id);
            
            if (!existe) {
                listaLocaisEntrega.push({ 
                    id: doc.id, 
                    nome: `🚚 ${dados.nome}`, 
                    valor: dados.valor 
                });
            }
        });
        
        console.log("Locais carregados:", listaLocaisEntrega.length);
        
        // Atualiza a tela se o carrinho já estiver aberto
        if (carrinho.length > 0) {
            atualizarCarrinhoUI();
        }

    } catch (e) { console.error("Erro ao carregar frete:", e); }
}

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
/* public/js/main.js - VERSÃO FINAL COMPLETA (PARTE 2/2) */

function abrirDetalhes(id) {
    const produto = listaProdutosGlobal.find(p => p.id === id);
    if (!produto) return;
    
    // Reset da seleção de tamanho
    window.tamanhoSelecionadoModal = ""; 
    
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

    let htmlTamanhos = '';
    if (produto.tamanhos && produto.tamanhos.trim() !== "") {
        const lista = produto.tamanhos.split(',');
        htmlTamanhos = `
            <div class="seletor-tamanho">
                <h4 style="margin-bottom:8px; font-size:0.9rem;">Escolha o Tamanho:</h4>
                <div class="tamanhos-grid" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:15px;">
                    ${lista.map(t => `<button class="btn-tamanho-opcao" onclick="window.selecionarTamanhoUI(this)">${t.trim()}</button>`).join('')}
                </div>
            </div>`;
    }

    const estoque = (produto.estoque !== undefined) ? produto.estoque : 10;
    const isEsgotado = estoque <= 0;
    const botoesAcao = isEsgotado 
        ? `<button class="btn-comprar-agora" disabled style="background:#ccc;">Produto Esgotado</button>` 
        : `<button class="btn-comprar-agora" data-action="comprar-direto" data-id="${produto.id}">
             <i class="fab fa-whatsapp"></i> Comprar Agora
           </button>
           <button class="btn-add-detalhe" data-action="adicionar-carrinho" data-id="${produto.id}">
             <i class="fas fa-cart-plus"></i> Adicionar à Sacola
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
            
            ${htmlTamanhos}

            <div class="descricao-box">
                <h4>Descrição</h4>
                <p>${produto.descricao ? produto.descricao.replace(/\n/g, '<br>') : 'Sem descrição detalhada.'}</p>
            </div>
            <div class="acoes-detalhe">${botoesAcao}</div>
        </div>`;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; 
}

window.selecionarTamanhoUI = (el) => {
    document.querySelectorAll('.btn-tamanho-opcao').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    window.tamanhoSelecionadoModal = el.innerText;
};

function trocarFotoPrincipal(el, src) {
    document.getElementById('img-principal-modal').src = src;
    document.querySelectorAll('.miniatura-item').forEach(i => i.classList.remove('ativa'));
    el.classList.add('ativa');
}

function fecharModalDetalhes() {
    document.getElementById('modal-detalhes').style.display = 'none';
    document.body.style.overflow = 'auto';
    window.tamanhoSelecionadoModal = "";
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

    if (produto.tamanhos && produto.tamanhos.trim() !== "" && !window.tamanhoSelecionadoModal) {
        alert("Por favor, selecione um TAMANHO antes de adicionar à sacola.");
        return;
    }

    const existe = carrinho.find(item => item.id === id && item.tamanho === window.tamanhoSelecionadoModal);
    
    if (existe) {
        existe.qtd++;
    } else {
        const precoNum = parsePreco(produto.preco);
        carrinho.push({ 
            id: produto.id, 
            nome: produto.nome, 
            tamanho: window.tamanhoSelecionadoModal,
            preco: precoNum, 
            imagem: (produto.galeria && produto.galeria.length > 0) ? produto.galeria[0] : produto.imagem, 
            qtd: 1 
        });
    }
    
    salvarCarrinho();
    fecharModalDetalhes(); 
    toggleCart();
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
                            <strong>${item.nome} ${item.tamanho ? `(${item.tamanho})` : ''}</strong>
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

window.mudarEntrega = (index) => {
    entregaSelecionada = listaLocaisEntrega[index];
    const totalItens = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
    atualizarTotais(totalItens);
};

// --- FUNÇÃO CORRIGIDA PARA LAYOUT VERTICAL NO CELULAR ---
function atualizarTotais(subtotal) {
    const footer = document.querySelector('.cart-footer');
    if (!footer) return;
    
    const descontoValor = subtotal * descontoAtivo;
    const valorFrete = entregaSelecionada ? entregaSelecionada.valor : 0;
    const totalFinal = (subtotal - descontoValor) + valorFrete;

    // Garante que a lista não esteja vazia
    if (!listaLocaisEntrega || listaLocaisEntrega.length === 0) {
        listaLocaisEntrega = [{ id: 'retirada', nome: '📍 Retirada na Loja', valor: 0 }];
    }

    // --- AQUI ESTÁ A MUDANÇA: CRIA CARTÕES EM VEZ DE SELECT ---
    const htmlFretes = listaLocaisEntrega.map((opcao, index) => {
        // Verifica se é a opção selecionada para pintar de laranja
        const isSelected = (entregaSelecionada && opcao.id === entregaSelecionada.id);
        const classeAtiva = isSelected ? 'ativo' : '';
        const precoTxt = opcao.valor === 0 ? 'Grátis' : `R$ ${opcao.valor.toFixed(2)}`;
        
        // Retorna um cartão clicável
        return `
            <div class="frete-card ${classeAtiva}" onclick="window.mudarEntrega(${index})">
                <div class="frete-nome">
                    <div class="radio-icon"></div>
                    ${opcao.nome.replace('🚚 ', '').replace('📍 ', '')}
                </div>
                <div class="frete-valor">${precoTxt}</div>
            </div>
        `;
    }).join('');

    footer.innerHTML = `
        <div style="background: #f8fafc; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
            <label style="display:block; font-size: 0.95rem; font-weight: 700; color: #334155; margin-bottom: 12px;">
                <i class="fas fa-map-marker-alt"></i> Onde você quer receber?
            </label>
            
            <div class="frete-options-container">
                ${htmlFretes}
            </div>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 15px;">
            <input type="text" id="input-cupom" placeholder="CUPOM" style="flex: 1; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; text-transform: uppercase;">
            <button data-action="aplicar-cupom" style="background: #334155; color: white; border: none; padding: 0 20px; border-radius: 8px; font-weight: bold; cursor: pointer;">OK</button>
        </div>
        <div id="msg-cupom" style="margin-bottom: 10px; font-size: 0.85rem; min-height: 20px;">
            ${descontoAtivo > 0 ? `<span style="color:green; font-weight:bold;">✅ Desconto aplicado!</span>` : ''}
        </div>
        
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="color: #64748b; font-size: 0.95rem;">Subtotal:</span>
                <span style="font-weight: 600; color: #1e293b;">R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            
            ${descontoAtivo > 0 ? `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="color: #16a34a;">Desconto:</span>
                <span style="color: #16a34a; font-weight: 600;">- R$ ${descontoValor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>` : ''}
            
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="color: #64748b; font-size: 0.95rem;">Frete:</span>
                <span style="color: #ff5100; font-weight: 600;">
                    ${valorFrete === 0 ? 'Grátis' : `R$ ${valorFrete.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`}
                </span>
            </div>
            
            <div style="border-top: 2px dashed #cbd5e1; margin-top: 5px; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="font-size: 1.2rem; font-weight: 800; color: #0f172a;">Total:</span>
                <span style="font-size: 1.4rem; font-weight: 800; color: #0f172a;">R$ ${totalFinal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
        </div>

        <button class="btn-checkout" data-action="enviar-whatsapp" style="margin-top: 20px; width: 100%; padding: 16px; background: #22c55e; color: white; border: none; border-radius: 12px; font-weight: 800; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;">
            <i class="fab fa-whatsapp"></i> Finalizar Compra
        </button>`;
}

function toggleCart() {
    const m = document.getElementById('cart-modal');
    const vaiAbrir = m.style.display !== 'flex';
    m.style.display = vaiAbrir ? 'flex' : 'none';
    document.body.style.overflow = vaiAbrir ? 'hidden' : 'auto';
}

async function comprarDireto(id) {
    const produto = listaProdutosGlobal.find(p => p.id === id);
    if (!produto) return;

    if (produto.tamanhos && produto.tamanhos.trim() !== "" && !window.tamanhoSelecionadoModal) {
        alert("Por favor, selecione um TAMANHO antes de comprar.");
        return;
    }

    const nomeCliente = prompt("Qual seu NOME?");
    if (!nomeCliente) return;

    // --- CORREÇÃO AQUI: ABRE A JANELA IMEDIATAMENTE ---
    // Abre uma janela em branco AGORA, antes de ir pro banco de dados
    const janelaZap = window.open('', '_blank');
    if (janelaZap) {
        janelaZap.document.write("<html><body><h2 style='text-align:center; margin-top:50px; font-family:sans-serif;'>Aguarde... gerando seu pedido! 🚀</h2></body></html>");
    }

    const tamanhoTxt = window.tamanhoSelecionadoModal ? `\n📏 Tamanho: ${window.tamanhoSelecionadoModal}` : '';

    try {
        await addDoc(collection(db, "pedidos"), {
            data: Date.now(),
            clienteNome: nomeCliente,
            clienteZap: "Via WhatsApp", 
            resumoItens: produto.nome + (window.tamanhoSelecionadoModal ? ` (${window.tamanhoSelecionadoModal})` : ''),
            total: produto.preco, 
            status: "pendente",
            zapVendedor: "5583996695516"
        });
    } catch (e) { console.error("Erro pedido direto:", e); }

    const msg = `*👋 Olá JB Importes!*

Me chamo *${nomeCliente}* e quero:
🔹 *${produto.nome}*${tamanhoTxt}
💰 Valor: ${produto.preco}`;

    const linkZap = `https://wa.me/5583996695516?text=${encodeURIComponent(msg)}`;

    // --- REDIRECIONA A JANELA QUE JÁ ESTAVA ABERTA ---
    if (janelaZap) {
        janelaZap.location.href = linkZap;
    } else {
        window.location.href = linkZap;
    }
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

async function enviarPedidoWhatsApp() {
    if (carrinho.length === 0) return; 

    const nomeCliente = prompt("Qual seu NOME?");
    if (!nomeCliente) return;

    let totalProdutos = 0;
    let texto = `*🛒 PEDIDO SITE - JB IMPORTES*\n*Cliente:* ${nomeCliente}\n`;
    
    carrinho.forEach(item => {
        const sub = item.preco * item.qtd;
        totalProdutos += sub;
        const tamTxt = item.tamanho ? ` [Tam: ${item.tamanho}]` : '';
        texto += `▪️ ${item.qtd}x ${item.nome}${tamTxt}\n`;
    });
    
    const desc = totalProdutos * descontoAtivo;
    const valorFrete = entregaSelecionada.valor;
    const final = (totalProdutos - desc) + valorFrete;

    texto += `\n📦 *Modo de Entrega:* ${entregaSelecionada.nome}`;
    texto += `\n\n💵 Subtotal: R$ ${totalProdutos.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (descontoAtivo > 0) texto += `\n🏷️ Desconto: - R$ ${desc.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (valorFrete > 0) texto += `\n🚚 Frete: R$ ${valorFrete.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    texto += `\n\n*💰 TOTAL A PAGAR: R$ ${final.toLocaleString('pt-BR', {minimumFractionDigits: 2})}*`;

    try {
        await addDoc(collection(db, "pedidos"), {
            data: Date.now(),
            clienteNome: nomeCliente,
            clienteZap: "Via WhatsApp", 
            endereco: "A combinar no WhatsApp",
            tipoEntrega: entregaSelecionada.nome,
            valorFrete: valorFrete,
            resumoItens: `${carrinho.length} itens (Carrinho)`, 
            detalhesCarrinho: carrinho,
            total: final, 
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
    
    carregarOpcoesEntrega().then(() => {
        atualizarCarrinhoUI();
    });

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
/* --- GATILHO INICIAL: CARREGAR DADOS AO ABRIR O SITE --- */
document.addEventListener("DOMContentLoaded", () => {
    console.log("Iniciando a loja...");

    // 1. Carrega os produtos
    if (typeof carregarProdutos === 'function') {
        carregarProdutos();
    }

    // 2. Carrega as cidades/frete IMEDIATAMENTE
    if (typeof carregarOpcoesEntrega === 'function') {
        carregarOpcoesEntrega();
    }
    
    // 3. Atualiza o carrinho visualmente (caso tenha itens salvos)
    atualizarCarrinhoUI();
});