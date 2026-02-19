
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const tmpFile = path.join(os.tmpdir(), "codex-test-out.txt");
const prompt = "Translate strawberry to Spanish";

const child = spawn("codex", ["exec", "-s", "read-only", "-o", tmpFile, "-"], {
    shell: true,
    stdio: ["pipe", "inherit", "inherit"]
});

child.stdin.write(prompt);
child.stdin.end();

child.on("close", (code) => {
    console.log("Exited with code:", code);
    if (fs.existsSync(tmpFile)) {
        console.log("RESULT:", fs.readFileSync(tmpFile, "utf-8"));
    }
});

