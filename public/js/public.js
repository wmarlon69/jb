/* public/js/search.js */

import { db } from "../core/firebase-config.js";
import {
    collection,
    addDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Função para registrar um novo pedido (será chamada pelo lado do cliente)
window.registrarPedido = async (carrinho, total, cliente) => {
    try {
        await addDoc(collection(db, "pedidos"), {
            data: Timestamp.now(),
            itens: carrinho,
            total: total,
            cliente: cliente || { nome: "Não informado", telefone: "Não informado" },
            status: "pendente"
        });
        console.log("Pedido registrado com sucesso!");
        return true;
    } catch (error) {
        console.error("Erro ao registrar pedido: ", error);
        return false;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. SISTEMA DE BUSCA (DIGITAR)
    const inputBusca = document.getElementById('inputBusca');
    
    if(inputBusca) {
        inputBusca.addEventListener('keyup', (e) => {
            const termo = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('.produto-card');

            cards.forEach(card => {
                // Pega o nome do produto dentro do card
                const nomeProduto = card.querySelector('h3').innerText.toLowerCase();
                
                if(nomeProduto.includes(termo)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    // 2. FILTRO POR CATEGORIA (BOTÕES)
    const botoesCategoria = document.querySelectorAll('.cat-btn');

    botoesCategoria.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove a classe 'active' de todos e adiciona no clicado
            botoesCategoria.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const categoriaSelecionada = btn.getAttribute('data-cat').toLowerCase();
            const cards = document.querySelectorAll('.produto-card');

            cards.forEach(card => {
                // Pega a categoria escrita na tag do card
                const categoriaProduto = card.querySelector('.tag-categoria').innerText.toLowerCase();

                if (categoriaSelecionada === 'todos') {
                    card.style.display = 'flex';
                } else {
                    // Verifica se a categoria bate (ex: 'medicamentos' contém 'medicamentos')
                    if (categoriaProduto.includes(categoriaSelecionada) || categoriaSelecionada.includes(categoriaProduto)) {
                        card.style.display = 'flex';
                    } else {
                        card.style.display = 'none';
                    }
                }
            });
        });
    });

});