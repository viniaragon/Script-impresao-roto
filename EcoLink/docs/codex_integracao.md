# Integração EcoLink & Codex CLI (Bypass API)

Este documento explica como o EcoLink consegue utilizar modelos avançados da OpenAI (como GPT-4 e GPT-5 Codex) de forma **totalmente gratuita**, aproveitando uma assinatura existente do *ChatGPT Plus*, sem gastar créditos da plataforma de desenvolvedores (API).

## ⚠️ O Problema da API Convencional

Originalmente, o EcoLink utilizava a API REST padrão da OpenAI (`https://api.openai.com/v1/chat/completions`). No entanto, descobrimos uma restrição importante no modelo de negócios da OpenAI:
- **ChatGPT Plus ($20/mês)**: Dá acesso ilimitado/alto volume aos apps e ferramentas oficiais (como o terminal `codex`).
- **API OpenAI ($/token)**: É um serviço pré-pago separado. Assinar o Plus **não** fornece créditos para usar a API.

Se tentássemos usar o token extraído do terminal Codex numa chamada REST comum da API, a OpenAI identificava que a requisição não vinha do aplicativo oficial e tentava cobrar os créditos de desenvolvedor, resultando no erro `429 Insufficient Quota`.

## 💡 A Solução: Wrapper Nativo do Codex CLI

Para resolver isso, nós mudamos completamente a arquitetura de IA do backend do EcoLink. Em vez de fazer requisições HTTP para a API da OpenAI, **o EcoLink agora controla o seu terminal de forma invisível**.

Criamos um "Wrapper" (um adaptador) que transforma a nossa interface web bonita numa espécie de controle remoto para o Codex CLI que já está instalado na sua máquina.

### Como funciona passo a passo:

1. **Autenticação Base**: O processo começa quando o usuário digita `codex` no seu terminal (PowerShell/CMD) e faz o login com sua conta ChatGPT Plus. O Codex salva um token de acesso localmente em `~/.codex/auth.json`.
2. **EcoLink detecta a Autenticação**: Quando você acessa o site do EcoLink e clica em "Conectar ChatGPT", ele lê o arquivo `auth.json` para confirmar que a máquina está autenticada.
3. **Geração do Laudo**: O médico dita o laudo e clica em "Gerar".
4. **Arquivo Temporário**: O servidor Node.js (`ai-service.ts`) pega o prompt do sistema (instruções de como agir como radiologista) + o texto ditado e salva tudo num arquivo de texto temporário secreto na sua máquina (ex: `codex-in-1234.txt`).
5. **Execução Fantasma**: O servidor abre um terminal oculto e executa o comando:
   ```bash
   cmd.exe /c type "codex-in-1234.txt" | codex exec --full-auto -s read-only -o "codex-out-1234.txt" -
   ```
   *Explicação dos parâmetros:*
   - `type ... |`: Envia o texto gigante do laudo para dentro do Codex.
   - `--full-auto`: Impede que o Codex tente pedir permissões na tela (já que está rodando invisível).
   - `-s read-only`: Proteção de segurança total. Garante que a IA só pode **ler** dados e não pode executar comandos ou danificar pastas do Windows.
   - `-o ...`: Pede para a IA salvar apenas a resposta final em outro arquivo de texto.
   - `-`: Diz ao codex para ler a pergunta que enviamos pelo `type`.
6. **Captura do Resultado**: O Codex CLI faz a conexão nativa e criptografada com a OpenAI (usando seus benefícios do plano Plus). Ao terminar, ele salva a resposta no arquivo `-out`. O EcoLink lê esse arquivo, formata o texto e entrega na tela do médico em segundos. Por fim, ele apaga os arquivos temporários para não lotar o disco.

## 🚀 Como Utilizar no Dia a Dia

Para que tudo funcione perfeitamente, você só precisa garantir duas coisas antes de abrir o site do EcoLink:

1. **Sua máquina precisa estar logada no Codex.**
   - Abra o terminal e digite `codex`.
   - Se ele abrir a interface perguntando seu modelo ou o que quer fazer, **você já está logado**. Pode apertar `Ctrl+C` para sair.
   - Se ele pedir para fazer login no navegador, faça o login com sua conta Plus.
2. **Ligue o servidor do EcoLink.**
   - Rode `bun run dev` na pasta do projeto.
   - Acesse `http://localhost:3210`.
   - Clique em **🤖 Conectar ChatGPT**.
   - Pronto! Gere laudos ilimitados.

## Vantagens dessa Abordagem

- **Economia Absoluta**: Sem custos variáveis. Você paga apenas o seu ChatGPT Plus mensal, que já usaria de qualquer forma.
- **Modelos Superiores**: Permite o uso de modelos experimentais e fechados (como o `gpt-5.3-codex`) que nem sempre estão disponíveis na API pública para todos os usuários.
- **Privacidade e Segurança**: O tráfego passa pela ferramenta oficial da OpenAI e o modo `read-only` blinda o seu computador contra comandos mal-intencionados gerados pela IA.
