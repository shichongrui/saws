"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3 = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const node_fs_1 = require("node:fs");
const mime_1 = __importDefault(require("mime"));
class S3 {
    client;
    constructor(config = {}) {
        this.client = new client_s3_1.S3Client(config);
    }
    async uploadFileFromPath(bucketName, key, filePath) {
        const file = await node_fs_1.promises.readFile(filePath);
        return this.uploadFile(bucketName, key, file);
    }
    ;
    uploadFile(bucketName, key, file) {
        const contentType = mime_1.default.getType(key);
        const command = new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Body: file,
            Key: key,
            ContentType: contentType ?? undefined
        });
        return this.client.send(command);
    }
    async doesFileExist(bucketName, key) {
        const command = new client_s3_1.HeadObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        try {
            await this.client.send(command);
            return true;
        }
        catch (err) {
            if (err.name === "NotFound") {
                return false;
            }
            throw err;
        }
    }
    ;
    getFile(bucketName, key) {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        return this.client.send(command);
    }
    getPresignedFileUrl(bucketName, key) {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn: 3600 });
    }
    getPresignedUploadUrl(bucketName, key) {
        const command = new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn: 3600 });
    }
    listBuckets() {
        const command = new client_s3_1.ListBucketsCommand({});
        return this.client.send(command);
    }
    createBucket(bucketName) {
        const command = new client_s3_1.CreateBucketCommand({
            Bucket: bucketName,
        });
        return this.client.send(command);
    }
    listObjects(bucketName, prefix, delimiter) {
        const command = new client_s3_1.ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
            Delimiter: delimiter,
        });
        return this.client.send(command);
    }
    deleteObject(bucketName, key) {
        const command = new client_s3_1.DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        return this.client.send(command);
    }
}
exports.S3 = S3;
