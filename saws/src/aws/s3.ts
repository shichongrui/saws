import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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