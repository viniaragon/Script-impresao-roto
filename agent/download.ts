import { Storage } from '@google-cloud/storage';
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';

// Configurações
const downloadDir = `C:/Users/genes/OneDrive/Área de Trabalho/Quinjing/Nova pasta`;
const storage = new Storage({
    keyFilename: 'service-account.json',
    // Aumenta o tempo de espera para evitar que o script feche sozinho
    retryOptions: { autoRetry: true, maxRetries: 5 }
});
const bucket = storage.bucket('cloud-vault-a176e.firebasestorage.app');

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fileExists(path: string) {
    try { await access(path); return true; } catch { return false; }
}

async function downloadFiles() {
    const targetDate = "2026-02-11";

    try {
        await mkdir(downloadDir, { recursive: true });
        console.log("🔍 Sincronizando laudos com o servidor...");

        const [allFiles] = await bucket.getFiles({
            prefix: 'print-jobs/',
            autoPaginate: true
        });

        const filteredFiles = allFiles.filter(file => file.name.includes(targetDate));
        console.log(`✅ Total detectado: ${filteredFiles.length} laudos.`);

        let count = 0;
        for (const file of filteredFiles) {
            const fileName = file.name.split('/').pop()!;
            const cleanedName = fileName.replace(/^[^-]*-/, '');
            const destinationPath = path.join(downloadDir, cleanedName);

            if (await fileExists(destinationPath)) {
                count++;
                continue;
            }

            try {
                // Baixa o arquivo
                await file.download({ destination: destinationPath });
                count++;
                console.log(`[${count}/${filteredFiles.length}] Sucesso: ${cleanedName}`);

                // Pequena pausa de 200ms para o OneDrive e a rede "respirarem"
                await sleep(200);

            } catch (err) {
                console.error(`⚠️ Falha temporária no arquivo ${cleanedName}, continuando...`);
                continue;
            }
        }

        console.log(`\n🎉 Sincronização concluída!`);

    } catch (error) {
        console.error("❌ Erro na conexão:", error);
    }
}

downloadFiles();