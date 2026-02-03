/* public/js/dashboard.js */
import { auth } from "../core/firebase-config.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- 1. SEGURANÇA (O Porteiro) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Admin logado: ", user.email);
        document.body.style.display = "block"; // Libera a tela
    } else {
        console.warn("Acesso negado. Redirecionando para login.html...");
        // CORREÇÃO: Aponta para o seu arquivo específico
        window.location.replace("login.html"); 
    }
});

// --- 2. LOGOUT ---
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        if(confirm("Tem certeza que deseja sair?")) {
            signOut(auth).then(() => {
                window.location.replace("login.html");
            });
        }
    });
}

// --- 3. SISTEMA DE MENUS ---
window.alternarAba = function(id, btn) {
    document.querySelectorAll('.secao-admin').forEach(s => s.classList.remove('ativa'));
    document.querySelectorAll('.btn-menu-admin').forEach(b => b.classList.remove('ativo'));
    const secaoAlvo = document.getElementById('sec-' + id);
    if(secaoAlvo) secaoAlvo.classList.add('ativa');
    if(btn) btn.classList.add('ativo');
    const searchContainer = document.getElementById('search-container');
    if (searchContainer) {
        searchContainer.style.display = (id === 'produtos') ? 'flex' : 'none';
    }
    if(id === 'produtos' && window.carregarProdutos) window.carregarProdutos();
    if(id === 'cupons' && window.carregarCuponsBanco) window.carregarCuponsBanco();
    if(id === 'banners' && window.carregarBanners) window.carregarBanners();
    if(id === 'vendas' && window.carregarPedidos) window.carregarPedidos();
};

window.toggleMenu = function() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.menu-overlay').classList.toggle('active');
};