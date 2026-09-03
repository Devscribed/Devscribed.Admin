import { Controller, Get, Header, NotFoundException, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FileStorage } from './file-storage';
import { LocalFileStorage } from './local-file-storage';

/**
 * Serves the URLs `LocalFileStorage.presignedUrl` hands out.
 *
 * Fenced exactly the way `/api/test/mail` is: it answers only when the local driver is
 * actually the one in use, which by construction is never production — there the URL
 * points at S3 and this route does not participate at all. The signature and expiry are
 * still verified, so the local path exercises the same failure mode a stale presigned S3
 * URL has.
 */
@Controller('api/local-files')
export class LocalFilesController {
  constructor(private readonly storage: FileStorage) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async download(
    @Res() response: Response,
    @Query('key') key?: string,
    @Query('expires') expires?: string,
    @Query('signature') signature?: string,
  ): Promise<void> {
    const storage = this.storage;
    if (!(storage instanceof LocalFileStorage)) throw new NotFoundException();
    if (!key || !expires || !signature) throw new NotFoundException();
    if (!storage.verify(key, Number(expires), signature)) throw new NotFoundException();
    if (!(await storage.exists(key))) throw new NotFoundException();

    const bytes = await storage.get(key);
    response.setHeader('Content-Type', await storage.contentTypeOf(key));
    response.setHeader('Content-Disposition', 'attachment');
    response.send(bytes);
  }
}
