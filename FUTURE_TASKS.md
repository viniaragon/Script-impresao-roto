# 📋 Tarefas Futuras - EchoLink

## 🚀 Migração para Bun Runtime ✅ CONCLUÍDA

**Status:** Concluída em 06/01/2026  
**Benefícios Obtidos:** Startup 4x mais rápido, menor uso de memória, compilação muito mais rápida

### Fase 1: Backend (Railway) ✅
- [x] Instalar Bun no ambiente de desenvolvimento
- [x] Substituir `npm` por `bun` para gerenciamento de dependências
- [x] Testar `socket.io` com Bun (compatibilidade)
- [x] Testar `firebase-admin` com Bun (compatibilidade)
- [x] Atualizar `nixpacks.toml` para usar Bun no Railway
- [x] Testar deploy no Railway com Bun

### Fase 2: Frontend (Vercel) ✅
- [x] Substituir `npm` por `bun` no package manager
- [x] Next.js já suporta Bun nativamente
- [x] Atualizar scripts de build
- [x] Testar deploy na Vercel com Bun

### Fase 3: Agent (Windows .exe) ✅
- [x] Substituir `pkg` por `bun build --compile`
- [x] Testar compilação para Windows x64
- [x] Verificar tamanho do executável (Bun: 110MB vs pkg: 54MB)
- [x] Tempo de compilação: 965ms (vs ~30s do pkg)
- [x] Testar funcionalidades de impressão

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
