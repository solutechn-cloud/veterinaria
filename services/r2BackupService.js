'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSystemConfig } = require('../config/systemConfig');

const execFileAsync = promisify(execFile);
let _client = null;

function getClient() {
    if (_client) return _client;
    const accountId = process.env.R2_ACCOUNT_ID;
    const endpoint = process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 no configurado: faltan R2_ACCOUNT_ID/R2_ENDPOINT, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY.');
    }
    _client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
    });
    return _client;
}

function getBucket() {
    const bucket = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET;
    if (!bucket) throw new Error('R2_BUCKET_NAME no configurado.');
    return bucket;
}

function getDatabaseUrl() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL no configurado.');
    return url;
}

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

async function createDumpFile(filename) {
    const filePath = path.join(os.tmpdir(), filename);
    const pgDump = process.env.PGDUMP_BINARY || 'pg_dump';
    await execFileAsync(pgDump, [getDatabaseUrl(), '--no-owner', '--no-acl', '--file', filePath], {
        maxBuffer: 1024 * 1024 * 20,
    });
    return filePath;
}

async function backupDatabaseToR2(options = {}) {
    const cfg = await getSystemConfig(options.tenantId || null);
    const prefix = String(options.prefix || cfg.backupR2Prefix || 'backups').replace(/^\/+|\/+$/g, '');
    const scope = options.scope || 'all_tenants';
    const tenantSlug = String(options.tenantSlug || 'all-tenants').replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `erpveterinaria_${tenantSlug}_${timestamp()}.sql`;
    const objectKey = `${prefix}/${tenantSlug}/${filename}`;
    const filePath = await createDumpFile(filename);

    try {
        const stat = fs.statSync(filePath);
        await getClient().send(new PutObjectCommand({
            Bucket: getBucket(),
            Key: objectKey,
            Body: fs.createReadStream(filePath),
            ContentType: 'application/sql',
            Metadata: {
                scope,
                tenant: tenantSlug,
                createdBy: 'erpveterinaria',
            },
        }));
        return {
            success: true,
            filename,
            objectKey,
            size: stat.size,
            provider: 'cloudflare_r2',
        };
    } finally {
        fs.rm(filePath, { force: true }, () => {});
    }
}

async function deleteOldR2Backups(days = 30, prefix = 'backups') {
    const cutoff = Date.now() - Number(days || 30) * 24 * 60 * 60 * 1000;
    const client = getClient();
    const bucket = getBucket();
    let continuationToken;
    let deleted = 0;

    do {
        const listed = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: String(prefix).replace(/^\/+|\/+$/g, ''),
            ContinuationToken: continuationToken,
        }));
        continuationToken = listed.NextContinuationToken;
        const oldObjects = (listed.Contents || []).filter(obj => obj.LastModified && obj.LastModified.getTime() < cutoff);
        for (const obj of oldObjects) {
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
            deleted += 1;
        }
    } while (continuationToken);

    return { deleted };
}

module.exports = { backupDatabaseToR2, deleteOldR2Backups };
