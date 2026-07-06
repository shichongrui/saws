import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, S3Client, } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
/**
 * File operations backed by the S3-compatible API exposed by RustFSService.
 */
export class Files {
    name;
    bucket;
    client;
    bucketReady;
    constructor(name, options = {}) {
        const { environment, endpoint, accessKeyId, secretAccessKey, region, bucket, ...clientOptions } = options;
        const resolved = resolveRustFSConfiguration(name, environment, {
            endpoint,
            accessKeyId,
            secretAccessKey,
            region,
            bucket,
        });
        this.name = name;
        this.bucket = resolved.bucket;
        this.client = new S3Client({
            ...clientOptions,
            endpoint: resolved.endpoint,
            credentials: {
                accessKeyId: resolved.accessKeyId,
                secretAccessKey: resolved.secretAccessKey,
            },
            region: resolved.region,
            forcePathStyle: clientOptions.forcePathStyle ?? true,
        });
    }
    async getFile(path) {
        await this.ensureBucket();
        return this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: path,
        }));
    }
    async readFile(path) {
        const response = await this.getFile(path);
        if (response.Body == null) {
            throw new Error(`RustFS returned an empty body for "${path}"`);
        }
        return response.Body.transformToByteArray();
    }
    async getFileUrl(path, expiresIn) {
        await this.ensureBucket();
        return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: path }), expiresIn == null ? undefined : { expiresIn });
    }
    async getFileUploadUrl(path, expiresIn) {
        await this.ensureBucket();
        return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: path }), expiresIn == null ? undefined : { expiresIn });
    }
    async writeFile(path, file, options = {}) {
        await this.ensureBucket();
        return this.client.send(new PutObjectCommand({
            ...options,
            Bucket: this.bucket,
            Key: path,
            Body: file,
        }));
    }
    async deleteFile(path) {
        await this.ensureBucket();
        return this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: path,
        }));
    }
    async listFiles(path = "") {
        await this.ensureBucket();
        const response = await this.client.send(new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: path,
        }));
        return response.Contents ?? [];
    }
    ensureBucket() {
        this.bucketReady ??= ensureBucketExists(this.client, this.bucket).catch((error) => {
            this.bucketReady = undefined;
            throw error;
        });
        return this.bucketReady;
    }
}
export function resolveRustFSConfiguration(serviceName, environment, overrides = {}) {
    const prefix = rustFSServiceEnvironmentPrefix(serviceName);
    const source = {
        ...getProcessEnvironment(),
        ...getRuntimeEnvironment(),
        ...environment,
    };
    return {
        endpoint: requireValue(serviceName, `${prefix}_RUSTFS_ENDPOINT`, overrides.endpoint ?? source[`${prefix}_RUSTFS_ENDPOINT`]),
        accessKeyId: requireValue(serviceName, `${prefix}_RUSTFS_ACCESS_KEY_ID`, overrides.accessKeyId ?? source[`${prefix}_RUSTFS_ACCESS_KEY_ID`]),
        secretAccessKey: requireValue(serviceName, `${prefix}_RUSTFS_SECRET_ACCESS_KEY`, overrides.secretAccessKey ??
            source[`${prefix}_RUSTFS_SECRET_ACCESS_KEY`]),
        region: overrides.region ??
            source[`${prefix}_RUSTFS_REGION`] ??
            "us-east-1",
        bucket: requireValue(serviceName, `${prefix}_RUSTFS_BUCKET`, overrides.bucket ?? source[`${prefix}_RUSTFS_BUCKET`]),
    };
}
export function rustFSServiceEnvironmentPrefix(serviceName) {
    return serviceName.replace(/[^a-zA-Z\d]/g, "_").toUpperCase();
}
async function ensureBucketExists(client, bucket) {
    try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return;
    }
    catch (error) {
        const status = error
            .$metadata?.httpStatusCode;
        const name = error.name;
        if (status !== 404 && name !== "NotFound" && name !== "NoSuchBucket") {
            throw error;
        }
    }
    try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    catch (error) {
        const name = error.name;
        if (name !== "BucketAlreadyOwnedByYou") {
            throw error;
        }
    }
}
function requireValue(serviceName, variableName, value) {
    if (value == null || value.trim().length === 0) {
        throw new Error(`RustFS service "${serviceName}" is not configured: ` +
            `${variableName} must be present in the SAWS environment`);
    }
    return value;
}
function getRuntimeEnvironment() {
    return globalThis.ENV;
}
function getProcessEnvironment() {
    return globalThis.process?.env;
}
