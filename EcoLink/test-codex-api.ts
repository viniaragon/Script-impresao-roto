import { readFileSync } from "fs";
import os from "os";
import path from "path";

async function run() {
    const authPath = path.join(os.homedir(), ".codex", "auth.json");
    const auth = JSON.parse(readFileSync(authPath, "utf-8"));
    const token = auth.tokens?.access_token || auth.OPENAI_API_KEY;
    const accountId = auth.tokens?.account_id;

    const url = "https://api.openai.com/v1/chat/completions";

    const models = ["gpt-5.2-codex", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"];
    const headersList = [
        { Authorization: `Bearer ${token}` },
        { Authorization: `Bearer ${token}`, "OpenAI-Organization": accountId },
        { Authorization: `Bearer ${token}`, "OpenAI-Project": accountId },
    ];

    for (const model of models) {
        for (let i = 0; i < headersList.length; i++) {
            const headers: any = { ...headersList[i], "Content-Type": "application/json" };

            const res = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                })
            });

            const status = res.status;
            const text = await res.text();
            console.log(`Model: ${model}, Headers: ${i} => ${status}`);
            if (status === 200) {
                console.log("SUCCESS!", text.substring(0, 100));
            } else if (status !== 429) {
                console.log("Error:", text.substring(0, 200));
            }
        }
    }
}
run();
