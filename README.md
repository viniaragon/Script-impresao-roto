# 🖨️ EchoLink - Sistema de Impressão Remota

Sistema completo para impressão remota via web. Permite enviar documentos PDF de qualquer lugar para impressoras físicas em PCs Windows remotos.

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Dashboard Web                            │
│                 (Vercel - Next.js + Tailwind)                    │
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ Lista de    │    │  Upload     │    │  Status em          │  │
│  │ Agentes     │    │  de PDF     │    │  Tempo Real         │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Servidor Backend                              │
│                  (Railway - Node.js)                             │
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ Socket.io   │    │  Firebase   │    │  API REST           │  │
│  │ Hub         │    │  Storage    │    │  /api/agents        │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Windows (.exe)                          │
│                      (PC Cliente)                                │
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ Detectar    │    │ Download    │    │  PDFtoPrinter       │  │
│  │ Impressoras │    │  PDF        │    │  (impressão)        │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🌐 URLs de Produção

| Componente | URL |
|------------|-----|
| Dashboard | https://script-impresao-frontend-20.vercel.app |
| Backend API | https://echolink-backend-production.up.railway.app |

## 📁 Estrutura do Projeto

```
Script-impresao-roto/
├── backend/           # Servidor Node.js (Railway)
│   ├── src/
│   │   ├── index.js   # Servidor Express + Socket.io
│   │   └── firebase.js # Upload para Firebase Storage
│   └── package.json
│
├── frontend/          # Dashboard Next.js (Vercel)
│   ├── src/
│   │   ├── app/       # Páginas Next.js
│   │   ├── components/# Componentes React
│   │   ├── hooks/     # Custom hooks (useSocket)
│   │   └── lib/       # Constantes e tipos
│   └── package.json
│
├── agent/             # Cliente Windows (.exe)
│   ├── src/
│   │   └── index.js   # Lógica do agente
│   ├── dist/          # Executável compilado
│   │   ├── EchoLinkAgent.exe
│   │   └── tools/
│   │       └── PDFtoPrinter.exe
│   └── package.json
│
└── FUTURE_TASKS.md    # Roadmap de melhorias
```

## 🚀 Instalação e Desenvolvimento

### Pré-requisitos
- Node.js 18+
- Conta Firebase (para Storage)
- Conta Railway (para backend)
- Conta Vercel (para frontend)

### Backend (Local)
```bash
cd backend
npm install
cp .env.example .env
# Editar .env com suas configurações
npm run dev
```

### Frontend (Local)
```bash
cd frontend
npm install
npm run dev
```

### Agent (Local)
```bash
cd agent
npm install
npm run dev
```

## 📦 Distribuição do Agent

Para distribuir o agente para clientes Windows:

1. Compile o agente:
   ```bash
   cd agent
   npm run build
   ```

2. Copie o PDFtoPrinter para dist:
   ```bash
   Copy-Item "tools\PDFtoPrinter.exe" -Destination "dist\tools\"
   ```

3. Envie a pasta `dist/` contendo:
   - `EchoLinkAgent.exe`
   - `tools/PDFtoPrinter.exe`

**Requisitos do cliente:** Apenas Windows 10/11 com impressora física.

## 🔧 Variáveis de Ambiente

### Backend (Railway)
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://seu-frontend.vercel.app,http://localhost:3000
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

### Frontend (Vercel)
```env
NEXT_PUBLIC_SERVER_URL=https://seu-backend.railway.app
```

## 📡 Fluxo de Impressão

1. **Upload**: Dashboard envia PDF para `/api/upload`
2. **Storage**: Backend salva no Firebase Storage
3. **Job**: Backend emite job via Socket.io para o agente
4. **Download**: Agente baixa PDF do Firebase
5. **Print**: Agente imprime via PDFtoPrinter.exe
6. **Status**: Agente reporta status em tempo real

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Backend | Node.js, Express, Socket.io |
| Storage | Firebase Storage |
| Agent | Node.js, PKG (compilador para .exe) |
| Impressão | PDFtoPrinter.exe |

## 📋 Roadmap

Veja [FUTURE_TASKS.md](./FUTURE_TASKS.md) para melhorias planejadas:
- Interface visual do agente (Electron)
- Ícone na bandeja do sistema
- Histórico de impressões
- Autenticação de agentes

## 📝 Licença

MIT
