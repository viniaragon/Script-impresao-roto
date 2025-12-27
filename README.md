# 🖨️ EchoLink - Sistema de Impressão Remota

Sistema de impressão remota não-invasivo que permite enviar documentos para impressoras em PCs clientes através de WebSockets.

## 📂 Estrutura do Projeto

```
EchoLink-Project/
├── backend/          # Servidor Node.js + Socket.io (Railway)
├── frontend/         # Dashboard React + Vite (Vercel)
├── agent/            # Agente Windows compilado em .exe (PC Cliente)
└── README.md
```

## 🔄 Fluxo de Funcionamento

1. **Agente (PC Cliente)** inicia e conecta ao servidor via WebSocket
2. **Servidor** registra o socket com um ID único
3. **Agente** lista as impressoras locais e envia para o servidor
4. **Dashboard (Web)** exibe as impressoras disponíveis
5. **Usuário** envia PDF pelo Dashboard → Servidor → Agente → Impressora Local

## 🛠️ Stack Tecnológica

| Componente | Tecnologia | Hospedagem |
|------------|------------|------------|
| Backend | Node.js + Socket.io | Railway |
| Frontend | React + Vite | Vercel |
| Agente | Node.js + PKG (.exe) | PC Cliente |

## 📋 Módulos de Desenvolvimento

### Módulo 1: Backend (Servidor)
- [ ] Setup inicial Node.js + Express
- [ ] Configurar Socket.io
- [ ] Implementar registro de agentes
- [ ] Implementar fila de impressão

### Módulo 2: Agent (Cliente Windows)
- [ ] Conexão WebSocket com servidor
- [ ] Detecção de impressoras via PowerShell
- [ ] Download de PDFs
- [ ] Impressão via PDFtoPrinter
- [ ] Compilação para .exe com PKG

### Módulo 3: Frontend (Dashboard)
- [ ] Interface de listagem de PCs/Impressoras
- [ ] Upload de arquivos PDF
- [ ] Monitoramento de jobs de impressão
- [ ] Status em tempo real

## 🚀 Como Executar

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Agent (Desenvolvimento)
```bash
cd agent
npm install
npm run dev
```

### Agent (Produção - Gerar .exe)
```bash
cd agent
npm run build
```

---

**Regra de Ouro:** Não avance para o próximo módulo até o "Checkout" do atual funcionar! 🎯
