// ============================================================
// EcoLink - Frontend Application
// Handles UI interactions, API calls, and state management
// ============================================================

const API_BASE = "/api";

// ---- State ----
let state = {
    currentReportId: null,
    isGenerating: false,
    isEditing: false,
    historyOpen: false,
    authProvider: "openrouter",
    authUser: null,
};

// Audio Recording State
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// ---- DOM Elements ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
    patientName: $("#patientName"),
    dictationInput: $("#dictation-input"),
    reportOutput: $("#report-output"),
    btnGenerate: $("#btn-generate"),
    btnCopy: $("#btn-copy"),
    btnEditToggle: $("#btn-edit-toggle"),
    btnDownloadWord: $("#btn-download-word"),
    btnNew: $("#btn-new"),
    btnHistory: $("#btn-history"),
    btnCloseHistory: $("#btn-close-history"),
    historyPanel: $("#history-panel"),
    historyList: $("#history-list"),
    overlay: $("#overlay"),
    inputStatus: $("#input-status"),
    tokenInfo: $("#token-info"),
    toastContainer: $("#toast-container"),
    refineArea: $("#refine-area"),
    refineInput: $("#refine-input"),
    btnRefine: $("#btn-refine"),
    // Auth elements
    providerBadge: $("#provider-badge"),
    btnChatgptLogin: $("#btn-chatgpt-login"),
    btnChatgptLogout: $("#btn-chatgpt-logout"),
    // New elements for dictation
    recordBtn: $("#recordBtn"),
    charCount: $("#char-count"),
};

// ---- Initialize ----
async function init() {
    await checkAuthStatus();
    loadHistory();
    bindEvents();
    setupAudioRecording(); // Setup audio recording
    updateCharCount(); // Initial char count
}

// ---- API Calls ----
async function apiCall(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro desconhecido");
    return data;
}

// ---- Generate Report ----
async function generateReport() {
    const rawInput = els.dictationInput.value.trim();
    if (!rawInput) {
        toast("Por favor, digite o ditado do exame.", "error");
        els.dictationInput.focus();
        return;
    }

    if (state.isGenerating) return;

    state.isGenerating = true;
    setStatus("loading", "Gerando laudo...");
    els.btnGenerate.disabled = true;
    els.btnGenerate.innerHTML = `<span class="spinner"></span> Gerando...`;
    els.reportOutput.classList.remove("empty");
    els.reportOutput.textContent = "Analisando ditado e gerando laudo...";

    try {
        const data = await apiCall("/generate", {
            method: "POST",
            body: JSON.stringify({
                rawInput,
                patientName: els.patientName.value.trim() || undefined,
            }),
        });

        state.currentReportId = data.report.id;
        els.reportOutput.textContent = data.report.generated_report;
        els.reportOutput.classList.remove("empty");

        // Show token info
        const provider = data.ai?.provider || state.authProvider;
        const providerLabel = provider === "chatgpt" ? "ChatGPT" : "OpenRouter";
        if (data.ai?.tokensUsed) {
            els.tokenInfo.textContent = `${data.ai.tokensUsed} tokens · ${data.ai.model} (${providerLabel})`;
        } else if (data.ai?.model) {
            els.tokenInfo.textContent = `${data.ai.model} (${providerLabel})`;
        }

        // Enable action buttons
        els.btnCopy.disabled = false;
        els.btnEditToggle.disabled = false;
        els.btnDownloadWord.disabled = false;
        els.btnDownloadWord.style.display = "inline-flex";
        els.refineArea.classList.add("visible");

        setStatus("ready", "Laudo gerado!");
        toast("Laudo gerado com sucesso! ✨", "success");
    } catch (err) {
        console.error("Generate error:", err);
        els.reportOutput.textContent = `Erro: ${err.message}`;
        setStatus("error", "Erro");
        toast(err.message, "error");
    } finally {
        state.isGenerating = false;
        els.btnGenerate.disabled = false;
        els.btnGenerate.innerHTML = "✨ Gerar Laudo";
    }
}

// ---- Refine Report ----
async function refineReport() {
    const instructions = els.refineInput.value.trim();
    if (!instructions || !state.currentReportId) return;

    state.isGenerating = true;
    els.btnRefine.disabled = true;
    els.btnRefine.innerHTML = `<span class="spinner"></span>`;
    setStatus("loading", "Ajustando laudo...");

    try {
        const data = await apiCall(`/refine/${state.currentReportId}`, {
            method: "POST",
            body: JSON.stringify({ instructions }),
        });

        els.reportOutput.textContent = data.report.edited_report || data.report.generated_report;
        els.refineInput.value = "";

        if (data.ai?.tokensUsed) {
            els.tokenInfo.textContent = `${data.ai.tokensUsed} tokens · ${data.ai.model}`;
        }

        setStatus("ready", "Laudo ajustado!");
        toast("Laudo ajustado com sucesso! 🔄", "success");
    } catch (err) {
        toast(err.message, "error");
        setStatus("error", "Erro");
    } finally {
        state.isGenerating = false;
        els.btnRefine.disabled = false;
        els.btnRefine.innerHTML = "🔄 Ajustar";
    }
}

// ---- Copy Report ----
async function copyReport() {
    const text = els.reportOutput.textContent;
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        toast("Laudo copiado para a área de transferência! 📋", "success");
        els.btnCopy.textContent = "✅ Copiado!";
        setTimeout(() => (els.btnCopy.textContent = "📋 Copiar"), 2000);
    } catch {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast("Laudo copiado! 📋", "success");
    }
}

// ---- Edit Toggle ----
function toggleEdit() {
    state.isEditing = !state.isEditing;
    els.reportOutput.contentEditable = state.isEditing ? "true" : "false";
    els.reportOutput.classList.toggle("editable", state.isEditing);
    els.btnEditToggle.textContent = state.isEditing ? "💾 Salvar" : "✏️ Editar";

    if (state.isEditing) {
        els.reportOutput.focus();
        toast("Modo edição ativado. Edite o laudo diretamente.", "success");
    } else {
        // Save edited report
        if (state.currentReportId) {
            apiCall(`/reports/${state.currentReportId}`, {
                method: "PATCH",
                body: JSON.stringify({ edited_report: els.reportOutput.textContent }),
            }).then(() => {
                toast("Edições salvas! 💾", "success");
            }).catch((err) => {
                toast("Erro ao salvar: " + err.message, "error");
            });
        }
    }
}

// ---- New Report ----
function newReport() {
    state.currentReportId = null;
    state.isEditing = false;
    els.dictationInput.value = "";
    els.patientName.value = "";
    els.reportOutput.textContent = "O laudo gerado aparecerá aqui...";
    els.reportOutput.classList.add("empty");
    els.reportOutput.contentEditable = "false";
    els.reportOutput.classList.remove("editable");
    els.btnCopy.disabled = true;
    els.btnEditToggle.disabled = true;
    els.btnDownloadWord.disabled = true;
    els.btnDownloadWord.style.display = "none";
    els.btnEditToggle.textContent = "✏️ Editar";
    els.tokenInfo.textContent = "";
    els.refineArea.classList.remove("visible");
    els.refineInput.value = "";
    setStatus("ready", "Pronto");
    els.dictationInput.focus();
    updateCharCount(); // Update char count for new report
}

// ---- History ----
async function loadHistory() {
    try {
        const data = await apiCall("/reports?limit=30");
        renderHistory(data.reports);
    } catch (err) {
        els.historyList.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:2rem;">Erro ao carregar histórico</p>`;
    }
}

function renderHistory(reports) {
    if (!reports.length) {
        els.historyList.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:2rem;">Nenhum laudo ainda</p>`;
        return;
    }

    els.historyList.innerHTML = reports
        .map((r) => {
            const date = new Date(r.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
            return `
        <div class="history-item" data-id="${r.id}">
          <div class="history-item__type">${r.exam_type}</div>
          <div class="history-item__patient">${r.patient_name || "Paciente não informado"}</div>
          <div class="history-item__date">${date}</div>
        </div>
      `;
        })
        .join("");

    // Bind clicks
    els.historyList.querySelectorAll(".history-item").forEach((item) => {
        item.addEventListener("click", () => loadReportFromHistory(item.dataset.id));
    });
}

async function loadReportFromHistory(id) {
    try {
        const data = await apiCall(`/reports/${id}`);
        const r = data.report;

        state.currentReportId = r.id;
        els.dictationInput.value = r.raw_input;
        els.patientName.value = r.patient_name || "";
        els.reportOutput.textContent = r.edited_report || r.generated_report;
        els.reportOutput.classList.remove("empty");
        els.btnCopy.disabled = false;
        els.btnEditToggle.disabled = false;
        els.btnDownloadWord.disabled = false;
        els.btnDownloadWord.style.display = "inline-flex";
        els.refineArea.classList.add("visible");

        // Select the exam type chip
        state.examType = r.exam_type;
        els.examSelector.querySelectorAll(".exam-chip").forEach((c) => {
            c.classList.toggle("active", c.dataset.type === r.exam_type);
        });

        toggleHistoryPanel(false);
        toast("Laudo carregado do histórico", "success");
        updateCharCount(); // Update char count for loaded report
    } catch (err) {
        toast("Erro ao carregar laudo: " + err.message, "error");
    }
}

function toggleHistoryPanel(open) {
    state.historyOpen = open !== undefined ? open : !state.historyOpen;
    els.historyPanel.classList.toggle("open", state.historyOpen);
    els.overlay.classList.toggle("visible", state.historyOpen);
    if (state.historyOpen) loadHistory();
}

// ---- UI Helpers ----
function setStatus(type, text) {
    els.inputStatus.className = `status status--${type}`;
    els.inputStatus.textContent = `● ${text}`;
}

function toast(message, type = "success") {
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.textContent = message;
    els.toastContainer.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(10px)";
        el.style.transition = "all 0.3s ease";
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

function updateCharCount() {
    if (els.charCount) {
        const count = els.dictationInput.value.length;
        els.charCount.textContent = `${count} caracteres`;
    }
}

// --- Audio Recording (Web API) ---
function setupAudioRecording() {
    if (!els.recordBtn) return;

    els.recordBtn.addEventListener('click', async () => {
        if (isRecording) {
            stopRecording();
        } else {
            await startRecording();
        }
    });
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await uploadAndTranscribe(audioBlob);

            // Parar as tracks do microfone para liberar o ícone no navegador
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;

        // Atualiza UI
        els.recordBtn.classList.add('recording');
        els.recordBtn.querySelector('.text').textContent = "Gravando...";
        toast("Gravando áudio. Clique novamente para parar.", "info");

    } catch (err) {
        console.error("Erro ao acessar microfone:", err);
        toast("Erro ao acessar o microfone. Verifique as permissões do navegador.", "error");
    }
}

function stopRecording() {
    isRecording = false;
    els.recordBtn.classList.remove('recording');
    els.recordBtn.innerHTML = '<span class="icon">🎤</span><span class="text">Ditar</span>';
    setStatus("ready", "Pronto");

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

async function uploadAndTranscribe(blob) {
    try {
        const formData = new FormData();
        formData.append('audio', blob, 'dictation.webm');

        const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        // Restaura botão
        els.recordBtn.querySelector('.text').textContent = "Ditar";

        if (data.success && data.text) {
            // Adiciona o texto transcrito ao campo (com espaço se já houver texto)
            const currentVal = els.dictationInput.value.trim();
            els.dictationInput.value = currentVal ? `${currentVal} ${data.text}` : data.text;

            // Dispara evento input para auto-resize e contagem caracteres
            els.dictationInput.dispatchEvent(new Event('input'));

            toast("Voz transcrita com sucesso!", "success");
        } else {
            throw new Error(data.error || "Erro desconhecido na transcrição");
        }
    } catch (err) {
        console.error("Transcription upload error:", err);
        toast("Erro ao transcrever: " + err.message, "error");
        els.recordBtn.querySelector('.text').textContent = "Ditar";
    }
}

// ---- Download Word ----
function downloadWord() {
    if (!state.currentReportId) return;
    toast("Gerando documento Word... 📄", "success");
    window.location.href = `/api/reports/${state.currentReportId}/download-docx`;
}

// ---- Event Binding ----
function bindEvents() {
    // Generate
    els.btnGenerate.addEventListener("click", generateReport);

    // Ctrl+Enter shortcut
    els.dictationInput.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            generateReport();
        }
    });

    // Auto-resize textarea and char count
    els.dictationInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        updateCharCount();
    });

    // Refine
    els.btnRefine.addEventListener("click", refineReport);
    els.refineInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            refineReport();
        }
    });

    // Copy
    els.btnCopy.addEventListener("click", copyReport);

    // Edit toggle
    els.btnEditToggle.addEventListener("click", toggleEdit);

    // Download Word
    els.btnDownloadWord.addEventListener("click", downloadWord);

    // New report
    els.btnNew.addEventListener("click", newReport);

    // History
    els.btnHistory.addEventListener("click", () => toggleHistoryPanel(true));
    els.btnCloseHistory.addEventListener("click", () => toggleHistoryPanel(false));
    els.overlay.addEventListener("click", () => toggleHistoryPanel(false));

    // ESC to close history
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.historyOpen) {
            toggleHistoryPanel(false);
        }
    });

    // Auth
    els.btnChatgptLogin.addEventListener("click", connectChatGPT);
    els.btnChatgptLogout.addEventListener("click", logoutChatGPT);
}

// ---- Auth Functions ----
async function checkAuthStatus() {
    try {
        const res = await fetch("/auth/status");
        const data = await res.json();

        state.authProvider = data.provider;
        state.authUser = data.userEmail;

        updateProviderUI(data);
    } catch (err) {
        console.error("Failed to check auth status:", err);
    }
}

function updateProviderUI(data) {
    if (data.authenticated && data.provider === "chatgpt") {
        els.providerBadge.textContent = `🤖 ChatGPT ${data.userEmail ? "(" + data.userEmail + ")" : ""}`;
        els.providerBadge.classList.add("chatgpt");
        els.btnChatgptLogin.style.display = "none";
        els.btnChatgptLogout.style.display = "inline-flex";
    } else {
        els.providerBadge.textContent = "🔗 OpenRouter";
        els.providerBadge.classList.remove("chatgpt");
        els.btnChatgptLogin.style.display = "inline-flex";
        els.btnChatgptLogout.style.display = "none";
    }
}

async function connectChatGPT() {
    // Try to read the Codex CLI token
    try {
        const res = await fetch("/auth/connect-codex", { method: "POST" });
        const data = await res.json();

        if (data.success) {
            await checkAuthStatus();
            toast("ChatGPT conectado via Codex CLI! 🎉", "success");
        } else {
            // Token not found — show instructions
            toast("Token não encontrado. Execute 'codex' no terminal para autenticar primeiro.", "error");
            // Prompt for manual token input
            const token = prompt(
                "Token do Codex CLI não encontrado.\n\n" +
                "Opção 1: Execute 'codex' no terminal e autentique primeiro.\n" +
                "Opção 2: Cole uma API key da OpenAI aqui:"
            );
            if (token && token.trim()) {
                const setRes = await fetch("/auth/set-token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: token.trim() }),
                });
                const setData = await setRes.json();
                if (setData.success) {
                    await checkAuthStatus();
                    toast("ChatGPT conectado com API key! 🎉", "success");
                }
            }
        }
    } catch (err) {
        toast("Erro ao conectar: " + err.message, "error");
    }
}

async function logoutChatGPT() {
    try {
        await fetch("/auth/logout", { method: "POST" });
        await checkAuthStatus();
        toast("Desconectado do ChatGPT", "success");
    } catch (err) {
        toast("Erro ao desconectar: " + err.message, "error");
    }
}

// ---- Start ----
init();
