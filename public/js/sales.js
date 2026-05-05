/* public/js/sales.js - VERSÃO SUPREMA (IA + ESTOQUE + IMPRESSÃO MOBILE) */

import { db } from "../core/firebase-config.js";
import { 
    collection, query, orderBy, getDocs, getDoc, doc, updateDoc, deleteDoc, writeBatch, increment 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let todosPedidosCache = []; 

// --- 1. CARREGAR PEDIDOS ---
window.carregarPedidos = async () => {
    const container = document.getElementById('lista-pedidos-render');
    if(!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;"><i class="fas fa-circle-notch fa-spin"></i> Atualizando ERP...</div>';

    try {
        const q = query(collection(db, "pedidos"), orderBy("data", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">Nenhum pedido registrado.</div>';
            todosPedidosCache = [];
            return;
        }

        todosPedidosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Mantém a aba visualmente selecionada
        const abaAtiva = document.getElementById('filtro-pendente');
        if (abaAtiva && abaAtiva.style.opacity === '1') {
            window.filtrarPedidos('pendente');
        } else {
            window.filtrarPedidos('pendente');
        }

    } catch (error) {
        console.error("Erro vendas:", error);
        container.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar vendas.</p>';
    }
};

// --- 2. FILTRO DE ABAS ---
window.filtrarPedidos = (statusDesejado) => {
    document.getElementById('painel-mensal').style.display = 'none';
    document.getElementById('lista-pedidos-render').style.display = 'block';

    const btnPendente = document.getElementById('filtro-pendente');
    const btnPago = document.getElementById('filtro-pago');
    
    if(btnPendente && btnPago) {
        if(statusDesejado === 'pendente') {
            btnPendente.style.opacity = '1'; btnPendente.style.transform = 'scale(1.05)';
            btnPago.style.opacity = '0.6'; btnPago.style.transform = 'scale(1)';
        } else {
            btnPendente.style.opacity = '0.6'; btnPendente.style.transform = 'scale(1)';
            btnPago.style.opacity = '1'; btnPago.style.transform = 'scale(1.05)';
        }
    }

    const pedidosFiltrados = todosPedidosCache.filter(p => p.status === statusDesejado);
    renderizarLista(pedidosFiltrados, statusDesejado);
};

// --- 3. DESENHAR LISTA (COM SENTINEL AI INTEGRADO) ---
function renderizarLista(lista, statusAtual) {
    const container = document.getElementById('lista-pedidos-render');
    
    if (lista.length === 0) {
        let msg = statusAtual === 'pendente' ? 'Tudo limpo! Nenhuma venda pendente. 🧹' : 'Caixa vazio ainda.';
        container.innerHTML = `<div style="text-align:center; padding:50px; color:#999; display:flex; flex-direction:column; align-items:center;">
            <i class="fas fa-check-circle" style="font-size:40px; margin-bottom:15px; color:#cbd5e1;"></i>${msg}
        </div>`;
        return;
    }

    let html = '';
    lista.forEach(pedido => {
        const tempo = tempoRelativo(pedido.data);
        const qtdItens = pedido.detalhesCarrinho ? pedido.detalhesCarrinho.length : 0;
        
        let nomeCidade = "Retirada/Não informado";
        if (pedido.tipoEntrega) {
            nomeCidade = (typeof pedido.tipoEntrega === 'object') ? pedido.tipoEntrega.nome : pedido.tipoEntrega;
        } else if (pedido.entrega) {
             nomeCidade = (typeof pedido.entrega === 'object') ? pedido.entrega.nome : pedido.entrega;
        }

        let htmlItens = '';
        if(pedido.detalhesCarrinho) {
            htmlItens = pedido.detalhesCarrinho.map(item => `
                <div class="item-linha">
                    <span>${item.qtd}x ${item.nome} <small>(${item.tamanho || 'U'})</small></span>
                    <span>R$ ${(item.preco * item.qtd).toFixed(2)}</span>
                </div>
            `).join('');
            
            if (pedido.valorDesconto > 0) {
                htmlItens += `
                <div class="item-linha" style="color:#16a34a; font-weight:bold; background:#dcfce7; padding:8px; border-radius:6px; margin-top:5px; border:1px solid #86efac;">
                    <span>🎟️ Cupom: ${pedido.cupomNome || 'DESCONTO'}</span>
                    <span>- R$ ${parseFloat(pedido.valorDesconto).toFixed(2)}</span>
                </div>`;
            }

            if(pedido.valorFrete > 0) {
                htmlItens += `<div class="item-linha" style="color:#e67e22; font-weight:bold;"><span>🚚 Entrega</span><span>R$ ${parseFloat(pedido.valorFrete).toFixed(2)}</span></div>`;
            }
        }

        let badgeCupom = pedido.valorDesconto > 0 ? `<span style="font-size:0.75rem; color:#16a34a; background:#dcfce7; padding:2px 6px; border-radius:4px; margin-left:5px;">🏷️ OFF</span>` : '';

        // BOTÕES INTELIGENTES (AQUI ADICIONEI O SENTINEL)
        let botoesAcao = '';
        if (statusAtual === 'pendente') {
            botoesAcao = `
                <button class="btn-acao" onclick="window.ativarSentinel('${pedido.id}')" style="background:#6366f1; color:white; border:1px solid #4f46e5;">
                    <i class="fas fa-shield-alt"></i> Scan IA
                </button>
                <button class="btn-acao btn-imprimir" onclick="window.imprimirPedido('${pedido.id}')"><i class="fas fa-print"></i> Imprimir</button>
                <button class="btn-acao btn-receber" onclick="window.confirmarVenda('${pedido.id}')" style="background:#27ae60; color:white;">
                    <i class="fas fa-box-open"></i> Baixar Estoque
                </button>
                <button class="btn-acao btn-excluir" onclick="window.excluirPedido('${pedido.id}')"><i class="fas fa-trash"></i></button>
            `;
        } else {
            botoesAcao = `
                <button class="btn-acao btn-imprimir" onclick="window.imprimirPedido('${pedido.id}')" style="background:#94a3b8;"><i class="fas fa-print"></i> Reimprimir</button>
                 <button class="btn-acao btn-excluir" onclick="window.excluirPedido('${pedido.id}')"><i class="fas fa-trash"></i></button>
            `;
        }

        html += `
        <div class="pedido-card ${statusAtual}" id="card-${pedido.id}">
            <div class="card-header">
                <div class="cliente-info">
                    <h3>${pedido.clienteNome}</h3>
                    <span><i class="fas fa-map-marker-alt" style="color:#ff5100;"></i> <strong>${nomeCidade}</strong></span>
                    ${pedido.clienteZap && pedido.clienteZap.length > 8 ? `<span style="margin-top:2px; font-size:0.8rem; color:#25D366;"><i class="fab fa-whatsapp"></i> Com Zap</span>` : ''}
                </div>
                <div class="tempo-decorrido"><i class="far fa-clock"></i> ${tempo}</div>
            </div>

            <div id="resultado-ia-${pedido.id}" style="display:none; background:#f0f9ff; padding:10px; border-radius:8px; border-left:4px solid #0ea5e9; margin:10px; font-size:0.9rem;"></div>

            <div class="card-body">
                <div class="resumo-rapido">
                    <span><i class="fas fa-shopping-bag"></i> ${qtdItens} itens</span>
                    <span class="valor-total">R$ ${parseFloat(pedido.total).toFixed(2).replace('.',',')} ${badgeCupom}</span>
                </div>
                <button class="btn-acao btn-detalhes" onclick="window.toggleDetalhes('${pedido.id}')" style="width:100%; margin-bottom:10px;">
                    Ver Detalhes do Pedido <i class="fas fa-chevron-down"></i>
                </button>
                <div id="detalhes-${pedido.id}" class="detalhes-items">
                    ${htmlItens}
                    <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #ccc; font-size:0.8rem;">
                        <strong>Local:</strong> ${nomeCidade} <br>
                        <strong>Obs:</strong> ${pedido.endereco || 'A combinar'}
                    </div>
                </div>
            </div>
            <div class="card-footer">${botoesAcao}</div>
        </div>`;
    });
    container.innerHTML = html;
}

// --- 🧠 CONFIGURAÇÃO DO SCAN IA (GEMINI SERVERLESS) ---
const GEMINI_API_KEY_SALES = "AIzaSyAx8tLLLnSL7CijSewZvSZzbtzng5Nk71g"; 
const GEMINI_URL_SALES = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY_SALES}`;

window.ativarSentinel = async (id) => {
    const pedido = todosPedidosCache.find(p => p.id === id);
    if (!pedido) return;

    const divResult = document.getElementById(`resultado-ia-${id}`);
    
    // 1. ESTADO "PENSANDO" (Restaurado como você queria)
    divResult.style.display = 'block';
    divResult.innerHTML = '🤖 Analisando padrões de fraude com Gemini...';
    divResult.style.background = '#f0f9ff';
    divResult.style.borderColor = '#0ea5e9';

    // Monta o pacote de dados para a IA
    const dadosParaIA = `Cliente: ${pedido.clienteNome}. Valor: R$ ${pedido.total}. Entrega: ${pedido.tipoEntrega}. Itens: ${JSON.stringify(pedido.detalhesCarrinho)}`;

    try {
        // PROMPT FORTE: Exige JSON para não quebrar o layout
        const prompt = `Atue como analista de segurança. Analise o pedido abaixo e responda APENAS um JSON puro (sem markdown) com as chaves: "risco" (use apenas as palavras ALTO, MEDIO ou BAIXO), "motivo" (frase curta) e "dica" (ação a tomar). Pedido: ${dadosParaIA}`;

        const req = await fetch(GEMINI_URL_SALES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        // Tratamento de erro 429 (Muita rapidez)
        if (req.status === 429) {
            divResult.innerHTML = '<span style="color:#f59e0b">⚠️ IA ocupada. Aguarde 30s e tente de novo.</span>';
            return;
        }

        const res = await req.json();
        
        // Limpa a resposta (tira ```json se houver) e converte em objeto
        let textoLimpo = res.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonIA = JSON.parse(textoLimpo);

        // 2. LÓGICA DE CORES (Verde, Laranja, Vermelho - Restaurada)
        let cor = '#22c55e'; // BAIXO
        if(jsonIA.risco === 'ALTO') cor = '#ef4444'; 
        if(jsonIA.risco === 'MEDIO') cor = '#f59e0b';

        divResult.style.borderColor = cor;
        divResult.style.background = (jsonIA.risco === 'ALTO') ? '#fef2f2' : '#f0fdf4';
        
        // 3. EXIBIÇÃO DO RESULTADO (Formatado como o antigo)
        divResult.innerHTML = `
            <strong style="color:${cor}">RISCO: ${jsonIA.risco}</strong><br>
            📝 ${jsonIA.motivo}<br>
            💡 <em>Dica: ${jsonIA.dica}</em>
        `;
        
        // Pinta a borda do card inteiro para alertar visualmente
        const card = document.getElementById(`card-${id}`);
        if(card) card.style.borderLeft = `5px solid ${cor}`;

        // Opcional: Salva o veredito no Firebase para ficar registrado
        await updateDoc(doc(db, "pedidos", id), {
            sentinelScore: `${jsonIA.risco}`
        });

    } catch (erro) {
        console.error(erro);
        divResult.style.background = '#fff1f2';
        divResult.style.borderColor = '#e11d48';
        divResult.innerHTML = '<span style="color:red">❌ Erro na análise. Verifique o Console (F12).</span>';
    }
};

// --- AUXILIARES ---
window.toggleDetalhes = (id) => {
    const div = document.getElementById(`detalhes-${id}`);
    if(div.style.display === 'block') { div.style.display = 'none'; } else { div.style.display = 'block'; }
};

function tempoRelativo(timestamp) {
    const agora = Date.now();
    const diff = agora - timestamp;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Agora';
    if (min < 60) return `${min} min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `${horas}h`;
    const dias = Math.floor(horas / 24);
    return `${dias}d`;
}

// --- IMPRESSÃO CORRIGIDA PARA CELULAR ---
window.imprimirPedido = (id) => {
    const pedido = todosPedidosCache.find(p => p.id === id);
    if(!pedido) return;

    let nomeCidade = "Retirada/Balcão";
    if (pedido.tipoEntrega) nomeCidade = (typeof pedido.tipoEntrega === 'object') ? pedido.tipoEntrega.nome : pedido.tipoEntrega;
    else if (pedido.entrega) nomeCidade = (typeof pedido.entrega === 'object') ? pedido.entrega.nome : pedido.entrega;

    const dataHora = new Date(pedido.data).toLocaleString('pt-BR');
    let itensHtml = '';
    pedido.detalhesCarrinho.forEach(item => {
        itensHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${item.qtd}x ${item.nome}</span><span>${(item.preco * item.qtd).toFixed(2)}</span></div>`;
    });

    let linhaDesconto = '';
    if (pedido.valorDesconto > 0) {
        linhaDesconto = `
        <div style="display:flex; justify-content:space-between; margin-top:5px; border-bottom:1px dashed #000;">
            <span>CUPOM (${pedido.cupomNome || 'OFF'})</span>
            <span>- ${parseFloat(pedido.valorDesconto).toFixed(2)}</span>
        </div>`;
    }

    // MONTA O HTML DO CUPOM
    const cupomHTML = `
        <div class="header">
            <strong>JB IMPORTES</strong><br>Pedido Web<br>${dataHora}
        </div>
        <div style="margin-bottom:10px;">
            <strong>Cliente:</strong> ${pedido.clienteNome}<br>
            <strong>Local:</strong> ${nomeCidade}
        </div>
        <div style="border-bottom: 1px dashed #000; margin-bottom:10px;"></div>
        ${itensHtml}
        ${linhaDesconto}
        ${pedido.valorFrete > 0 ? `<div style="display:flex; justify-content:space-between; margin-top:5px;"><span>Frete</span><span>${parseFloat(pedido.valorFrete).toFixed(2)}</span></div>` : ''}
        <div class="total">TOTAL: R$ ${parseFloat(pedido.total).toFixed(2)}</div>
        <div class="footer">WM Labs System</div>
    `;

    // CHAMA A FUNÇÃO SEGURA (IFRAME)
    imprimirCupomMobile(cupomHTML);
};

// --- FUNÇÃO AJUDANTE DE IMPRESSÃO (O SEGREDO DO MOBILE) ---
function imprimirCupomMobile(htmlConteudo) {
    // 1. Limpa impressões anteriores
    const antigo = document.getElementById('iframe-impressao-jb');
    if (antigo) antigo.remove();

    // 2. Cria o iframe invisível
    const iframe = document.createElement('iframe');
    iframe.id = 'iframe-impressao-jb';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    // 3. Escreve o cupom dentro do iframe
    const doc = iframe.contentWindow.document;
    doc.write(`
        <html>
            <head>
                <style>
                    body { font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; margin: 0; width: 300px; }
                    .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
                    .total { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; font-size: 14px; font-weight: bold; text-align: right; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; }
                </style>
            </head>
            <body>
                ${htmlConteudo}
            </body>
        </html>
    `);
    doc.close();

    // 4. O TRUQUE: Espera o celular processar antes de chamar a impressora
    iframe.contentWindow.focus();
    setTimeout(() => {
        iframe.contentWindow.print();
    }, 1000); // 1 segundo de espera para não dar erro
}

// --- AQUI A MÁGICA: CONFIRMAR VENDA + BAIXA DE ESTOQUE AUTOMÁTICA ---
window.confirmarVenda = async (id) => {
    if(!confirm("Tem certeza? Isso vai:\n1. Marcar como pago\n2. Diminuir o estoque dos produtos")) return;

    try {
        const pedidoRef = doc(db, "pedidos", id);
        const pedidoSnap = await getDoc(pedidoRef);
        
        if (!pedidoSnap.exists()) { alert("Erro: Pedido não encontrado!"); return; }
        
        const pedido = pedidoSnap.data();
        const batch = writeBatch(db);

        // Atualiza status do pedido para 'pago'
        batch.update(pedidoRef, { status: 'pago' });

        // Percorre os produtos do carrinho e diminui o estoque
        if (pedido.detalhesCarrinho) {
            pedido.detalhesCarrinho.forEach(item => {
                const produtoRef = doc(db, "produtos", item.id);
                batch.update(produtoRef, { 
                    estoque: increment(-item.qtd) 
                });
            });
        }

        // Executa tudo de uma vez
        await batch.commit();
        
        alert("Sucesso! Venda confirmada e estoque atualizado.");
        window.carregarPedidos();

    } catch (e) {
        console.error("Erro ao dar baixa:", e);
        alert("Erro ao processar venda. O estoque NÃO foi alterado.");
    }
};

window.excluirPedido = async (id) => {
    if(!confirm("Apagar pedido?")) return;
    try { await deleteDoc(doc(db, "pedidos", id)); window.carregarPedidos(); } catch (e) { alert("Erro."); }
};

// --- FECHAMENTO MENSAL ---
window.mostrarResumoMensal = () => {
    document.getElementById('lista-pedidos-render').style.display = 'none';
    const painel = document.getElementById('painel-mensal');
    painel.style.display = 'block';
    
    document.getElementById('filtro-pendente').style.opacity = '0.6';
    document.getElementById('filtro-pago').style.opacity = '0.6';

    const vendasAtivas = todosPedidosCache.filter(p => p.status === 'pago');
    let totalValor = 0;
    let totalProdutosVendidos = 0;

    vendasAtivas.forEach(p => { 
        totalValor += parseFloat(p.total);
        if(p.detalhesCarrinho && Array.isArray(p.detalhesCarrinho)) {
            p.detalhesCarrinho.forEach(item => {
                totalProdutosVendidos += parseInt(item.qtd || 1);
            });
        } else {
            totalProdutosVendidos += 1;
        }
    });

    painel.innerHTML = `
        <h3 style="color:#333; margin-bottom:20px;">💰 Fechamento deste Mês</h3>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; max-width:600px; margin:0 auto;">
            <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <p style="color:#666; font-size:0.9rem;">Total Vendido (Pago)</p>
                <strong style="font-size:1.8rem; color:#27ae60;">${totalValor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong>
            </div>
            <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <p style="color:#666; font-size:0.9rem;">Produtos Vendidos</p>
                <strong style="font-size:1.8rem; color:#333;">${totalProdutosVendidos}</strong>
            </div>
        </div>

        <div style="margin-top:30px; padding:20px; background:#fff3cd; border-radius:8px; border:1px solid #ffeeba;">
            <p style="color:#856404; font-size:0.9rem; margin-bottom:10px;">
                <i class="fas fa-exclamation-triangle"></i> 
                Ao clicar em "Fechar Caixa", todas as vendas acima serão arquivadas e o contador voltará a zero.
            </p>
            <button onclick="window.zerarFechamento()" style="background:#d35400; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-weight:bold;">
                <i class="fas fa-archive"></i> Fechar Caixa e Zerar
            </button>
        </div>

        <hr style="margin:20px 0; border:0; border-top:1px solid #ddd;">
        <button onclick="window.filtrarPedidos('pendente')" style="padding:10px 25px; cursor:pointer; background:#333; color:white; border:none; border-radius:5px;">
            Voltar para Pedidos
        </button>
    `;
};

window.zerarFechamento = async () => {
    const code = prompt("Digite ZERAR para fechar o caixa:");
    if(code !== 'ZERAR') return;
    const batch = writeBatch(db);
    const vendas = todosPedidosCache.filter(p => p.status === 'pago');
    
    if(vendas.length === 0) { alert("Caixa já está vazio!"); return; }

    vendas.forEach(p => {
        batch.update(doc(db, "pedidos", p.id), { status: 'arquivado', dataArquivamento: Date.now() });
    });
    
    await batch.commit();
    alert("Caixa Fechado com Sucesso!");
    window.carregarPedidos();
};

document.addEventListener('DOMContentLoaded', () => {
    window.carregarPedidos();
});