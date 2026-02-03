// core/firebase-config.js

// Usando o link direto para funcionar no navegador
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Configuração atualizada para o projeto JB Importes
const firebaseConfig = {
  apiKey: "AIzaSyDGrv0ZcXrxOTEi9lAILUL1-XTcs-gnrEs",
  authDomain: "jbimportes-7ec89.firebaseapp.com",
  projectId: "jbimportes-7ec89",
  storageBucket: "jbimportes-7ec89.firebasestorage.app",
  messagingSenderId: "1014838988878",
  appId: "1:1014838988878:web:976540864fd9454179f31f"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Inicializa e exporta o Firestore (Banco de Dados de Produtos)
export const db = getFirestore(app);

// Inicializa e exporta o Auth (Autenticação do Administrador)
export const auth = getAuth(app);

console.log("✅ Firebase JB Importes configurado com sucesso!");