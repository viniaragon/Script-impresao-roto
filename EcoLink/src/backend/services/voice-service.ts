export async function transcribeAudio(audioFile: File): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("GROQ_API_KEY não configurada no .env");
    }

    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "whisper-large-v3-turbo"); // Modelo otimizado para latência
    formData.append("language", "pt");
    formData.append("response_format", "json");
    formData.append("temperature", "0.0"); // Zero temperatura para focar na transcrição exata

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("Groq Transcription Error:", errText);
        throw new Error("Falha na transcrição de áudio via Groq");
    }

    const data = (await response.json()) as { text: string };
    return data.text.trim();
}
