import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
  type PutObjectCommandInput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface FilesClientOptions
  extends Omit<S3ClientConfig, "endpoint" | "credentials" | "region"> {
  /** Explicit environment source for application adapters. */
  environment?: Record<string, string | undefined>;
  /** Override an injected value when connecting to an external S3-compatible service. */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  bucket?: string;
}

export interface FilesClientConfiguration {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

export class FilesClient {
  readonly serviceName: string;
  readonly bucket: string;
  readonly client: S3Client;
  private bucketReady?: Promise<void>;

  constructor(serviceName: string, options: FilesClientOptions = {}) {
    const {
      environment,
      endpoint,
      accessKeyId,
      secretAccessKey,
      region,
      bucket,
      ...clientOptions
    } = options;
    const resolved = resolveFilesClientConfiguration(serviceName, environment, {
      endpoint,
      accessKeyId,
      secretAccessKey,
      region,
      bucket,
    });

    this.serviceName = serviceName;
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

  async get(path: string): Promise<GetObjectCommandOutput> {
    await this.ensureBucket();
    return this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    }));
  }

  async read(path: string): Promise<Uint8Array> {
    const response = await this.get(path);
    if (response.Body == null) {
      throw new Error(`File service returned an empty body for "${path}"`);
    }
    return response.Body.transformToByteArray();
  }

  async write(
    path: string,
    file: PutObjectCommandInput["Body"],
    options: Omit<PutObjectCommandInput, "Bucket" | "Key" | "Body"> = {},
  ) {
    await this.ensureBucket();
    return this.client.send(new PutObjectCommand({
      ...options,
      Bucket: this.bucket,
      Key: path,
      Body: file,
    }));
  }

  async delete(path: string) {
    await this.ensureBucket();
    return this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: path,
    }));
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureBucket();
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }));
      return true;
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  async list(
    path = "",
  ): Promise<NonNullable<ListObjectsV2CommandOutput["Contents"]>> {
    await this.ensureBucket();
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: path,
    }));
    return response.Contents ?? [];
  }

  async getUrl(path: string, expiresIn?: number) {
    await this.ensureBucket();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: path }),
      expiresIn == null ? undefined : { expiresIn },
    );
  }

  async getUploadUrl(path: string, expiresIn?: number) {
    await this.ensureBucket();
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: path }),
      expiresIn == null ? undefined : { expiresIn },
    );
  }

  getFile(path: string) {
    return this.get(path);
  }

  readFile(path: string) {
    return this.read(path);
  }

  writeFile(
    path: string,
    file: PutObjectCommandInput["Body"],
    options: Omit<PutObjectCommandInput, "Bucket" | "Key" | "Body"> = {},
  ) {
    return this.write(path, file, options);
  }

  deleteFile(path: string) {
    return this.delete(path);
  }

  fileExists(path: string) {
    return this.exists(path);
  }

  listFiles(path = "") {
    return this.list(path);
  }

  getFileUrl(path: string, expiresIn?: number) {
    return this.getUrl(path, expiresIn);
  }

  getFileUploadUrl(path: string, expiresIn?: number) {
    return this.getUploadUrl(path, expiresIn);
  }

  private ensureBucket() {
    this.bucketReady ??= ensureBucketExists(this.client, this.bucket).catch(
      (error) => {
        this.bucketReady = undefined;
        throw error;
      },
    );
    return this.bucketReady;
  }
}

export function resolveFilesClientConfiguration(
  serviceName: string,
  environment?: Record<string, string | undefined>,
  overrides: Partial<FilesClientConfiguration> = {},
): FilesClientConfiguration {
  const prefix = filesServiceEnvironmentPrefix(serviceName);
  const source = {
    ...getProcessEnvironment(),
    ...getRuntimeEnvironment(),
    ...environment,
  };

  return {
    endpoint: requireValue(
      serviceName,
      `${prefix}_FILES_ENDPOINT`,
      overrides.endpoint ??
        source[`${prefix}_FILES_ENDPOINT`] ??
        source[`${prefix}_RUSTFS_ENDPOINT`],
    ),
    accessKeyId: requireValue(
      serviceName,
      `${prefix}_FILES_ACCESS_KEY_ID`,
      overrides.accessKeyId ??
        source[`${prefix}_FILES_ACCESS_KEY_ID`] ??
        source[`${prefix}_RUSTFS_ACCESS_KEY_ID`],
    ),
    secretAccessKey: requireValue(
      serviceName,
      `${prefix}_FILES_SECRET_ACCESS_KEY`,
      overrides.secretAccessKey ??
        source[`${prefix}_FILES_SECRET_ACCESS_KEY`] ??
        source[`${prefix}_RUSTFS_SECRET_ACCESS_KEY`],
    ),
    region:
      overrides.region ??
      source[`${prefix}_FILES_REGION`] ??
      source[`${prefix}_RUSTFS_REGION`] ??
      "us-east-1",
    bucket: requireValue(
      serviceName,
      `${prefix}_FILES_BUCKET`,
      overrides.bucket ??
        source[`${prefix}_FILES_BUCKET`] ??
        source[`${prefix}_RUSTFS_BUCKET`],
    ),
  };
}

export function filesServiceEnvironmentPrefix(serviceName: string) {
  return serviceName.replace(/[^a-zA-Z\d]/g, "_").toUpperCase();
}

async function ensureBucketExists(client: S3Client, bucket: string) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    const name = (error as Error).name;
    if (status !== 404 && name !== "NotFound" && name !== "NoSuchBucket") {
      throw error;
    }
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const name = (error as Error).name;
    if (name !== "BucketAlreadyOwnedByYou") {
      throw error;
    }
  }
}

function isObjectNotFoundError(error: unknown) {
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  const name = (error as Error).name;
  return status === 404 || name === "NotFound" || name === "NoSuchKey";
}

function requireValue(
  serviceName: string,
  variableName: string,
  value: string | undefined,
) {
  if (value == null || value.trim().length === 0) {
    throw new Error(
      `File service "${serviceName}" is not configured: ` +
        `${variableName} must be present in the SAWS environment`,
    );
  }
  return value;
}

function getRuntimeEnvironment() {
  return (
    globalThis as typeof globalThis & {
      ENV?: Record<string, string | undefined>;
    }
  ).ENV;
}

function getProcessEnvironment() {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}
