import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
  type PutObjectCommandInput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface FilesOptions
  extends Omit<S3ClientConfig, "endpoint" | "credentials" | "region"> {
  /** Explicit environment source for tests and application adapters. */
  environment?: Record<string, string | undefined>;
  /** Override an injected value when connecting to an external RustFS instance. */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  bucket?: string;
}

export interface RustFSClientConfiguration {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

/**
 * File operations backed by the S3-compatible API exposed by RustFSService.
 */
export class Files {
  readonly name: string;
  readonly bucket: string;
  readonly client: S3Client;
  private bucketReady?: Promise<void>;

  constructor(name: string, options: FilesOptions = {}) {
    const {
      environment,
      endpoint,
      accessKeyId,
      secretAccessKey,
      region,
      bucket,
      ...clientOptions
    } = options;
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

  async getFile(path: string): Promise<GetObjectCommandOutput> {
    await this.ensureBucket();
    return this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    }));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const response = await this.getFile(path);
    if (response.Body == null) {
      throw new Error(`RustFS returned an empty body for "${path}"`);
    }
    return response.Body.transformToByteArray();
  }

  async getFileUrl(path: string, expiresIn?: number) {
    await this.ensureBucket();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: path }),
      expiresIn == null ? undefined : { expiresIn }
    );
  }

  async getFileUploadUrl(path: string, expiresIn?: number) {
    await this.ensureBucket();
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: path }),
      expiresIn == null ? undefined : { expiresIn }
    );
  }

  async writeFile(
    path: string,
    file: PutObjectCommandInput["Body"],
    options: Omit<PutObjectCommandInput, "Bucket" | "Key" | "Body"> = {}
  ) {
    await this.ensureBucket();
    return this.client.send(new PutObjectCommand({
      ...options,
      Bucket: this.bucket,
      Key: path,
      Body: file,
    }));
  }

  async deleteFile(path: string) {
    await this.ensureBucket();
    return this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: path,
    }));
  }

  async listFiles(
    path = ""
  ): Promise<NonNullable<ListObjectsV2CommandOutput["Contents"]>> {
    await this.ensureBucket();
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: path,
    }));
    return response.Contents ?? [];
  }

  private ensureBucket() {
    this.bucketReady ??= ensureBucketExists(this.client, this.bucket).catch(
      (error) => {
        this.bucketReady = undefined;
        throw error;
      }
    );
    return this.bucketReady;
  }
}

export function resolveRustFSConfiguration(
  serviceName: string,
  environment?: Record<string, string | undefined>,
  overrides: Partial<RustFSClientConfiguration> = {}
): RustFSClientConfiguration {
  const prefix = rustFSServiceEnvironmentPrefix(serviceName);
  const source = {
    ...getProcessEnvironment(),
    ...getRuntimeEnvironment(),
    ...environment,
  };

  return {
    endpoint: requireValue(
      serviceName,
      `${prefix}_RUSTFS_ENDPOINT`,
      overrides.endpoint ?? source[`${prefix}_RUSTFS_ENDPOINT`]
    ),
    accessKeyId: requireValue(
      serviceName,
      `${prefix}_RUSTFS_ACCESS_KEY_ID`,
      overrides.accessKeyId ?? source[`${prefix}_RUSTFS_ACCESS_KEY_ID`]
    ),
    secretAccessKey: requireValue(
      serviceName,
      `${prefix}_RUSTFS_SECRET_ACCESS_KEY`,
      overrides.secretAccessKey ??
        source[`${prefix}_RUSTFS_SECRET_ACCESS_KEY`]
    ),
    region:
      overrides.region ??
      source[`${prefix}_RUSTFS_REGION`] ??
      "us-east-1",
    bucket: requireValue(
      serviceName,
      `${prefix}_RUSTFS_BUCKET`,
      overrides.bucket ?? source[`${prefix}_RUSTFS_BUCKET`]
    ),
  };
}

export function rustFSServiceEnvironmentPrefix(serviceName: string) {
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

function requireValue(
  serviceName: string,
  variableName: string,
  value: string | undefined
) {
  if (value == null || value.trim().length === 0) {
    throw new Error(
      `RustFS service "${serviceName}" is not configured: ` +
      `${variableName} must be present in the SAWS environment`
    );
  }
  return value;
}

function getRuntimeEnvironment() {
  return (globalThis as typeof globalThis & {
    ENV?: Record<string, string | undefined>;
  }).ENV;
}

function getProcessEnvironment() {
  return (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
}
