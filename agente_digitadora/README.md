# 📁 EchoLink Digitadora Agent

Agente de monitoramento de pasta para envio automático de impressão.

## 🎯 Funcionalidade

- **Monitora pasta selecionada** pelo usuário
- **Detecta novos arquivos** automaticamente
- **Envia para impressão** no PC do médico
- **Controle de duplicatas** - não reenvia arquivos já enviados
- **Rastreamento de status** - verifica se foi impresso com sucesso

## 📦 Instalação

```bash
cd agente_digitadora
npm install
```

## 🚀 Executando

```bash
npm run dev
```

## 💻 Como usar

1. Execute o agente
2. Selecione a pasta para monitorar
3. Escolha o agente destino (PC do médico)
4. Escolha a impressora
5. O agente começa a monitorar!

Qualquer arquivo novo colocado na pasta será enviado automaticamente para impressão.

## 📄 Arquivos suportados

- PDF, JPG, PNG, GIF, BMP
- TXT, DOC, DOCX, XLS, XLSX

## 🔧 Arquivos de configuração

- `digitadora-config.json` - Configurações salvas (pasta, agente, impressora)
- `digitadora-history.json` - Histórico de arquivos enviados

## 📦 Build (executável)

```bash
npm run build
```

Gera `dist/EchoLinkDigitadora.exe`
