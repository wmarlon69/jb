from firebase_functions import https_fn
from firebase_admin import initialize_app
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import json
import re

initialize_app()
app = Flask(__name__)
CORS(app)

# Sua chave protegida na nuvem
genai.configure(api_key="AIzaSyAx8tLLLnSL7CijSewZvSZzbtzng5Nk71g")
model = genai.GenerativeModel('gemini-1.5-flash')

def extrair_json(texto):
    try:
        match = re.search(r'\{.*\}', texto, re.DOTALL)
        return match.group(0) if match else texto
    except: return texto

@app.route('/analisar', methods=['POST'])
def analisar():
    try:
        dados = request.json
        msg = dados.get('msg', '')
        response = model.generate_content(f"Analise risco de golpe nesta mensagem. Seja curto: {msg}")
        return jsonify({"analise": response.text})
    except Exception as e: return jsonify({"erro": str(e)}), 500

@app.route('/recomendar_look', methods=['POST'])
def recomendar_look():
    try:
        d = request.json
        prompt = f"Aja como Personal Stylist da JB Importes. Cliente quer: {d.get('query')}. Estoque: {json.dumps(d.get('produtos', [])[:10])}. Responda apenas o JSON com ids_escolhidos e comentario_stylist."
        response = model.generate_content(prompt)
        return jsonify({"resultado": extrair_json(response.text)})
    except Exception as e: return jsonify({"erro": str(e)}), 500

@https_fn.on_request()
def sentinel_cloud(req: https_fn.Request) -> https_fn.Response:
    with app.request_context(req.environ):
        return app.full_dispatch_request()