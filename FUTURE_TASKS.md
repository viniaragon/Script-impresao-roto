# 📋 Tarefas Futuras - EchoLink

## 🖥️ Interface Visual do Agent (Electron)

**Prioridade:** Média  
**Complexidade:** Alta

### Objetivo
Migrar o Agent de Node.js puro para Electron para adicionar:
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

### Referências
- [Electron Tray API](https://www.electronjs.org/docs/api/tray)
- [electron-builder](https://www.electron.build/)

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
