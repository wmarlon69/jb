/* public/js/inventory.js - VERSÃO COM SUPORTE A TAMANHOS */

import { db, auth } from "../core/firebase-config.js";
import { 
    collection, addDoc, getDocs, deleteDoc, doc, updateDoc, 
    query, orderBy, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const IMGBB_API_KEY = "34d295b9b31667727e045870489fb873";
const SUBCATEGORIAS = {
    "feminino": ["Vestidos", "Blusas & Croppeds", "Calças & Jeans", "Shorts & Saias", "Conjuntos", "Moda Praia"],
    "masculino": ["Camisetas", "Camisas Polo", "Bermudas", "Calças Jeans", "Bonés", "Acessórios"],
    "infantil": ["Conjuntos Menino", "Conjuntos Menina", "Calçados", "Recém Nascido"],
    "eletronicos": ["Smartphones", "Smartwatches", "Fones de Ouvido", "Carregadores", "Capinhas"],
    "promocao": ["Queima de Estoque", "Leve 3 Pague 2", "Desconto Relâmpago"]
};

let idProdutoEmEdicao = null;
let galeriaAtual = [];

function configurarUploadGaleria() {
    const fileInput = document.getElementById('input-arquivo-foto');
    const statusTxt = document.getElementById('status-upload');
    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        if (galeriaAtual.length + files.length > 5) { alert("Máximo de 5 fotos!"); return; }

        statusTxt.innerText = `⏳ Enviando...`;
        for (const file of files) {
            const formData = new FormData();
            formData.append("image", file);
            try {
                const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
                const data = await response.json();
                if (data.success) {
                    galeriaAtual.push(data.data.url);
                    window.renderizarGaleria();
                }
            } catch (error) { console.error("Erro upload:", error); }
        }
        statusTxt.innerText = `✅ ${galeriaAtual.length} foto(s) ok.`;
        fileInput.value = "";
    });
}

window.renderizarGaleria = () => {
    const container = document.getElementById('galeria-preview');
    if (!container) return;
    container.innerHTML = '';
    galeriaAtual.forEach((link, index) => {
        const div = document.createElement('div');
        div.className = 'galeria-foto-item';
        div.innerHTML = `<img src="${link}" alt="Preview"><button type="button" class="btn-remover-foto" onclick="window.removerFoto(${index})">&times;</button>`;
        container.appendChild(div);
    });
};

window.atualizarSubcategorias = () => {
    const catSelect = document.getElementById('prod-categoria');
    const subSelect = document.getElementById('prod-sub');
    const categoria = catSelect.value;
    subSelect.innerHTML = '<option value="">Selecione...</option>';
    if (categoria && SUBCATEGORIAS[categoria]) {
        subSelect.disabled = false;
        SUBCATEGORIAS[categoria].forEach(sub => {
            const option = document.createElement('option');
            option.value = sub; option.innerText = sub;
            subSelect.appendChild(option);
        });
    } else {
        subSelect.disabled = true;
    }
};

window.removerFoto = (index) => {
    galeriaAtual.splice(index, 1);
    window.renderizarGaleria();
    const statusTxt = document.getElementById('status-upload');
    if (statusTxt) statusTxt.innerText = `Fotos: ${galeriaAtual.length}`;
};

window.salvarProduto = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-save');
    if (galeriaAtual.length === 0) { alert("Adicione pelo menos uma foto!"); return; }
    btn.disabled = true; btn.innerText = "Salvando...";
    
    // --- ATENÇÃO: Aqui está a atualização para salvar os TAMANHOS ---
    const dados = {
        nome: document.getElementById('prod-nome').value,
        categoria: document.getElementById('prod-categoria').value,
        subcategoria: document.getElementById('prod-sub').value,
        preco: document.getElementById('prod-preco').value,
        precoAntigo: document.getElementById('prod-antigo').value,
        estoque: parseInt(document.getElementById('prod-estoque').value) || 0,
        tamanhos: document.getElementById('prod-tamanhos').value, // <--- NOVA LINHA ADICIONADA
        resumo: document.getElementById('prod-resumo').value,
        descricao: document.getElementById('prod-desc').value,
        galeria: galeriaAtual,
        imagem: galeriaAtual[0],
    };

    try {
        if (idProdutoEmEdicao) {
            await updateDoc(doc(db, "produtos", idProdutoEmEdicao), dados);
        } else {
            dados.dataCriacao = Date.now();
            dados.cliques = 0;
            await addDoc(collection(db, "produtos"), dados);
        }
        window.fecharModal();
        window.carregarProdutos();
    } catch (error) { alert("Erro ao salvar: " + error.message); } 
    finally { btn.disabled = false; btn.innerText = "Salvar Produto"; }
};

window.carregarProdutos = async () => {
    const container = document.getElementById('lista-produtos-admin');
    if (!container) return;
    container.innerHTML = '<p>Carregando inventário...</p>';
    try {
        const q = query(collection(db, "produtos"), orderBy("dataCriacao", "desc"));
        const querySnapshot = await getDocs(q);
        container.innerHTML = '';
        if (querySnapshot.empty) { container.innerHTML = '<p>Nenhum produto encontrado.</p>'; return; }
        let total = 0, totalCliques = 0, totalEsgotados = 0;
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const isEsgotado = (p.estoque || 0) <= 0;
            total++; totalCliques += (p.cliques || 0); if (isEsgotado) totalEsgotados++;
            const badgeEstoque = isEsgotado ? `<span class="stock-badge-esgotado">ESGOTADO</span>` : `<span class="stock-badge">${p.estoque} unid.</span>`;
            const imgClass = isEsgotado ? "card-img card-img-esgotado" : "card-img";
            const imgCapa = (p.galeria && p.galeria[0]) || p.imagem || '../img/sem-foto.png';
            const div = document.createElement('div');
            div.className = 'produto-card-admin';
            div.innerHTML = `
                <div class="card-main-info">
                    <img src="${imgCapa}" class="${imgClass}" alt="${p.nome}">
                    <div class="card-text-info">
                        <h4 class="card-title">${p.nome}</h4>
                        <div class="card-price-stock">
                            <strong class="card-price">${p.preco}</strong>
                            ${badgeEstoque}
                        </div>
                    </div>
                </div>
                <div class="card-actions">
                    <button onclick='window.editarProduto("${docSnap.id}", ${JSON.stringify(p).replace(/'/g, "&apos;")})' class="btn-acao-admin"><i class="fas fa-edit"></i></button>
                    <button onclick='window.deletarProduto("${docSnap.id}")' class="btn-acao-admin btn-delete"><i class="fas fa-trash"></i></button>
                </div>`;
            container.appendChild(div);
        });
        if (document.getElementById('total-produtos')) document.getElementById('total-produtos').innerText = total;
        if (document.getElementById('total-views')) document.getElementById('total-views').innerText = totalCliques;
        if (document.getElementById('total-esgotados')) document.getElementById('total-esgotados').innerText = totalEsgotados;
    } catch (e) { console.error(e); }
}

window.editarProduto = (id, p) => {
    idProdutoEmEdicao = id;
    document.getElementById('titulo-modal').innerText = "Editar Produto";
    const form = document.getElementById('form-produto');
    if(form) form.reset();
    document.getElementById('prod-nome').value = p.nome || "";
    document.getElementById('prod-preco').value = p.preco || "";
    document.getElementById('prod-antigo').value = p.precoAntigo || "";
    document.getElementById('prod-estoque').value = p.estoque || 0;
    
    // --- ATENÇÃO: Carregando os tamanhos para edição ---
    document.getElementById('prod-tamanhos').value = p.tamanhos || ""; 

    document.getElementById('prod-resumo').value = p.resumo || "";
    document.getElementById('prod-desc').value = p.descricao || "";
    document.getElementById('prod-categoria').value = p.categoria || "";
    window.atualizarSubcategorias();
    setTimeout(() => { document.getElementById('prod-sub').value = p.subcategoria || ""; }, 100);
    galeriaAtual = p.galeria || [p.imagem];
    window.renderizarGaleria();
    document.getElementById('modal-produto').style.display = 'flex';
};

window.carregarBanners = async () => {
    for (let i = 1; i <= 3; i++) {
        const imgElement = document.getElementById(`img-preview-${i}`);
        if (!imgElement) continue;
        try {
            const docRef = doc(db, "banners_fixos", `slot_${i}`);
            const docSnap = await getDoc(docRef);
            imgElement.src = docSnap.exists() ? docSnap.data().imagem : "../img/sem-foto.png";
        } catch (e) { console.error(`Erro banner ${i}`, e); }
    }
};

window.uploadBannerFixo = async (slot) => {
    const input = document.getElementById(`input-banner-${slot}`);
    const status = document.getElementById(`status-${slot}`);
    if (input.files.length === 0) return;
    const file = input.files[0];
    status.innerText = "⏳ Enviando...";
    const formData = new FormData();
    formData.append("image", file);
    try {
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) {
            await setDoc(doc(db, "banners_fixos", `slot_${slot}`), { imagem: data.data.url, atualizadoEm: Date.now() });
            document.getElementById(`img-preview-${slot}`).src = data.data.url;
            status.innerText = "✅ Atualizado!";
        }
    } catch (e) { status.innerText = "❌ Erro"; }
};

window.salvarCupomBanco = async () => {
    const cod = document.getElementById('codigo-cupom').value.toUpperCase().trim();
    const val = parseFloat(document.getElementById('porcentagem-cupom').value);
    if (!cod || isNaN(val)) { alert("Preencha o código e a porcentagem!"); return; }
    try {
        await addDoc(collection(db, "cupons"), { codigo: cod, desconto: val / 100, ativo: true });
        document.getElementById('codigo-cupom').value = ""; document.getElementById('porcentagem-cupom').value = "";
        window.carregarCuponsBanco();
    } catch (e) { alert("Erro ao criar cupom."); }
};

window.carregarCuponsBanco = async () => {
    const lista = document.getElementById('lista-cupons-render');
    if (!lista) return;
    lista.innerHTML = "Buscando cupons...";
    const q = query(collection(db, "cupons"));
    const snap = await getDocs(q);
    lista.innerHTML = snap.empty ? "<p>Nenhum cupom ativo.</p>" : "";
    snap.forEach((docSnap) => {
        const c = docSnap.data();
        lista.innerHTML += `
            <div class="item-cupom">
                <div><strong>${c.codigo}</strong> - <span>${(c.desconto * 100).toFixed(0)}% OFF</span></div>
                <button onclick="window.deletarCupomBanco('${docSnap.id}')" class="btn-del-cupom"><i class="fas fa-trash"></i></button>
            </div>`;
    });
};

window.deletarCupomBanco = async (id) => {
    if (confirm("Deseja apagar este cupom?")) {
        await deleteDoc(doc(db, "cupons", id));
        window.carregarCuponsBanco();
    }
};

window.deletarProduto = async (id) => {
    if (confirm("Deseja realmente apagar este produto? A ação é irreversível.")) {
        try {
            await deleteDoc(doc(db, "produtos", id));
            window.carregarProdutos(); 
        } catch (error) {
            console.error("Erro ao deletar produto: ", error);
            alert("Ocorreu um erro ao deletar o produto.");
        }
    }
};

window.abrirModal = () => {
    idProdutoEmEdicao = null;
    const form = document.getElementById('form-produto');
    if(form) form.reset();
    galeriaAtual = [];
    window.renderizarGaleria();
    document.getElementById('titulo-modal').innerText = "Novo Produto";
    window.atualizarSubcategorias();
    document.getElementById('modal-produto').style.display = 'flex';
};

window.fecharModal = () => {
    document.getElementById('modal-produto').style.display = 'none';
};

/* public/js/inventory.js - PARTE FINAL */

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        window.carregarProdutos();
        if (typeof configurarUploadGaleria === 'function') {
            configurarUploadGaleria();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const btnLogout = document.getElementById('btn-logout');
    if(btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if(confirm("Deseja realmente sair?")) {
                await signOut(auth);
                window.location.href = "login.html";
            }
        });
    }

    const inputBusca = document.getElementById('input-busca');
    if(inputBusca) {
        inputBusca.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            document.querySelectorAll('.produto-card-admin').forEach(card => {
                const nomeProduto = card.querySelector('.card-title').textContent.toLowerCase();
                card.style.display = nomeProduto.includes(termo) ? 'flex' : 'none';
            });
        });
    }
});

/* --- SISTEMA DE FRETE --- */

window.salvarFreteBanco = async () => {
    const nome = document.getElementById('nome-cidade').value.trim();
    const valor = parseFloat(document.getElementById('valor-frete').value);

    if (!nome || isNaN(valor)) { alert("Preencha o nome e o valor do frete!"); return; }

    try {
        await addDoc(collection(db, "locais_entrega"), { 
            nome: nome, 
            valor: valor, 
            ativo: true 
        });
        document.getElementById('nome-cidade').value = "";
        document.getElementById('valor-frete').value = "";
        window.carregarFretesBanco();
        alert("Local adicionado com sucesso!");
    } catch (e) { alert("Erro ao salvar local."); console.error(e); }
};

window.carregarFretesBanco = async () => {
    const lista = document.getElementById('lista-fretes-render');
    if (!lista) return;
    
    lista.innerHTML = "Carregando locais...";
    
    // Busca ordenando por valor (do mais barato pro mais caro)
    const q = query(collection(db, "locais_entrega"), orderBy("valor", "asc"));
    const snap = await getDocs(q);
    
    lista.innerHTML = snap.empty ? "<p>Nenhum local cadastrado.</p>" : "";
    
    snap.forEach((docSnap) => {
        const f = docSnap.data();
        lista.innerHTML += `
            <div class="item-cupom" style="border-left: 4px solid #2980b9;">
                <div>
                    <strong>${f.nome}</strong> 
                    <span style="color: #666;">- Frete: R$ ${f.valor.toFixed(2)}</span>
                </div>
                <button onclick="window.deletarFreteBanco('${docSnap.id}')" class="btn-del-cupom">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
    });
};

window.deletarFreteBanco = async (id) => {
    if (confirm("Deseja remover este local de entrega?")) {
        await deleteDoc(doc(db, "locais_entrega", id));
        window.carregarFretesBanco();
    }
};

// Adicione esta linha no seu DOMContentLoaded ou onde você inicializa as outras coisas
// para carregar a lista quando abrir a aba (ou a página)
// window.carregarFretesBanco();
/* --- GATILHO INICIAL (Isso que faltava) --- */
document.addEventListener("DOMContentLoaded", () => {
    
    // Verifica se estamos na tela que tem a lista de fretes
    const listaContainer = document.getElementById('lista-fretes-render');
    
    if (listaContainer) {
        console.log("Iniciando carregamento de fretes...");
        window.carregarFretesBanco();
    }
});