import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';

const client = new S3Client({});

export const uploadFile = async (bucketName: string, key: string, filePath: string) => {
    const file = await fs.readFile(filePath);

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Body: file,
        Key: key,
    });

    await client.send(command);
}

export const doesFileExist = async (bucketName: string, key: string) => {
    const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    try {
        await client.send(command);
        return true;
    } catch (err: any) {
        if (err.name === 'NotFound') {
            return false;
        }

        throw err;
    }
}