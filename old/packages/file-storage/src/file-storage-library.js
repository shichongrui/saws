"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileStorage = void 0;
const s3_1 = require("@saws/aws/s3");
class FileStorage {
    name;
    client;
    constructor(name) {
        this.name = name;
        const config = {};
        if (process.env.STAGE === 'local') {
            config.endpoint = process.env.S3_ENDPOINT,
                config.credentials = {
                    accessKeyId: String(process.env.S3_ACCESS_KEY),
                    secretAccessKey: String(process.env.S3_SECRET_KEY)
                };
            config.region = 'us-west-2';
        }
        this.client = new s3_1.S3(config);
    }
    getBucketName() {
        return `${process.env.STAGE}-${this.name}`;
    }
    async getFile(path) {
        const response = await this.client.getFile(this.getBucketName(), path);
        return response;
    }
    async getFileUrl(path) {
        const response = await this.client.getPresignedFileUrl(this.getBucketName(), path);
        return response;
    }
    async getFileUploadUrl(path) {
        const response = await this.client.getPresignedUploadUrl(this.getBucketName(), path);
        return response;
    }
    async writeFile(path, file) {
        const response = await this.client.uploadFile(this.getBucketName(), path, file);
        return response;
    }
    async deleteFile(path) {
        await this.client.deleteObject(this.getBucketName(), path);
    }
    async listFiles(path) {
        const response = await this.client.listObjects(this.getBucketName(), path);
        console.log(response);
        return response.Contents;
    }
}
exports.FileStorage = FileStorage;
