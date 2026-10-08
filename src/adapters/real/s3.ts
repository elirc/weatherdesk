/**
 * S3-compatible storage driver (real) — AWS S3, Cloudflare R2, MinIO.
 *
 * Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
 * Uses @aws-sdk/client-s3 (the only SDK permitted). With S3_ENDPOINT set
 * (R2/MinIO) path-style addressing is used.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import type { StorageAdapter } from "../types";
import { tracked } from "./http";

const SOURCE = "s3";
let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
      ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } }
        : {}),
    });
  }
  return client;
}

function isNotFound(e: unknown): boolean {
  if (e instanceof NoSuchKey) return true;
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NoSuchKey" || err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404;
}

export const s3StorageAdapter: StorageAdapter = {
  name: SOURCE,

  async put(key, content, contentType) {
    await tracked(SOURCE, () =>
      s3().send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: content, ContentType: contentType })),
    );
    return { key };
  },

  async get(key) {
    try {
      const res = await tracked(SOURCE, async () => {
        try {
          return await s3().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
        } catch (e) {
          // a missing object is not a provider failure
          if (isNotFound(e)) return null;
          throw e;
        }
      });
      if (!res || !res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return { content: Buffer.from(bytes), contentType: res.ContentType ?? "application/octet-stream" };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  },

  async delete(key) {
    await tracked(SOURCE, () => s3().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })));
  },
};
