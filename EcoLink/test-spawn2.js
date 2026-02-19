
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const tmpFileIn = path.join(os.tmpdir(), "codex-test-in.txt");
const tmpFileOut = path.join(os.tmpdir(), "codex-test-out.txt");
const prompt = "Translate grape to Spanish";

fs.writeFileSync(tmpFileIn, prompt, "utf-8");

const cmd = `cmd.exe /c type "${tmpFileIn}" | codex exec -s read-only -o "${tmpFileOut}" -`;

exec(cmd, (error, stdout, stderr) => {
    if (error) console.error("Error:", error);
    if (fs.existsSync(tmpFileOut)) {
        console.log("RESULT:", fs.readFileSync(tmpFileOut, "utf-8"));
    } else {
        console.log("No output file generated");
    }
});

