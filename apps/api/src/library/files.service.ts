import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  type CurrentUser,
  FILE_UPLOAD_HINT,
  FILE_UPLOAD_MAX_BYTES,
  type FileDto,
  formatFileSize,
} from '@iot/shared';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { findWorkspaceRoot } from '../config/load-env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkFile } from './file-signature.js';
import { assignmentScopeWhere, materialScopeWhere } from './library-scope.js';

export interface UploadedFileInput {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface StoredFileContent {
  file: FileDto;
  content: Buffer;
}

/** Каталог хранилища: `FILE_STORAGE_DIR` или `storage/<окружение>` в корне репозитория (NFR-010). */
export function fileStorageDir(): string {
  if (process.env.FILE_STORAGE_DIR) return resolve(process.env.FILE_STORAGE_DIR);
  const root = findWorkspaceRoot(import.meta.dirname) ?? process.cwd();
  return join(root, 'storage', process.env.NODE_ENV ?? 'development');
}

export function toFileDto(file: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}): FileDto {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  };
}

/** Имя файла без пути и управляющих символов (имя показывается в интерфейсе и в Content-Disposition). */
function cleanFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const unsafe = /[\u0000-\u001f\u007f"]/g;
  const base = name.split(/[\\/]/).pop()!.replace(unsafe, '').trim();
  return base.slice(-255) || 'file';
}

/**
 * Загруженные файлы (п. 8.3). Содержимое лежит в локальном хранилище под случайным именем,
 * без расширения и вне каталога статики; выдаётся только через API после проверки прав.
 */
@Injectable()
export class FilesService {
  private readonly dir = fileStorageDir();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: AccessScopeService,
  ) {}

  async upload(file: UploadedFileInput | undefined, actorId: string): Promise<FileDto> {
    if (!file) throw new BadRequestException('Выберите файл для загрузки');
    if (file.size > FILE_UPLOAD_MAX_BYTES) {
      throw new PayloadTooLargeException(
        `Файл больше ${formatFileSize(FILE_UPLOAD_MAX_BYTES)}. Уменьшите размер файла`,
      );
    }
    const originalName = cleanFileName(file.originalname);
    const check = checkFile(originalName, file.buffer);
    if (!check.ok) {
      throw new BadRequestException(
        check.reason === 'empty'
          ? 'Файл пустой'
          : check.reason === 'extension'
            ? `Этот тип файла загружать нельзя. Допустимо: ${FILE_UPLOAD_HINT}`
            : 'Содержимое файла не соответствует его расширению. Сохраните файл в нужном формате и повторите',
      );
    }
    await this.scan(file.buffer);

    const storageKey = randomUUID();
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, storageKey), file.buffer, { flag: 'wx' });
    try {
      const row = await this.prisma.file.create({
        data: {
          storageKey,
          originalName,
          mimeType: check.mimeType,
          sizeBytes: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedById: actorId,
        },
      });
      return toFileDto(row);
    } catch (error) {
      await rm(join(this.dir, storageKey), { force: true });
      throw error;
    }
  }

  /**
   * Антивирусная проверка — вне MVP (п. 8.3, решение ADR-016). Здесь подключается сканер:
   * при обнаружении угрозы метод должен выбросить BadRequestException.
   */
  private async scan(_content: Buffer): Promise<void> {}

  /**
   * Файл для скачивания. Доступен тому, кто его загрузил, и тем, кому видна запись библиотеки
   * с этим файлом (FR-002). Иначе — 404, чтобы не раскрывать существование файла.
   */
  async read(user: CurrentUser, id: string): Promise<StoredFileContent> {
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.file.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [
          { uploadedById: user.id },
          { materials: { some: materialScopeWhere(scope) } },
          { assignmentAttachments: { some: { assignment: assignmentScopeWhere(scope) } } },
        ],
      },
    });
    if (!row) throw new NotFoundException('Файл не найден');
    const content = await readFile(join(this.dir, row.storageKey)).catch(() => {
      throw new NotFoundException('Файл не найден в хранилище. Обратитесь к администратору');
    });
    return { file: toFileDto(row), content };
  }

  /**
   * Новый файл для записи библиотеки: должен быть загружен самим пользователем. Уже прикреплённый
   * к записи файл (при изменении) не проверяется — он остаётся прежним.
   */
  async assertOwnUpload(fileId: string, actorId: string, field: string): Promise<void> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, uploadedById: actorId, deletedAt: null },
      select: { id: true },
    });
    if (!file) {
      throw new BadRequestException({
        message: 'Файл не найден. Загрузите его заново',
        fields: { [field]: 'Файл не найден. Загрузите его заново' },
      });
    }
  }
}
