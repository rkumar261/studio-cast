import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

export type TusStorageContract = {
  mediaRoot: string;
  tusUploadDir: string;
};

export type TusStorageValidationFailureCode =
  | 'env_missing'
  | 'path_missing'
  | 'not_directory'
  | 'permission_denied';

export type TusStorageValidationResult =
  | { ok: true; contract: TusStorageContract }
  | {
      ok: false;
      code: TusStorageValidationFailureCode;
      message: string;
      details?: Record<string, unknown>;
    };

async function checkDirectory(pathValue: string, label: 'mediaRoot' | 'tusUploadDir') {
  try {
    const stat = await fs.stat(pathValue);
    if (!stat.isDirectory()) {
      return {
        ok: false as const,
        code: 'not_directory' as const,
        message: `${label} is not a directory`,
        details: { label, path: pathValue },
      };
    }
  } catch {
    return {
      ok: false as const,
      code: 'path_missing' as const,
      message: `${label} does not exist`,
      details: { label, path: pathValue },
    };
  }

  try {
    await fs.access(pathValue, fsConstants.R_OK | fsConstants.W_OK);
  } catch {
    return {
      ok: false as const,
      code: 'permission_denied' as const,
      message: `${label} is not readable and writable`,
      details: { label, path: pathValue, required: 'rw' },
    };
  }

  return { ok: true as const };
}

export async function validateTusStorageContractFromEnv(): Promise<TusStorageValidationResult> {
  const mediaRoot = process.env.MEDIA_ROOT?.trim();
  const tusUploadDir = process.env.TUSD_UPLOAD_DIR?.trim();
  const missing: string[] = [];
  if (!mediaRoot) missing.push('MEDIA_ROOT');
  if (!tusUploadDir) missing.push('TUSD_UPLOAD_DIR');
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'env_missing',
      message: 'TUS storage contract env is missing',
      details: { missing },
    };
  }

  const mediaRootPath = mediaRoot as string;
  const tusUploadDirPath = tusUploadDir as string;

  const mediaCheck = await checkDirectory(mediaRootPath, 'mediaRoot');
  if (!mediaCheck.ok) {
    return { ok: false, code: mediaCheck.code, message: mediaCheck.message, details: mediaCheck.details };
  }

  const tusCheck = await checkDirectory(tusUploadDirPath, 'tusUploadDir');
  if (!tusCheck.ok) {
    return { ok: false, code: tusCheck.code, message: tusCheck.message, details: tusCheck.details };
  }

  return {
    ok: true,
    contract: {
      mediaRoot: mediaRootPath,
      tusUploadDir: tusUploadDirPath,
    },
  };
}
