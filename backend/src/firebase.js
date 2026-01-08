/**
 * Configuração do Firebase Admin SDK
 * Para upload de PDFs no Firebase Storage
 */

const admin = require('firebase-admin');

// Credenciais do Firebase (de variável de ambiente em produção)
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require('./serviceAccountKey.json');

// Inicializa o Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
    });
}

const bucket = admin.storage().bucket();

/**
 * Faz upload de um arquivo para o Firebase Storage
 * @param {Buffer} fileBuffer - Buffer do arquivo
 * @param {string} fileName - Nome do arquivo
 * @param {string} mimeType - Tipo MIME do arquivo
 * @returns {Promise<string>} URL pública do arquivo
 */
async function uploadFile(fileBuffer, fileName, mimeType) {
    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `print-jobs/${timestamp}-${safeName}`;

    const file = bucket.file(filePath);

    await file.save(fileBuffer, {
        metadata: {
            contentType: mimeType,
        },
    });

    // Gera URL assinada com validade de 1 hora
    const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hora
    });

    return signedUrl;
}

/**
 * Deleta um arquivo do Firebase Storage
 * @param {string} filePath - Caminho do arquivo no bucket
 */
async function deleteFile(filePath) {
    try {
        await bucket.file(filePath).delete();
    } catch (error) {
        console.error('Erro ao deletar arquivo:', error.message);
    }
}

module.exports = {
    uploadFile,
    deleteFile,
    bucket
};
