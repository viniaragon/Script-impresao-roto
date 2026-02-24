// ============================================================
// EcoLink - Frontend Application
// Handles UI interactions, API calls, and state management
// ============================================================

const API_BASE = (window.ECOLINK_CONFIG?.API_URL || "") + "/api";
const AUTH_BASE = (window.ECOLINK_CONFIG?.API_URL || "");

// ---- API Key Auth ----
let currentApiKey = localStorage.getItem("ecolink_api_key") || "";

/**
 * Wrapper around fetch that auto-injects X-API-Key header.
 * Use this instead of raw fetch() for all API calls.
 */
function apiFetch(url, options = {}) {
    if (currentApiKey) {
        options.headers = {
            ...(options.headers || {}),
            "X-API-Key": currentApiKey,
        };
    }
    return fetch(url, options);
}

function showLoginOverlay() {
    document.getElementById("login-overlay").style.display = "flex";
}

function hideLoginOverlay() {
    document.getElementById("login-overlay").style.display = "none";
}

function initAuth() {
    const overlay = document.getElementById("login-overlay");
    const input = document.getElementById("login-apikey");
    const submit = document.getElementById("login-submit");
    const skip = document.getElementById("login-skip");
    const errorEl = document.getElementById("login-error");

    // Show login if no API key stored AND we are NOT on localhost
    const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (!isLocal && !currentApiKey) {
        showLoginOverlay();
    }

    submit.addEventListener("click", async () => {
        const key = input.value.trim();
        if (!key) {
            errorEl.textContent = "Cole sua API Key.";
            errorEl.style.display = "block";
            return;
        }

        // Validate the key against the server
        submit.disabled = true;
        submit.textContent = "⏳ Verificando...";

        try {
            const res = await fetch(`${API_BASE}/gateway/status`, {
                headers: { "X-API-Key": key }
            });

            if (res.status === 401) {
                errorEl.textContent = "❌ Chave inválida ou revogada.";
                errorEl.style.display = "block";
                submit.disabled = false;
                submit.textContent = "🔑 Entrar";
                return;
            }

            // Key is valid!
            currentApiKey = key;
            localStorage.setItem("ecolink_api_key", key);
            hideLoginOverlay();

            // Reload app data
            init();
        } catch (err) {
            errorEl.textContent = "❌ Erro ao conectar com o servidor.";
            errorEl.style.display = "block";
            submit.disabled = false;
            submit.textContent = "🔑 Entrar";
        }
    });

    skip.addEventListener("click", () => {
        hideLoginOverlay();
    });

    // Enter key to submit
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit.click();
    });
}

function logoutApiKey() {
    currentApiKey = "";
    localStorage.removeItem("ecolink_api_key");
    showLoginOverlay();
}

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

// Voice Command State
let voiceModeActive = false;
let speechRecognition = null;
let voiceMediaRecorder = null;
let voiceAudioChunks = [];
let voiceRecordingStream = null;

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
    // Voice command elements
    btnVoiceMode: $("#btn-voice-mode"),
    voiceStatus: $("#voice-status"),
    // Settings elements
    btnSettings: $("#btn-settings"),
    settingsModal: $("#settings-modal"),
    settingsOverlay: $("#settings-overlay"),
    btnCloseSettings: $("#btn-close-settings"),
    btnSaveSettings: $("#btn-save-settings"),
    settingsDocxPath: $("#settings-docx-path"),
    settingsPdfPath: $("#settings-pdf-path"),
    // History management
    btnClearHistory: $("#btn-clear-history"),
    // Audio retry
    retryAudioBtn: $("#retryAudioBtn"),
};

// Track the current pending backup ID for retry
let pendingRetryBackupId = null;

// ---- Initialize ----
async function init() {
    initAuth();
    await checkAuthStatus();
    loadHistory();
    bindEvents();
    setupAudioRecording(); // Setup audio recording
    updateCharCount(); // Initial char count
    checkPendingBackups(); // Check for unsent audio backups
}

// ---- API Calls ----
async function apiCall(path, options = {}) {
    const res = await apiFetch(`${API_BASE}${path}`, {
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

        // Show export info
        let exportMsg = "Laudo gerado com sucesso! ✨";
        if (data.exports?.docxPath) exportMsg += " 📄 Word salvo.";
        if (data.exports?.pdfPath) exportMsg += " 📑 PDF salvo.";
        toast(exportMsg, "success");
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
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1; cursor:pointer;" class="history-item__click">
              <div class="history-item__type">${r.exam_type}</div>
              <div class="history-item__patient">${r.patient_name || "Paciente não informado"}</div>
              <div class="history-item__date">${date}</div>
            </div>
            <button class="btn btn--ghost history-item__delete" data-id="${r.id}" title="Excluir este laudo" style="color: var(--error-color); font-size: 1rem; padding: 4px 8px;">✕</button>
          </div>
        </div>
      `;
        })
        .join("");

    // Bind clicks to load report
    els.historyList.querySelectorAll(".history-item__click").forEach((item) => {
        item.addEventListener("click", () => {
            const id = item.closest(".history-item").dataset.id;
            loadReportFromHistory(id);
        });
    });

    // Bind delete buttons
    els.historyList.querySelectorAll(".history-item__delete").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteHistoryItem(btn.dataset.id);
        });
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

        // Update exam type state (if available)
        state.examType = r.exam_type;

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

async function deleteHistoryItem(id) {
    if (!confirm("Tem certeza que deseja excluir este laudo?")) return;
    try {
        await apiCall(`/reports/${id}`, { method: "DELETE" });
        toast("🗑️ Laudo excluído.", "success");
        // If the deleted report was currently loaded, clear the view
        if (state.currentReportId === id) {
            newReport();
        }
        loadHistory(); // Refresh list
    } catch (err) {
        toast("Erro ao excluir: " + err.message, "error");
    }
}

async function clearAllHistory() {
    if (!confirm("Tem certeza que deseja EXCLUIR TODO o histórico? Esta ação não pode ser desfeita.")) return;
    try {
        const data = await apiCall("/reports", { method: "DELETE" });
        toast(`🗑️ ${data.deletedCount} laudos excluídos.`, "success");
        newReport();
        loadHistory(); // Refresh (will show empty)
    } catch (err) {
        toast("Erro ao limpar histórico: " + err.message, "error");
    }
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

async function uploadAndTranscribe(blob, existingBackupId) {
    let backupId = existingBackupId || null;

    try {
        const patientName = els.patientName.value.trim();

        // Save audio backup BEFORE sending (instant, local)
        if (!backupId) {
            backupId = await saveAudioBackup(blob, patientName);
        }

        const formData = new FormData();
        formData.append('audio', blob, 'dictation.webm');

        const res = await apiFetch(`${API_BASE}/transcribe`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        // Restaura botão
        els.recordBtn.querySelector('.text').textContent = "Ditar";

        if (data.success && data.text) {
            // SUCCESS — remove backup
            await removeAudioBackup(backupId);
            hideRetryButton();

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

        // FAILURE — mark backup as failed (audio is safe!)
        await markBackupFailed(backupId);

        toast("⚠️ Erro na transcrição. Áudio salvo! Clique 🔄 Reenviar.", "error");
        els.recordBtn.querySelector('.text').textContent = "Ditar";

        // Show retry button NEAR Ditar
        showRetryButton(backupId);
    }
}

/**
 * Show/hide the dedicated retry button near Ditar.
 */
function showRetryButton(backupId) {
    pendingRetryBackupId = backupId;
    els.retryAudioBtn.style.display = "inline-flex";
}

function hideRetryButton() {
    pendingRetryBackupId = null;
    els.retryAudioBtn.style.display = "none";
}

/**
 * Retry: re-send audio from backup (transcription only, no auto-generation).
 */
async function retryAudio() {
    if (!pendingRetryBackupId) return;

    const backup = await getBackupById(pendingRetryBackupId);
    if (!backup || !backup.blob) {
        toast("❌ Backup não encontrado.", "error");
        hideRetryButton();
        return;
    }

    // Restore patient name if saved
    if (backup.patientName && !els.patientName.value.trim()) {
        els.patientName.value = backup.patientName;
    }

    els.retryAudioBtn.querySelector('.text').textContent = "Reenviando...";
    toast("🔄 Reenviando áudio salvo...", "success");

    // Use uploadAndTranscribe (transcription only, NOT report generation)
    await uploadAndTranscribe(backup.blob, pendingRetryBackupId);

    // If successful, hide the button
    if (!pendingRetryBackupId) {
        els.retryAudioBtn.querySelector('.text').textContent = "Reenviar";
    }
}

// ---- Download Word ----
function downloadWord() {
    if (!state.currentReportId) return;
    toast("Gerando documento Word... 📄", "success");
    window.location.href = `${API_BASE}/reports/${state.currentReportId}/download-docx`;
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
    els.btnClearHistory.addEventListener("click", clearAllHistory);
    els.retryAudioBtn.addEventListener("click", retryAudio);

    // ESC to close history
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.historyOpen) {
            toggleHistoryPanel(false);
        }
    });

    // Auth
    els.btnChatgptLogin.addEventListener("click", connectChatGPT);
    els.btnChatgptLogout.addEventListener("click", logoutChatGPT);

    // Voice Mode
    els.btnVoiceMode.addEventListener("click", toggleVoiceMode);

    // Settings
    els.btnSettings.addEventListener("click", openSettings);
    els.btnCloseSettings.addEventListener("click", closeSettings);
    els.settingsOverlay.addEventListener("click", closeSettings);
    els.btnSaveSettings.addEventListener("click", saveSettingsFromUI);
}

// ---- Auth Functions ----
async function checkAuthStatus() {
    try {
        const baseUrl = window.ECOLINK_CONFIG?.API_URL || "";
        const res = await apiFetch(`${baseUrl}/auth/status`);
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

// ---- Settings Modal ----

async function openSettings() {
    // Load current settings from backend
    try {
        const data = await apiCall("/settings");
        els.settingsDocxPath.value = data.settings.exportDocxPath || "";
        els.settingsPdfPath.value = data.settings.exportPdfPath || "";
    } catch (err) {
        console.error("Failed to load settings:", err);
    }
    els.settingsModal.style.display = "block";
    els.settingsOverlay.style.display = "block";
}

function closeSettings() {
    els.settingsModal.style.display = "none";
    els.settingsOverlay.style.display = "none";
}

async function saveSettingsFromUI() {
    try {
        const settings = {
            exportDocxPath: els.settingsDocxPath.value.trim(),
            exportPdfPath: els.settingsPdfPath.value.trim(),
        };
        await apiCall("/settings", {
            method: "POST",
            body: JSON.stringify(settings),
        });
        toast("⚙️ Configurações salvas com sucesso!", "success");
        closeSettings();
    } catch (err) {
        toast("Erro ao salvar configurações: " + err.message, "error");
    }
}

// ============================================================
// Voice Command Listener (Web Speech API)
// "eco começar" → start recording, "eco gerar" → stop + process
// ============================================================

function toggleVoiceMode() {
    if (voiceModeActive) {
        stopVoiceListening();
    } else {
        startVoiceListening();
    }
}

function setVoiceStatus(status, color) {
    els.voiceStatus.style.display = "inline";
    els.voiceStatus.textContent = `● ${status}`;
    els.voiceStatus.style.color = color || "var(--text-muted)";
}

function startVoiceListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        toast("Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.", "error");
        return;
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = "pt-BR";

    speechRecognition.onstart = () => {
        voiceModeActive = true;
        els.btnVoiceMode.textContent = "🔴 Parar Voz";
        els.btnVoiceMode.classList.add("active");
        setVoiceStatus("Escutando comandos...", "#4CAF50");
        toast("🎧 Modo Voz ativado! Diga \"eco começar\" para gravar.", "success");
    };

    speechRecognition.onresult = (event) => {
        // Check only the latest result for wake words
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript.toLowerCase().trim();

            // Detect "eco começar" (start recording)
            if (transcript.includes("eco começar") || transcript.includes("eco comecar") || transcript.includes("eco iniciar")) {
                if (!isRecording) {
                    startVoiceRecording();
                }
                return;
            }

            // Detect "eco gerar" (stop recording + process)
            if (transcript.includes("eco gerar") || transcript.includes("eco gera") || transcript.includes("eco parar")) {
                if (isRecording) {
                    stopVoiceRecordingAndProcess();
                }
                return;
            }
        }
    };

    speechRecognition.onerror = (event) => {
        if (event.error === "no-speech") return; // Ignore silence
        if (event.error === "aborted") return;   // Ignore manual abort
        console.error("SpeechRecognition error:", event.error);
        setVoiceStatus(`Erro: ${event.error}`, "#f44336");
    };

    speechRecognition.onend = () => {
        // Auto-restart if voice mode is still active (continuous listening)
        if (voiceModeActive) {
            try {
                speechRecognition.start();
            } catch (e) {
                // Ignore if already started
            }
        }
    };

    try {
        speechRecognition.start();
    } catch (e) {
        toast("Erro ao iniciar reconhecimento de voz: " + e.message, "error");
    }
}

function stopVoiceListening() {
    voiceModeActive = false;
    if (speechRecognition) {
        speechRecognition.abort();
        speechRecognition = null;
    }
    // If currently recording, stop that too
    if (isRecording && voiceMediaRecorder) {
        voiceMediaRecorder.stop();
        isRecording = false;
    }
    if (voiceRecordingStream) {
        voiceRecordingStream.getTracks().forEach(t => t.stop());
        voiceRecordingStream = null;
    }
    els.btnVoiceMode.textContent = "🎧 Modo Voz";
    els.btnVoiceMode.classList.remove("active");
    els.voiceStatus.style.display = "none";
    toast("🎧 Modo Voz desativado.", "success");
}

async function startVoiceRecording() {
    try {
        voiceRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceMediaRecorder = new MediaRecorder(voiceRecordingStream, { mimeType: "audio/webm" });
        voiceAudioChunks = [];

        voiceMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) voiceAudioChunks.push(e.data);
        };

        voiceMediaRecorder.start();
        isRecording = true;

        setVoiceStatus("🔴 Gravando ditado... Diga \"eco gerar\" para finalizar.", "#f44336");
        toast("🎤 Gravação iniciada! Dite o exame agora.", "success");
    } catch (err) {
        console.error("Erro ao iniciar gravação:", err);
        toast("Erro ao acessar microfone: " + err.message, "error");
    }
}

function stopVoiceRecordingAndProcess() {
    if (!voiceMediaRecorder || voiceMediaRecorder.state === "inactive") return;

    setVoiceStatus("⏳ Processando... (transcrevendo → gerando laudo → exportando)", "#FF9800");
    toast("⏳ Processando o ditado...", "success");

    voiceMediaRecorder.onstop = async () => {
        const audioBlob = new Blob(voiceAudioChunks, { type: "audio/webm" });

        // Release microphone
        if (voiceRecordingStream) {
            voiceRecordingStream.getTracks().forEach(t => t.stop());
            voiceRecordingStream = null;
        }
        isRecording = false;

        // Send to voice-flow endpoint
        await processVoiceFlow(audioBlob);
    };

    voiceMediaRecorder.stop();
}

async function processVoiceFlow(audioBlob, existingBackupId) {
    let backupId = existingBackupId || null;

    try {
        state.isGenerating = true;
        els.reportOutput.classList.remove("empty");
        els.reportOutput.textContent = "⏳ Transcrevendo áudio e gerando laudo...";

        const patientName = els.patientName.value.trim();

        // Save audio backup BEFORE sending (instant, local)
        if (!backupId) {
            backupId = await saveAudioBackup(audioBlob, patientName);
        }

        const formData = new FormData();
        formData.append("audio", audioBlob, "voice-flow.webm");
        if (patientName) {
            formData.append("patientName", patientName);
        }

        const res = await fetch(`${API_BASE}/voice-flow`, {
            method: "POST",
            body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro no fluxo de voz");

        // SUCCESS — remove backup
        await removeAudioBackup(backupId);

        // Update UI with results
        state.currentReportId = data.report.id;
        els.dictationInput.value = data.transcription;
        els.reportOutput.textContent = data.report.generated_report;
        els.reportOutput.classList.remove("empty");

        // Enable action buttons
        els.btnCopy.disabled = false;
        els.btnEditToggle.disabled = false;
        els.btnDownloadWord.disabled = false;
        els.btnDownloadWord.style.display = "inline-flex";
        els.refineArea.classList.add("visible");

        // Show AI info
        if (data.ai?.tokensUsed) {
            els.tokenInfo.textContent = `${data.ai.tokensUsed} tokens · ${data.ai.model}`;
        }

        // Show export info
        let exportMsg = "✅ Laudo gerado!";
        if (data.exports?.docxPath) exportMsg += ` 📄 Word salvo.`;
        if (data.exports?.pdfPath) exportMsg += ` 📑 PDF salvo.`;
        toast(exportMsg, "success");
        setVoiceStatus("✅ Pronto! Diga \"eco começar\" para novo laudo.", "#4CAF50");

        updateCharCount();
    } catch (err) {
        console.error("Voice-flow error:", err);

        // FAILURE — mark backup as failed (audio is safe!)
        await markBackupFailed(backupId);

        els.reportOutput.textContent = `Erro: ${err.message}`;
        toast("⚠️ Erro no envio. Áudio salvo localmente! Use 🔄 Reenviar.", "error");
        setVoiceStatus("⚠️ Falha! Áudio protegido. Clique 🔄 para reenviar.", "#f44336");

        // Show retry button
        showRetryButton(backupId);
    } finally {
        state.isGenerating = false;
    }
}

/**
 * Check for pending audio backups on page load.
 * Shows the retry button near Ditar if there are failed/pending backups.
 */
async function checkPendingBackups() {
    const pending = await getPendingBackups();
    if (pending.length > 0) {
        const latest = pending[0];
        toast(`📦 ${pending.length} áudio(s) pendente(s). Clique 🔄 Reenviar.`, "error");
        showRetryButton(latest.id);
    }
}

// ---- Start ----
init();
