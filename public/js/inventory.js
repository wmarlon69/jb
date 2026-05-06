/* public/js/inventory.js - VERSÃO FINAL BLINDADA (CORREÇÃO DE PREÇOS E INTEGRAÇÃO) */

import { db, auth } from "../core/firebase-config.js";
import { 
    collection, addDoc, getDocs, deleteDoc, doc, updateDoc, 
    query, orderBy, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURAÇÃO DO CLOUDINARY ---
const CLOUD_NAME = "duw8krx5v"; 
const UPLOAD_PRESET = "jb_importes";

const SUBCATEGORIAS = {
    "feminino": ["Vestidos", "Blusas & Croppeds", "Calças & Jeans", "Shorts & Saias", "Conjuntos", "Moda Praia"],
    "masculino": ["Camisetas", "Camisas Polo", "Bermudas", "Calças Jeans", "Bonés", "Acessórios"],
    "infantil": ["Conjuntos Menino", "Conjuntos Menina", "Calçados", "Recém Nascido"],
    "eletronicos": ["Smartphones", "Smartwatches", "Fones de Ouvido", "Carregadores", "Capinhas"],
    "promocao": ["Queima de Estoque", "Leve 3 Pague 2", "Desconto Relâmpago"]
};

let idProdutoEmEdicao = null;
let galeriaAtual = [];

// --- FUNÇÕES DE AUXÍLIO PARA UI E DADOS ---
const notificar = (msg, tipo = "sucesso") => {
    if (window.showToast) {
        window.showToast(msg);
    } else {
        alert(msg);
    }
};

// Blindagem para converter qualquer preço (antigo ou novo) em número real
function parsePrecoSeguro(valor) {
    if (typeof valor === 'number') return valor;
    if (!valor) return 0;
    // Remove R$, pontos de milhar, troca vírgula por ponto e converte pra Float
    return parseFloat(String(valor).replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}

// --- FUNÇÃO DE UPLOAD ATUALIZADA (CLOUDINARY) ---
function configurarUploadGaleria() {
    const fileInput = document.getElementById('input-arquivo-foto');
    const statusTxt = document.getElementById('status-upload');
    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        if (galeriaAtual.length + files.length > 5) { notificar("Máximo de 5 fotos!", "erro"); return; }

        statusTxt.innerText = `⏳ Otimizando e Enviando para Cloudinary...`;
        
        for (const file of files) {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", UPLOAD_PRESET);

            try {
                const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { 
                    method: "POST", 
                    body: formData 
                });
                const data = await response.json();

                if (data.secure_url) {
                    galeriaAtual.push(data.secure_url);
                    window.renderizarGaleria();
                } else {
                    console.error("Erro Cloudinary:", data);
                    notificar("Erro no upload. Verifique o console.", "erro");
                }
            } catch (error) { console.error("Erro upload:", error); }
        }
        
        statusTxt.innerText = `✅ ${galeriaAtual.length} foto(s) na nuvem.`;
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
        div.innerHTML = `
            <img src="${link}" alt="Preview">
            <button type="button" class="btn-remover-foto" onclick="window.removerFoto(${index})">
                <i class="fas fa-times"></i>
            </button>`;
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

// --- SALVAR PRODUTO NO BANCO (COM CONVERSÃO DE NÚMEROS) ---
window.salvarProduto = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-save');
    if (galeriaAtual.length === 0) { notificar("Adicione pelo menos uma foto!", "erro"); return; }
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    
    // Converte os inputs de texto "99,90" para números reais 99.90
    const valorPreco = parsePrecoSeguro(document.getElementById('prod-preco').value);
    const valorAntigoInput = document.getElementById('prod-antigo').value;
    const valorPrecoAntigo = valorAntigoInput ? parsePrecoSeguro(valorAntigoInput) : null;

    const dados = {
        nome: document.getElementById('prod-nome').value.trim(),
        categoria: document.getElementById('prod-categoria').value,
        subcategoria: document.getElementById('prod-sub').value,
        preco: valorPreco, // Agora é salvo como Number
        precoAntigo: valorPrecoAntigo, // Agora é salvo como Number ou null
        estoque: parseInt(document.getElementById('prod-estoque').value) || 0,
        tamanhos: document.getElementById('prod-tamanhos').value.trim(),
        resumo: document.getElementById('prod-resumo').value.trim(),
        descricao: document.getElementById('prod-desc').value.trim(),
        galeria: galeriaAtual,
        imagem: galeriaAtual[0],
    };

    try {
        if (idProdutoEmEdicao) {
            await updateDoc(doc(db, "produtos", idProdutoEmEdicao), dados);
            notificar("Produto atualizado com sucesso!");
        } else {
            dados.dataCriacao = Date.now();
            dados.cliques = 0;
            await addDoc(collection(db, "produtos"), dados);
            notificar("Novo produto adicionado!");
        }
        window.fecharModal();
        window.carregarProdutos();
    } catch (error) { 
        notificar("Erro ao salvar: " + error.message, "erro"); 
    } 
    finally { 
        btn.disabled = false; 
        btn.innerHTML = "Salvar Produto"; 
    }
};

window.carregarProdutos = async () => {
    const container = document.getElementById('lista-produtos-admin');
    if (!container) return;
    container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: var(--muted); padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Carregando inventário...</p>';
    
    try {
        const q = query(collection(db, "produtos"), orderBy("dataCriacao", "desc"));
        const querySnapshot = await getDocs(q);
        container.innerHTML = '';
        
        if (querySnapshot.empty) { 
            container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: var(--muted); padding: 40px;">Nenhum produto cadastrado no sistema.</p>'; 
            return; 
        }

        let total = 0, totalCliques = 0, totalEsgotados = 0;

        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const isEsgotado = (p.estoque || 0) <= 0;
            
            total++; 
            totalCliques += (p.cliques || 0); 
            if (isEsgotado) totalEsgotados++;

            const badgeEstoque = isEsgotado 
                ? `<span class="stock-badge-esgotado">ESGOTADO</span>` 
                : `<span class="stock-badge">${p.estoque} unid.</span>`;
            
            const imgClass = isEsgotado ? "card-img card-img-esgotado" : "card-img";
            const imgCapa = (p.galeria && p.galeria[0]) || p.imagem || '../img/sem-foto.png';
            
            // Garante exibição visual correta mesmo de produtos antigos salvos como String
            const precoExibicao = parsePrecoSeguro(p.preco).toFixed(2).replace('.', ',');

            const div = document.createElement('div');
            div.className = 'produto-card-admin';
            
            div.innerHTML = `
                <div class="card-main-info">
                    <img src="${imgCapa}" class="${imgClass}" alt="${p.nome}">
                    <div class="card-text-info">
                        <h4 class="card-title" title="${p.nome}">${p.nome}</h4>
                        <div class="card-price-stock">
                            <strong class="card-price">R$ ${precoExibicao}</strong>
                            ${badgeEstoque}
                        </div>
                    </div>
                </div>

                <div class="card-actions" style="display: flex; gap: 8px; justify-content: center; margin-top: 15px; flex-wrap: wrap;">
                    <button onclick='window.editarProduto("${docSnap.id}", ${JSON.stringify(p).replace(/'/g, "&apos;")})' class="btn-acao-admin" title="Editar Produto">
                        <i class="fas fa-pen"></i>
                    </button>
                    
                    <button onclick='window.gerarPostInsta("${p.nome}")' class="btn-acao-admin" style="background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); color:white; border:none; padding:0; width:40px; flex: none;" title="Gerar Legenda AI">
                        <i class="fab fa-instagram"></i>
                    </button>

                    <button onclick='window.deletarProduto("${docSnap.id}")' class="btn-acao-admin btn-delete" title="Deletar Produto">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });

        if (document.getElementById('total-produtos')) document.getElementById('total-produtos').innerText = total;
        if (document.getElementById('total-views')) document.getElementById('total-views').innerText = totalCliques;
        if (document.getElementById('total-esgotados')) document.getElementById('total-esgotados').innerText = totalEsgotados;

    } catch (e) { 
        console.error("Erro ao carregar produtos:", e); 
        notificar("Erro ao conectar com o banco de dados.", "erro");
    }
}

window.editarProduto = (id, p) => {
    idProdutoEmEdicao = id;
    document.getElementById('titulo-modal').innerText = "Editar Produto";
    const form = document.getElementById('form-produto');
    if(form) form.reset();
    
    // Tratamento de conversão para colocar na tela com vírgula "99,90"
    const precoFormatado = p.preco ? parsePrecoSeguro(p.preco).toFixed(2).replace('.', ',') : "";
    const precoAntigoFormatado = p.precoAntigo ? parsePrecoSeguro(p.precoAntigo).toFixed(2).replace('.', ',') : "";

    document.getElementById('prod-nome').value = p.nome || "";
    document.getElementById('prod-preco').value = precoFormatado;
    document.getElementById('prod-antigo').value = precoAntigoFormatado;
    document.getElementById('prod-estoque').value = p.estoque || 0;
    document.getElementById('prod-tamanhos').value = p.tamanhos || ""; 
    document.getElementById('prod-resumo').value = p.resumo || "";
    document.getElementById('prod-desc').value = p.descricao || "";
    document.getElementById('prod-categoria').value = p.categoria || "";
    
    window.atualizarSubcategorias();
    setTimeout(() => { document.getElementById('prod-sub').value = p.subcategoria || ""; }, 100);
    
    galeriaAtual = p.galeria || [p.imagem];
    window.renderizarGaleria();
    
    const modal = document.getElementById('modal-produto');
    if(modal) {
        modal.classList.add('open');
        modal.style.display = ''; 
    }
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
    status.innerText = "⏳ Enviando para Cloudinary...";
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { 
            method: "POST", 
            body: formData 
        });
        const data = await res.json();
        
        if (data.secure_url) {
            await setDoc(doc(db, "banners_fixos", `slot_${slot}`), { imagem: data.secure_url, atualizadoEm: Date.now() });
            document.getElementById(`img-preview-${slot}`).src = data.secure_url;
            status.innerText = "✅ Atualizado!";
            notificar("Banner atualizado com sucesso!");
        } else {
            status.innerText = "❌ Erro no Cloudinary";
        }
    } catch (e) { 
        status.innerText = "❌ Erro"; 
        console.error(e); 
    }
};

window.salvarCupomBanco = async () => {
    const cod = document.getElementById('codigo-cupom').value.toUpperCase().trim();
    const val = parseFloat(document.getElementById('porcentagem-cupom').value);
    if (!cod || isNaN(val)) { notificar("Preencha o código e a porcentagem!", "erro"); return; }
    try {
        await addDoc(collection(db, "cupons"), { codigo: cod, desconto: val / 100, ativo: true });
        document.getElementById('codigo-cupom').value = ""; document.getElementById('porcentagem-cupom').value = "";
        window.carregarCuponsBanco();
        notificar("Cupom criado com sucesso!");
    } catch (e) { notificar("Erro ao criar cupom.", "erro"); }
};

window.carregarCuponsBanco = async () => {
    const lista = document.getElementById('lista-cupons-render');
    if (!lista) return;
    lista.innerHTML = "<p style='color: var(--muted);'>Buscando cupons...</p>";
    const q = query(collection(db, "cupons"));
    const snap = await getDocs(q);
    lista.innerHTML = snap.empty ? "<p style='color: var(--muted);'>Nenhum cupom ativo.</p>" : "";
    snap.forEach((docSnap) => {
        const c = docSnap.data();
        lista.innerHTML += `
            <div class="item-cupom" style="background:var(--bg3); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <div><strong style="color: var(--accent2); font-family: monospace; font-size: 16px;">${c.codigo}</strong> <span style="color: var(--muted); margin: 0 10px;">-</span> <span style="color: var(--green); font-weight: 600;">${(c.desconto * 100).toFixed(0)}% OFF</span></div>
                <button onclick="window.deletarCupomBanco('${docSnap.id}')" class="btn btn-danger" style="padding: 8px 12px;"><i class="fas fa-trash"></i></button>
            </div>`;
    });
};

window.deletarCupomBanco = async (id) => {
    if (confirm("Deseja apagar este cupom?")) {
        await deleteDoc(doc(db, "cupons", id));
        window.carregarCuponsBanco();
        notificar("Cupom removido.");
    }
};

window.deletarProduto = async (id) => {
    if (confirm("Deseja realmente apagar este produto? A ação é irreversível.")) {
        try {
            await deleteDoc(doc(db, "produtos", id));
            window.carregarProdutos(); 
            notificar("Produto deletado.");
        } catch (error) {
            console.error("Erro ao deletar produto: ", error);
            notificar("Ocorreu um erro ao deletar o produto.", "erro");
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
    
    const modal = document.getElementById('modal-produto');
    if(modal) {
        modal.classList.add('open');
        modal.style.display = ''; 
    }
};

window.fecharModal = () => {
    const modal = document.getElementById('modal-produto');
    if(modal) {
        modal.classList.remove('open');
        modal.style.display = '';
    }
};

// --- ROTINAS DE INICIALIZAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        // Inicializa todas as listagens necessárias do Painel
        window.carregarProdutos();
        window.carregarBanners();
        
        const listaFretes = document.getElementById('lista-fretes-render');
        if (listaFretes) window.carregarFretesBanco();

        const listaCupons = document.getElementById('lista-cupons-render');
        if (listaCupons) window.carregarCuponsBanco();

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

    if (!nome || isNaN(valor)) { notificar("Preencha o nome e o valor do frete!", "erro"); return; }

    try {
        await addDoc(collection(db, "locais_entrega"), { 
            nome: nome, 
            valor: valor, 
            ativo: true 
        });
        document.getElementById('nome-cidade').value = "";
        document.getElementById('valor-frete').value = "";
        window.carregarFretesBanco();
        notificar("Local de entrega adicionado com sucesso!");
    } catch (e) { notificar("Erro ao salvar local.", "erro"); console.error(e); }
};

window.carregarFretesBanco = async () => {
    const lista = document.getElementById('lista-fretes-render');
    if (!lista) return;
    
    lista.innerHTML = "<p style='color: var(--muted);'>Carregando rotas...</p>";
    const q = query(collection(db, "locais_entrega"), orderBy("valor", "asc"));
    const snap = await getDocs(q);
    
    lista.innerHTML = snap.empty ? "<p style='color: var(--muted);'>Nenhum local cadastrado.</p>" : "";
    
    snap.forEach((docSnap) => {
        const f = docSnap.data();
        lista.innerHTML += `
            <div class="item-cupom" style="background:var(--bg3); border-left: 4px solid var(--blue); border-radius:12px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="color:var(--text); font-size:15px;">${f.nome}</strong> 
                    <span style="color: var(--muted); margin-left: 8px;">- Frete: R$ ${f.valor.toFixed(2)}</span>
                </div>
                <button onclick="window.deletarFreteBanco('${docSnap.id}')" class="btn btn-danger" style="padding: 8px 12px;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
    });
};

window.deletarFreteBanco = async (id) => {
    if (confirm("Deseja remover este local de entrega?")) {
        await deleteDoc(doc(db, "locais_entrega", id));
        window.carregarFretesBanco();
        notificar("Rota de entrega removida.");
    }
};

// --- 🧠 CONFIGURAÇÃO GEMINI API DIRETA (INSTAGRAM) ---
const GEMINI_API_KEY_ADMIN = "AIzaSyAx8tLLLnSL7CijSewZvSZzbtzng5Nk71g"; 
const GEMINI_URL_ADMIN = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY_ADMIN}`;

window.gerarPostInsta = async (nomeProduto) => {
    const aviso = document.createElement('div');
    aviso.style = "position:fixed; top:20px; right:20px; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); color:white; padding:16px 24px; border-radius:12px; z-index:10000; box-shadow:0 10px 30px rgba(220,39,67,0.3); font-family:'DM Sans', sans-serif; font-weight:600; font-size: 14px; animation: fadeIn 0.3s ease;";
    aviso.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="margin-right: 8px;"></i> Criando legenda IA para ${nomeProduto}...`;
    document.body.appendChild(aviso);

    try {
        const prompt = `Atue como um Social Media focado em conversão para a loja JB Importes. Crie uma legenda chamativa, persuasiva e com emojis para o Instagram vendendo o produto: "${nomeProduto}". Use gatilhos mentais e não use formatação markdown como asteriscos, entregue apenas texto puro pronto para copiar.`;

        const req = await fetch(GEMINI_URL_ADMIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const res = await req.json();
        
        if (!req.ok) throw new Error(res.error?.message || "Erro na API do Gemini");

        const legenda = res.candidates[0].content.parts[0].text;

        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(legenda);
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = legenda;
            textArea.style.position = "fixed"; 
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try { document.execCommand('copy'); } catch (err) {}
            document.body.removeChild(textArea);
        }
        
        aviso.style.background = "var(--green)";
        aviso.style.boxShadow = "0 10px 30px rgba(34,211,160,0.3)";
        aviso.innerHTML = `<i class="fas fa-check-circle" style="margin-right: 8px; font-size: 16px;"></i> Legenda copiada! Só colar no Insta.`;

    } catch (e) {
        aviso.style.background = "var(--red)";
        aviso.style.boxShadow = "0 10px 30px rgba(248,113,113,0.3)";
        aviso.innerHTML = `<i class="fas fa-times-circle" style="margin-right: 8px; font-size: 16px;"></i> Erro ao gerar legenda. Verifique o console!`;
        console.error("Erro na integração Gemini:", e);
    }
    
    setTimeout(() => {
        aviso.style.opacity = '0';
        aviso.style.transition = 'opacity 0.3s ease';
        setTimeout(() => aviso.remove(), 300);
    }, 4000);
};