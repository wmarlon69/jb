/* public/js/sales.js - VERSÃO SUPREMA (DASHBOARD REAL + IA + ESTOQUE) */

import { db } from "../core/firebase-config.js";
import { 
    collection, query, orderBy, getDocs, getDoc, doc, updateDoc, deleteDoc, writeBatch, increment 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let todosPedidosCache = []; 
let graficoVendasInstancia = null;
let graficoCatsInstancia = null;

const notificar = (msg) => {
    if (window.showToast) window.showToast(msg);
    else alert(msg);
};

// --- 1. CARREGAR PEDIDOS (E ATUALIZAR O DASHBOARD) ---
window.carregarPedidos = async () => {
    const container = document.getElementById('lista-pedidos-render');
    if(!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--muted);"><i class="fas fa-circle-notch fa-spin" style="margin-right: 8px;"></i> Sincronizando com o banco de dados...</div>';

    try {
        const q = query(collection(db, "pedidos"), orderBy("data", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--muted);">Nenhum pedido registrado no sistema.</div>';
            todosPedidosCache = [];
            atualizarDashboard([]); // Zera o dashboard
            return;
        }

        todosPedidosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Atualiza a aba visualmente
        const abaAtiva = document.getElementById('filtro-pendente');
        if (abaAtiva && abaAtiva.style.opacity === '1') {
            window.filtrarPedidos('pendente');
        } else {
            window.filtrarPedidos('pendente');
        }

        // --- ATUALIZA A TELA INICIAL DO DASHBOARD ---
        atualizarDashboard(todosPedidosCache);

    } catch (error) {
        console.error("Erro vendas:", error);
        container.innerHTML = '<p style="text-align:center; color:var(--red);">Erro ao carregar vendas. Tente atualizar a página.</p>';
    }
};

// --- FUNÇÃO PARA RENDERIZAR O DASHBOARD ---
function atualizarDashboard(pedidos) {
    const pedidosPagos = pedidos.filter(p => p.status === 'pago');
    
    // 1. Métricas Superiores
    let receitaMes = 0;
    let clientesUnicos = new Set();
    
    pedidosPagos.forEach(p => {
        receitaMes += parseFloat(p.total) || 0;
    });

    pedidos.forEach(p => {
        if(p.clienteNome) clientesUnicos.add(p.clienteNome.toLowerCase().trim());
    });

    const elReceita = document.getElementById('dash-receita');
    if (elReceita) elReceita.textContent = `R$ ${receitaMes.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits:2})}`;
    
    const elPedidos = document.getElementById('dash-pedidos');
    if (elPedidos) elPedidos.textContent = pedidosPagos.length;

    const elClientes = document.getElementById('dash-clientes');
    if (elClientes) elClientes.textContent = clientesUnicos.size;

    // 2. Últimos Pedidos (Tabela Tela Inicial)
    const tabelaDash = document.getElementById('dash-ultimos-pedidos');
    if (tabelaDash) {
        const ultimos3 = pedidos.slice(0, 3);
        if (ultimos3.length === 0) {
            tabelaDash.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted); padding:20px;">Nenhum pedido recente.</td></tr>`;
        } else {
            tabelaDash.innerHTML = ultimos3.map(p => {
                const total = parseFloat(p.total).toFixed(2).replace('.', ',');
                const statusPill = p.status === 'pago' 
                    ? `<span class="status-pill green">Pago</span>`
                    : `<span class="status-pill amber">Pendente</span>`;
                
                return `
                <tr>
                    <td><strong>${p.clienteNome || 'Desconhecido'}</strong></td>
                    <td>${statusPill}</td>
                    <td style="color:var(--muted);">${p.resumoItens || 'Vários itens'}</td>
                    <td style="font-family:'Syne',sans-serif; font-weight:700; color:var(--accent2);">R$ ${total}</td>
                    <td><button class="btn btn-ghost" style="padding:4px 10px; font-size:11px;" onclick="window.alternarAba('vendas')">Ver</button></td>
                </tr>`;
            }).join('');
        }
    }

    // 3. Atualizar Gráfico de Vendas (Simulando os últimos meses baseados nos pedidos)
    atualizarGraficos(pedidosPagos);
}

function atualizarGraficos(pedidosPagos) {
    if(typeof Chart === 'undefined') return;

    // Mockup inteligente para o gráfico baseando-se no total atual
    const vendasCtx = document.getElementById('chart-vendas');
    if (vendasCtx) {
        if(graficoVendasInstancia) graficoVendasInstancia.destroy();
        
        let totalBase = pedidosPagos.reduce((acc, p) => acc + (parseFloat(p.total)||0), 0);
        
        graficoVendasInstancia = new Chart(vendasCtx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Atual'],
                datasets: [{
                    label: 'Receita',
                    data: [totalBase*0.3, totalBase*0.5, totalBase*0.7, totalBase*0.9, totalBase*1.1, totalBase],
                    backgroundColor: 'rgba(124,92,252,0.6)',
                    borderRadius: 6,
                }, {
                    label: 'Pedidos',
                    data: [2, 5, 8, 12, 15, pedidosPagos.length],
                    type: 'line',
                    borderColor: '#22d3a0',
                    backgroundColor: 'rgba(34,211,160,0.1)',
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#22d3a0',
                    yAxisID: 'y1',
                    fill: true
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#888897' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#888897', callback: v => 'R$' + (v/1000).toFixed(1) + 'k' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y1: { position: 'right', ticks: { color: '#22d3a0' }, grid: { display: false } }
                }
            }
        });
    }

    const catsCtx = document.getElementById('chart-cats');
    if (catsCtx) {
        if(graficoCatsInstancia) graficoCatsInstancia.destroy();
        
        graficoCatsInstancia = new Chart(catsCtx, {
            type: 'doughnut',
            data: {
                labels: ['Masculino', 'Feminino', 'Eletrônicos'],
                datasets: [{
                    data: [35, 28, 20], // Valores fixos de exemplo por enquanto
                    backgroundColor: ['#7c5cfc', '#60a5fa', '#22d3a0'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '72%'
            }
        });
    }
}


// --- 2. FILTRO DE ABAS ---
window.filtrarPedidos = (statusDesejado) => {
    document.getElementById('painel-mensal').style.display = 'none';
    document.getElementById('lista-pedidos-render').style.display = 'block';

    const btnPendente = document.getElementById('filtro-pendente');
    const btnPago = document.getElementById('filtro-pago');
    
    if(btnPendente && btnPago) {
        if(statusDesejado === 'pendente') {
            btnPendente.style.opacity = '1'; btnPendente.style.transform = 'scale(1.05)';
            btnPago.style.opacity = '0.5'; btnPago.style.transform = 'scale(1)';
        } else {
            btnPendente.style.opacity = '0.5'; btnPendente.style.transform = 'scale(1)';
            btnPago.style.opacity = '1'; btnPago.style.transform = 'scale(1.05)';
        }
    }

    const pedidosFiltrados = todosPedidosCache.filter(p => p.status === statusDesejado);
    renderizarLista(pedidosFiltrados, statusDesejado);
};

// --- 3. DESENHAR LISTA (COM SENTINEL AI) ---
function renderizarLista(lista, statusAtual) {
    const container = document.getElementById('lista-pedidos-render');
    
    if (lista.length === 0) {
        let msg = statusAtual === 'pendente' ? 'Tudo limpo! Nenhuma venda pendente. 🚀' : 'Nenhuma venda concluída ainda.';
        container.innerHTML = `<div style="text-align:center; padding:50px; color:var(--muted); display:flex; flex-direction:column; align-items:center;">
            <i class="fas fa-check-circle" style="font-size:40px; margin-bottom:15px; color:var(--border2);"></i>${msg}
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
                <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border2); color: var(--text);">
                    <span><strong style="color:var(--accent2);">${item.qtd}x</strong> ${item.nome} <small style="color:var(--muted);">(${item.tamanho || 'U'})</small></span>
                    <span style="font-weight:600;">R$ ${(item.preco * item.qtd).toFixed(2)}</span>
                </div>
            `).join('');
            
            if (pedido.valorDesconto > 0) {
                htmlItens += `
                <div style="color:var(--green); font-weight:600; background:rgba(34,211,160,0.1); padding:10px 12px; border-radius:8px; margin-top:8px; border:1px solid rgba(34,211,160,0.2); display:flex; justify-content:space-between;">
                    <span><i class="fas fa-ticket-alt"></i> Cupom: ${pedido.cupomNome || 'DESCONTO'}</span>
                    <span>- R$ ${parseFloat(pedido.valorDesconto).toFixed(2)}</span>
                </div>`;
            }

            if(pedido.valorFrete > 0) {
                htmlItens += `
                <div style="color:var(--blue); font-weight:600; padding:10px 0; display:flex; justify-content:space-between;">
                    <span><i class="fas fa-truck"></i> Entrega</span>
                    <span>R$ ${parseFloat(pedido.valorFrete).toFixed(2)}</span>
                </div>`;
            }
        }

        let badgeCupom = pedido.valorDesconto > 0 ? `<span style="font-size:10px; color:var(--green); background:rgba(34,211,160,0.15); padding:3px 8px; border-radius:6px; margin-left:8px; border:1px solid rgba(34,211,160,0.2);">🏷️ DESCONTO PIX/CUPOM</span>` : '';

        let botoesAcao = '';
        if (statusAtual === 'pendente') {
            botoesAcao = `
                <button class="btn btn-ghost" onclick="window.ativarSentinel('${pedido.id}')" style="background:rgba(124,92,252,0.1); color:var(--accent2); border-color:rgba(124,92,252,0.2); flex:1;">
                    <i class="fas fa-shield-alt"></i> Scan IA
                </button>
                <button class="btn btn-ghost" onclick="window.imprimirPedido('${pedido.id}')" style="flex:1;">
                    <i class="fas fa-print"></i> Imprimir
                </button>
                <button class="btn btn-primary" onclick="window.confirmarVenda('${pedido.id}')" style="background:var(--green); flex:2;">
                    <i class="fas fa-check-circle"></i> Confirmar & Baixar Estoque
                </button>
                <button class="btn btn-danger" onclick="window.excluirPedido('${pedido.id}')" style="padding: 12px 16px;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            botoesAcao = `
                <button class="btn btn-ghost" onclick="window.imprimirPedido('${pedido.id}')" style="flex:1;">
                    <i class="fas fa-print"></i> Reimprimir Recibo
                </button>
                <button class="btn btn-danger" onclick="window.excluirPedido('${pedido.id}')">
                    <i class="fas fa-trash"></i> Excluir Registro
                </button>
            `;
        }

        html += `
        <div class="pedido-card" id="card-${pedido.id}" style="background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 20px; transition: all 0.3s ease;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 16px;">
                <div>
                    <h3 style="font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 4px;">${pedido.clienteNome}</h3>
                    <div style="color: var(--muted); font-size: 13px;">
                        <i class="fas fa-map-marker-alt" style="color: var(--amber); margin-right: 4px;"></i> <strong>${nomeCidade}</strong>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="color: var(--muted); font-size: 12px; background: var(--bg3); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border2);"><i class="far fa-clock"></i> ${tempo}</div>
                </div>
            </div>

            <!-- RESULTADO DA IA SENTINEL -->
            <div id="resultado-ia-${pedido.id}" style="display:none; background:var(--bg3); padding:16px; border-radius:12px; border-left:4px solid var(--accent); margin-bottom:16px; font-size:13px; line-height:1.5;"></div>

            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <span style="color: var(--muted); font-weight: 600;"><i class="fas fa-shopping-bag" style="margin-right:6px;"></i> ${qtdItens} itens</span>
                    <span style="font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; color: var(--text);">R$ ${parseFloat(pedido.total).toFixed(2).replace('.',',')} ${badgeCupom}</span>
                </div>
                
                <button class="btn btn-ghost" onclick="window.toggleDetalhes('${pedido.id}')" style="width:100%; justify-content:space-between; margin-bottom:16px;">
                    Ver Detalhes do Pedido <i class="fas fa-chevron-down"></i>
                </button>
                
                <div id="detalhes-${pedido.id}" style="display: none; background: var(--bg3); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    ${htmlItens}
                    <div style="margin-top:16px; padding-top:16px; border-top:1px dashed var(--border2); font-size:12px; color: var(--muted);">
                        <strong style="color:var(--text);">Local/Origem:</strong> ${nomeCidade} <br>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                ${botoesAcao}
            </div>
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
    
    divResult.style.display = 'block';
    divResult.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:8px;"></i> Analisando padrões de fraude com IA Gemini...';
    divResult.style.background = 'rgba(124,92,252,0.1)';
    divResult.style.borderColor = 'var(--accent)';
    divResult.style.color = 'var(--accent2)';

    const dadosParaIA = `Cliente: ${pedido.clienteNome}. Valor: R$ ${pedido.total}. Entrega: ${pedido.tipoEntrega}. Itens: ${JSON.stringify(pedido.detalhesCarrinho)}`;

    try {
        const prompt = `Atue como analista de segurança. Analise o pedido abaixo e responda APENAS um JSON puro (sem markdown) com as chaves: "risco" (use apenas as palavras ALTO, MEDIO ou BAIXO), "motivo" (frase curta) e "dica" (ação a tomar). Pedido: ${dadosParaIA}`;

        const req = await fetch(GEMINI_URL_SALES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (req.status === 429) {
            divResult.style.borderColor = 'var(--amber)';
            divResult.style.color = 'var(--amber)';
            divResult.innerHTML = '<i class="fas fa-exclamation-triangle"></i> IA ocupada. Aguarde 30s e tente de novo.';
            return;
        }

        const res = await req.json();
        let textoLimpo = res.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonIA = JSON.parse(textoLimpo);

        let corBase = 'var(--green)'; 
        let bgBase = 'rgba(34,211,160,0.1)';

        if(jsonIA.risco === 'ALTO') {
            corBase = 'var(--red)';
            bgBase = 'rgba(248,113,113,0.1)';
        } else if(jsonIA.risco === 'MEDIO') {
            corBase = 'var(--amber)';
            bgBase = 'rgba(245,158,11,0.1)';
        }

        divResult.style.borderColor = corBase;
        divResult.style.background = bgBase;
        divResult.style.color = 'var(--text)';
        
        divResult.innerHTML = `
            <strong style="color:${corBase}; display:block; margin-bottom:6px; font-size:14px;"><i class="fas fa-shield-alt"></i> NÍVEL DE RISCO: ${jsonIA.risco}</strong>
            <span style="color:var(--muted);"><i class="fas fa-info-circle"></i> ${jsonIA.motivo}</span><br>
            <span style="display:inline-block; margin-top:6px; color:var(--text);"><i class="fas fa-lightbulb" style="color:var(--amber);"></i> <em>Recomendação: ${jsonIA.dica}</em></span>
        `;
        
        const card = document.getElementById(`card-${id}`);
        if(card) {
            card.style.borderLeft = `4px solid ${corBase}`;
            card.style.boxShadow = `0 10px 25px -5px ${bgBase}`;
        }

        await updateDoc(doc(db, "pedidos", id), { sentinelScore: `${jsonIA.risco}` });

    } catch (erro) {
        console.error(erro);
        divResult.style.background = 'rgba(248,113,113,0.1)';
        divResult.style.borderColor = 'var(--red)';
        divResult.style.color = 'var(--red)';
        divResult.innerHTML = '<i class="fas fa-times-circle"></i> Erro na análise. Verifique a API Key ou o Console (F12).';
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
            <span>DESCONTO/CUPOM (${pedido.cupomNome || 'OFF'})</span>
            <span>- ${parseFloat(pedido.valorDesconto).toFixed(2)}</span>
        </div>`;
    }

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

    imprimirCupomMobile(cupomHTML);
};

// --- FUNÇÃO AJUDANTE DE IMPRESSÃO ---
function imprimirCupomMobile(htmlConteudo) {
    const antigo = document.getElementById('iframe-impressao-jb');
    if (antigo) antigo.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'iframe-impressao-jb';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

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

    iframe.contentWindow.focus();
    setTimeout(() => {
        iframe.contentWindow.print();
    }, 1000); 
}

// --- CONFIRMAR VENDA + BAIXA DE ESTOQUE ---
window.confirmarVenda = async (id) => {
    if(!confirm("Confirmar pagamento e baixar itens do estoque?")) return;

    try {
        const pedidoRef = doc(db, "pedidos", id);
        const pedidoSnap = await getDoc(pedidoRef);
        
        if (!pedidoSnap.exists()) { notificar("Erro: Pedido não encontrado no banco."); return; }
        
        const pedido = pedidoSnap.data();
        const batch = writeBatch(db);

        batch.update(pedidoRef, { status: 'pago' });

        if (pedido.detalhesCarrinho) {
            pedido.detalhesCarrinho.forEach(item => {
                const produtoRef = doc(db, "produtos", item.id);
                batch.update(produtoRef, { 
                    estoque: increment(-item.qtd) 
                });
            });
        }

        await batch.commit();
        
        notificar("Sucesso! Venda confirmada e estoque atualizado.");
        window.carregarPedidos(); // Atualiza toda a tela inclusive o dash

    } catch (e) {
        console.error("Erro ao dar baixa:", e);
        alert("Falha crítica ao atualizar estoque. Verifique os logs.");
    }
};

window.excluirPedido = async (id) => {
    if(!confirm("Atenção! Apagar permanentemente este pedido?")) return;
    try { 
        await deleteDoc(doc(db, "pedidos", id)); 
        notificar("Pedido deletado.");
        window.carregarPedidos(); 
    } catch (e) { 
        notificar("Erro ao excluir."); 
    }
};

// --- FECHAMENTO MENSAL ADAPTADO AO NOVO DESIGN ---
window.mostrarResumoMensal = () => {
    document.getElementById('lista-pedidos-render').style.display = 'none';
    const painel = document.getElementById('painel-mensal');
    painel.style.display = 'block';
    
    document.getElementById('filtro-pendente').style.opacity = '0.5';
    document.getElementById('filtro-pago').style.opacity = '0.5';

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

    document.getElementById('total-mes-valor').textContent = totalValor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    document.getElementById('total-mes-qtd').textContent = totalProdutosVendidos + ' unid.';
};

window.zerarFechamento = async () => {
    const code = prompt("Digite ZERAR para confirmar o arquivamento:");
    if(code !== 'ZERAR') {
        notificar("Operação cancelada.");
        return;
    }
    const batch = writeBatch(db);
    const vendas = todosPedidosCache.filter(p => p.status === 'pago');
    
    if(vendas.length === 0) { notificar("Caixa já está limpo!"); return; }

    vendas.forEach(p => {
        batch.update(doc(db, "pedidos", p.id), { status: 'arquivado', dataArquivamento: Date.now() });
    });
    
    try {
        await batch.commit();
        notificar("Fechamento realizado com Sucesso!");
        window.carregarPedidos();
    } catch(e) {
        alert("Erro ao tentar arquivar as vendas.");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.carregarPedidos();
});