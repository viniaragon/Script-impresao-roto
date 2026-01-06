# 📋 Tarefas Futuras - EchoLink

## 🚀 Migração para Bun Runtime

**Prioridade:** Alta  
**Benefícios:** Startup 4x mais rápido, menor uso de memória, compilação nativa

### Fase 1: Backend (Railway)
- [ ] Instalar Bun no ambiente de desenvolvimento
- [ ] Substituir `npm` por `bun` para gerenciamento de dependências
- [ ] Testar `socket.io` com Bun (compatibilidade)
- [ ] Testar `firebase-admin` com Bun (compatibilidade)
- [ ] Atualizar `nixpacks.toml` para usar Bun no Railway
- [ ] Testar deploy no Railway com Bun

### Fase 2: Frontend (Vercel)
- [ ] Substituir `npm` por `bun` no package manager
- [ ] Next.js já suporta Bun nativamente
- [ ] Atualizar scripts de build
- [ ] Testar deploy na Vercel com Bun

### Fase 3: Agent (Windows .exe)
- [ ] Substituir `pkg` por `bun build --compile`
- [ ] Testar compilação para Windows x64
- [ ] Verificar tamanho do executável (Bun ~90MB vs pkg ~50MB)
- [ ] Testar funcionalidades de impressão
- [ ] Distribuir nova versão

### Referências
- [Bun Documentation](https://bun.sh/docs)
- [Bun with Socket.io](https://bun.sh/guides/ecosystem/socket-io)
- [Bun Compile](https://bun.sh/docs/bundler/executables)

---

## 🖥️ Interface Visual do Agent (Electron)

**Prioridade:** Média  
**Complexidade:** Alta

### Objetivo
Migrar o Agent para Electron para adicionar:
- Ícone na bandeja do sistema (System Tray)
- Janela de status minimizada
- Opção de iniciar com o Windows
- Botão para pausar/encerrar o agente
- Notificações desktop quando receber jobs

### Implementação Sugerida
1. Instalar Electron e electron-builder
2. Criar janela principal com status do agente
3. Implementar tray icon com menu de contexto
4. Usar electron-store para persistência
5. Configurar autoLaunch para iniciar com Windows

---

## 🔒 Melhorias de Segurança

**Prioridade:** Baixa (para produção)

- [ ] Autenticação de agentes com token
- [ ] Rate limiting no servidor
- [ ] Validação de tipos de arquivo
- [ ] Logs de auditoria

---

## 📊 Dashboard Avançado

**Prioridade:** Baixa

- [ ] Histórico de impressões
- [ ] Estatísticas por agente
- [ ] Filtros e busca
- [ ] Exportar relatórios
