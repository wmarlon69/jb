/* public/js/auth.js - VERSÃO DEBUG */

import { auth } from "../core/firebase-config.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

console.log("🔓 Script auth.js carregado com sucesso!");

// 1. Auto-Login (Se já estiver logado, entra direto)
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("✅ Usuário já identificado:", user.email);
        window.location.replace("dashboard.html");
    }
});

// 2. Lógica do Botão
const loginForm = document.getElementById('login-form');

if (loginForm) {
    console.log("📝 Formulário encontrado!");

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // IMPEDE A PÁGINA DE RECARREGAR
        console.log("👆 Botão clicado!");

        // Pega os elementos exatos do seu HTML
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = document.querySelector('.btn-entrar'); 
        const errorDiv = document.getElementById('error-msg');
        
        // Efeito visual
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';
        btn.disabled = true;
        if(errorDiv) errorDiv.style.display = 'none';

        try {
            console.log("🔐 Tentando autenticar...");
            await signInWithEmailAndPassword(auth, email, password);
            
            console.log("🎉 Sucesso!");
            btn.innerHTML = '<i class="fas fa-check"></i> Sucesso!';
            btn.style.background = "#22c55e";
            
            // O onAuthStateChanged lá em cima vai fazer o redirecionamento, 
            // mas garantimos aqui também
            setTimeout(() => {
                window.location.replace("dashboard.html");
            }, 500);

        } catch (error) {
            console.error("❌ Erro:", error.code);
            
            let msgErro = "E-mail ou senha incorretos.";
            if(error.code === 'auth/too-many-requests') msgErro = "Muitas tentativas. Aguarde.";
            if(error.code === 'auth/network-request-failed') msgErro = "Sem internet.";
            
            if(errorDiv) {
                errorDiv.innerText = msgErro;
                errorDiv.style.display = 'block';
            } else {
                alert(msgErro);
            }
            
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        }
    });
} else {
    console.error("❌ ERRO CRÍTICO: Não achei o formulário 'login-form' no HTML.");
}