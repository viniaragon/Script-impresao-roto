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
const db = admin.firestore();

/**
 * Extrai metadados do nome do arquivo
 * Padrão esperado: TIPO_YYYY-MM-DD-HH-MM-SS_NOME_PACIENTE.EXT
 * Exemplo: MAMAS_2026-01-13-12-18-42_RAIANE_JESUS_SILVA.PDF
 * @param {string} fileName - Nome original do arquivo
 * @returns {Object|null} Objeto com examType, examDate, patientName ou null se não corresponder
 */
function parseFileName(fileName) {
    // Remove extensão para processar
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

    // Regex para o padrão: TIPO_DATA_NOME
    const regex = /^([A-Z]+)_(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})_(.+)$/i;
    const match = nameWithoutExt.match(regex);

    if (match) {
        const [, examType, dateStr, patientName] = match;
        const [year, month, day, hour, min, sec] = dateStr.split('-').map(Number);

        return {
            examType: examType.toUpperCase(),
            examDate: new Date(year, month - 1, day, hour, min, sec),
            patientName: patientName.replace(/_/g, ' ').trim()
        };
    }

    return null;
}

/**
 * Salva metadados do arquivo no Firestore
 * @param {Object} fileData - Dados do arquivo
 * @returns {Promise<string>} ID do documento criado
 */
async function saveFileMetadata(fileData) {
    const docRef = await db.collection('files').add({
        ...fileData,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'uploaded'
    });
    return docRef.id;
}

/**
 * Faz upload de um arquivo para o Firebase Storage e salva metadados no Firestore
 * @param {Buffer} fileBuffer - Buffer do arquivo
 * @param {string} fileName - Nome do arquivo
 * @param {string} mimeType - Tipo MIME do arquivo
 * @param {number} fileSize - Tamanho do arquivo em bytes
 * @returns {Promise<Object>} Objeto com url, fileId e metadata
 */
async function uploadFile(fileBuffer, fileName, mimeType, fileSize = 0) {
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

    // Extrai metadados do nome do arquivo
    const parsedMetadata = parseFileName(fileName);

    // Prepara dados para o Firestore
    const fileData = {
        originalFileName: fileName,
        storagePath: filePath,
        fileUrl: signedUrl,
        mimeType,
        size: fileSize || fileBuffer.length,
        examType: parsedMetadata?.examType || null,
        examDate: parsedMetadata?.examDate || null,
        patientName: parsedMetadata?.patientName || null
    };

    // Salva metadados no Firestore
    const fileId = await saveFileMetadata(fileData);

    return {
        url: signedUrl,
        fileId,
        storagePath: filePath,
        metadata: parsedMetadata
    };
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
    parseFileName,
    saveFileMetadata,
    bucket,
    db
};
