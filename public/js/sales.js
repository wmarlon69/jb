/* public/js/sales.js - VERSÃO COM BOTÃO DE ZERAR CAIXA */

import { db } from "../core/firebase-config.js";
import { 
    collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let todosPedidosCache = []; 

// --- 1. CARREGAR PEDIDOS ---
window.carregarPedidos = async () => {
    const container = document.getElementById('lista-pedidos-render');
    if(!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;"><i class="fas fa-circle-notch fa-spin"></i> Atualizando lista...</div>';

    try {
        const q = query(collection(db, "pedidos"), orderBy("data", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">Nenhum pedido registrado.</div>';
            todosPedidosCache = [];
            return;
        }

        todosPedidosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.filtrarPedidos('pendente');

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
    
    if(btnPendente) {
        btnPendente.style.background = statusDesejado === 'pendente' ? '#f1c40f' : '#e0e0e0';
        btnPendente.style.color = statusDesejado === 'pendente' ? '#fff' : '#555';
    }
    if(btnPago) {
        btnPago.style.background = statusDesejado === 'pago' ? '#2ecc71' : '#e0e0e0';
        btnPago.style.color = statusDesejado === 'pago' ? '#fff' : '#555';
    }

    // Filtra ignorando os arquivados
    const pedidosFiltrados = todosPedidosCache.filter(p => p.status === statusDesejado);
    renderizarLista(pedidosFiltrados, statusDesejado);
};

// --- 3. DESENHAR LISTA ---
function renderizarLista(lista, statusAtual) {
    const container = document.getElementById('lista-pedidos-render');
    
    if (lista.length === 0) {
        let msg = statusAtual === 'pendente' ? 'Nenhum pedido aguardando pagamento! 🎉' : 'Nenhuma venda ativa neste caixa.';
        container.innerHTML = `<div style="text-align:center; padding:50px; color:#999;">
            <i class="fas fa-folder-open" style="font-size:30px; margin-bottom:15px; opacity:0.5;"></i><br>${msg}
        </div>`;
        return;
    }

    let html = '';
    lista.forEach(pedido => {
        const data = new Date(pedido.data).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
        
        let btnZapCliente = '';
        if(pedido.clienteZap && pedido.clienteZap.length > 8) {
            btnZapCliente = `
            <a href="https://wa.me/55${pedido.clienteZap}?text=Olá ${pedido.clienteNome}..." target="_blank" 
               style="text-decoration:none; background:#25D366; color:white; padding:8px 12px; border-radius:5px; display:inline-flex; align-items:center; gap:5px; font-size:0.9rem;">
                <i class="fab fa-whatsapp"></i> Chamar
            </a>`;
        } else {
            btnZapCliente = `<span style="color:#999; font-size:0.8rem;">(Sem Zap)</span>`;
        }

        let botoesExtras = '';
        if (statusAtual === 'pendente') {
            botoesExtras = `
                <button onclick="window.confirmarVenda('${pedido.id}')" style="background:#27ae60; color:white; border:none; padding:8px 12px; border-radius:5px; cursor:pointer;">
                    <i class="fas fa-check"></i> Recebi
                </button>
                <button onclick="window.excluirPedido('${pedido.id}')" style="background:#fff; border:1px solid #e74c3c; color:#e74c3c; padding:8px 12px; border-radius:5px; cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            botoesExtras = `
                <button onclick="window.excluirPedido('${pedido.id}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-size:0.8rem;">
                    <i class="fas fa-trash"></i> Apagar
                </button>
            `;
        }

        html += `
        <div class="pedido-card" style="background:white; border-left:5px solid ${statusAtual==='pendente'?'#f1c40f':'#2ecc71'}; padding:20px; margin-bottom:15px; border-radius:10px; box-shadow:0 3px 6px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                <div>
                    <h3 style="margin:0; color:#333;">${pedido.clienteNome}</h3>
                    <div style="font-size:0.85rem; color:#888; margin-top:5px;"><i class="far fa-clock"></i> ${data}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.2rem; font-weight:bold; color:#2c3e50;">${pedido.total}</div>
                </div>
            </div>
            <div style="background:#f9f9f9; padding:12px; border-radius:6px; font-size:0.95rem; color:#555; margin-bottom:15px; border:1px solid #eee;">
                ${pedido.resumoItens}
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-top:1px solid #eee; padding-top:15px;">
                ${btnZapCliente}
                <div style="flex:1"></div>
                ${botoesExtras}
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// --- 4. AÇÕES ---
window.confirmarVenda = async (id) => {
    if(!confirm("Recebeu o pagamento?")) return;
    try {
        await updateDoc(doc(db, "pedidos", id), { status: 'pago' });
        window.carregarPedidos();
    } catch (e) { alert("Erro ao atualizar."); }
};

window.excluirPedido = async (id) => {
    if(!confirm("Isso apagará o pedido para sempre. Continuar?")) return;
    try {
        await deleteDoc(doc(db, "pedidos", id));
        window.carregarPedidos();
    } catch (e) { alert("Erro ao excluir."); }
};

// --- 5. RESUMO E FECHAMENTO ---
window.mostrarResumoMensal = () => {
    document.getElementById('lista-pedidos-render').style.display = 'none';
    const painel = document.getElementById('painel-mensal');
    painel.style.display = 'block';

    // Pega APENAS o que está 'pago' (o que está 'arquivado' não entra)
    const vendasAtivas = todosPedidosCache.filter(p => p.status === 'pago');

    let total = 0;
    vendasAtivas.forEach(p => {
        let valor = parseFloat(p.total.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
        if(!isNaN(valor)) total += valor;
    });

    // Injeta o HTML com o botão de zerar
    painel.innerHTML = `
        <h3 style="color:#333; margin-bottom:20px;">💰 Caixa Atual (Aberto)</h3>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; max-width:600px; margin:0 auto;">
            <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <p style="color:#666; font-size:0.9rem;">Total em Caixa</p>
                <strong style="font-size:1.8rem; color:#27ae60;">${total.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong>
            </div>
            <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <p style="color:#666; font-size:0.9rem;">Vendas Realizadas</p>
                <strong style="font-size:1.8rem; color:#333;">${vendasAtivas.length}</strong>
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
            Voltar
        </button>
    `;
};

// --- NOVA FUNÇÃO: ZERAR O MÊS ---
window.zerarFechamento = async () => {
    // 1. Pergunta de segurança
    const confirmacao = prompt("Digite 'ZERAR' para confirmar o fechamento do caixa. Isso arquivará as vendas atuais.");
    if(confirmacao !== 'ZERAR') return alert("Ação cancelada.");

    // 2. Filtra todas as vendas 'pago'
    const vendasParaArquivar = todosPedidosCache.filter(p => p.status === 'pago');
    
    if(vendasParaArquivar.length === 0) return alert("Não há vendas para arquivar.");

    // 3. Cria um lote de atualização (Batch) para ser rápido
    const batch = writeBatch(db);

    vendasParaArquivar.forEach(pedido => {
        const ref = doc(db, "pedidos", pedido.id);
        // Muda o status para 'arquivado' (assim ele some da lista 'pago' e 'pendente')
        batch.update(ref, { 
            status: 'arquivado',
            dataArquivamento: Date.now() 
        });
    });

    try {
        await batch.commit();
        alert("Caixa fechado com sucesso! Iniciando novo período.");
        window.carregarPedidos(); // Recarrega tudo (vai vir zerado)
    } catch (e) {
        console.error(e);
        alert("Erro ao fechar caixa.");
    }
};