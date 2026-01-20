/**
 * Script para download de arquivos do Firebase Storage
 * Uso: node download-files.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Carrega credenciais
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require('./src/serviceAccountKey.json');

// Inicializa Firebase
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
    });
}

const bucket = admin.storage().bucket();

// Arquivos para baixar (nomes no Storage)
const filesToDownload = [
    'print-jobs/1768326677042-ABDOM_2026-01-13-14-48-36_NAINE_MOTA_DE_JESUS.PDF'
];

// Pasta de destino
const downloadDir = './downloads';

async function downloadFiles() {
    // Cria pasta de downloads se não existir
    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    for (const filePath of filesToDownload) {
        const fileName = path.basename(filePath);
        const destPath = path.join(downloadDir, fileName);

        console.log(`📥 Baixando: ${fileName}...`);

        try {
            const file = bucket.file(filePath);
            await file.download({ destination: destPath });
            console.log(`   ✅ Salvo em: ${destPath}`);
        } catch (error) {
            console.error(`   ❌ Erro: ${error.message}`);
        }
    }

    console.log('\n✅ Download concluído!');
}

downloadFiles().catch(console.error);
