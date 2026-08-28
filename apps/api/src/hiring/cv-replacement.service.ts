import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { HIRING_MESSAGES, cvStorageKey, validateCv } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { AvailabilityService } from './availability.service';
import type { UploadedCv } from './booking.service';
import { CalendarProvider } from './calendar/calendar-provider';
import { Storage } from './storage/storage';

/** The facts a replacement works from — the row, and where its event actually is. */
export interface ReplaceableCv {
  id: string;
  graphEventId: string | null;
  interviewer: { email: string };
}

/** What was stored, so the caller can answer with a record that names it. */
export interface StoredCv {
  id: string;
  key: string;
  fileName: string;
}

/**
 * Replacing a candidate's CV (spec 07 §07).
 *
 * Three rules shape everything here, and each of them is a decision rather than an
 * implementation detail.
 *
 * **Nothing is deleted.** Every version submitted is kept: the hiring record is
 * permanent, and what the candidate submitted at booking is evidence the interviewer may
 * already have read (07 §07.33). A replacement therefore adds an `ApplicationCv` row and
 * a file, and supersedes only the denormalized `cv*` columns that name the **current**
 * one — which is what leaves 00 §03.16's authenticated endpoint and the candidate card
 * untouched. Storage per booking is unbounded as a consequence, recorded rather than
 * limited (07 §15.70).
 *
 * **Only the candidate can reach this.** There is no team-side route and no team-side
 * affordance, from any surface (07 §07.37). "The candidate corrected their own CV" and
 * "somebody in the organization swapped it" are very different facts about a hiring
 * record, and only the first is available anywhere in the product.
 *
 * **Storage, then the calendar, then the row** — the order `InterviewSchedulingService`
 * already uses, for the same reason. Everything before the transaction is retryable and
 * leaves nothing behind; a failure after the calendar has taken the new attachment fails
 * the request and logs the divergence, and a retry re-issues the same swap — the
 * interviewer holds one CV either way — before completing the write.
 */
@Injectable()
export class CvReplacementService {
  private readonly logger = new Logger(CvReplacementService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Only to resolve the mailbox the event is in; nothing here reads free/busy.
    private readonly availability: AvailabilityService,
    private readonly calendar: CalendarProvider,
    private readonly storage: Storage,
  ) {}

  async replace(application: ReplaceableCv, cv: UploadedCv | undefined): Promise<StoredCv> {
    // 02's CV rules, unchanged and re-run on the server: the extension list, the empty
    // file and the 10 MB ceiling, in that order, so a 20 MB `.pages` file is told the
    // truth about why it cannot be accepted (07 validation rule 5).
    const validation = validateCv(
      cv ? { fileName: cv.originalname, sizeBytes: cv.size } : null,
    );
    if (!validation.valid) {
      throw new UnprocessableEntityException({
        error: 'validation',
        fields: { cv: validation.error },
      });
    }

    const file = cv!;
    // The CV's own id, which is the whole reason a second version can exist: the old
    // `{applicationId}{extension}` shape is one slot per application (00 §03.17).
    const cvId = randomUUID();
    const key = cvStorageKey(cvId, file.originalname);

    try {
      await this.storage.put(key, file.buffer, file.mimetype);
    } catch (error) {
      // Nothing points at it and nothing else has moved, so the failure is clean.
      this.logger.error(`CV storage failed for application ${application.id}: ${String(error)}`);
      throw this.failed();
    }

    if (application.graphEventId) {
      try {
        const mailbox = await this.availability.mailbox(application.interviewer.email);
        await this.calendar.replaceAttachment(mailbox, application.graphEventId, {
          fileName: file.originalname,
          contentType: file.mimetype,
          bytes: file.buffer,
        });
      } catch (error) {
        // Still nothing points at the stored file, so this one is swept up rather than
        // left as an orphan — the same compensation a half-finished booking performs.
        // After this point there is none, because the interviewer has the new document.
        await this.storage
          .delete(key)
          .catch((cleanup) => this.logger.error(`Could not delete ${key}: ${String(cleanup)}`));
        this.logger.error(
          `CV attachment failed for application ${application.id}: ${String(error)}`,
        );
        throw this.failed();
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.applicationCv.create({
          data: {
            id: cvId,
            applicationId: application.id,
            key,
            fileName: file.originalname,
            contentType: file.mimetype,
            sizeBytes: file.size,
          },
        });
        await tx.application.update({
          where: { id: application.id },
          // The **current** version, denormalized. Every earlier one keeps its row and
          // its file; only these four columns move (07 §07.34).
          data: {
            cvKey: key,
            cvFileName: file.originalname,
            cvContentType: file.mimetype,
            cvSizeBytes: file.size,
          },
        });
      });
    } catch (error) {
      // The interviewer already holds the new document, and there is no compensating
      // step that could un-hold it. The request fails, the divergence is logged, and a
      // retry attaches the same file again — which changes nothing a second time —
      // before completing the write.
      this.logger.error(
        `CV attached but the database did not record it, for application ${application.id}: ${String(error)}`,
      );
      throw this.failed();
    }

    return { id: cvId, key, fileName: file.originalname };
  }

  private failed(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      error: 'cv_replace_failed',
      message: HIRING_MESSAGES.manage.cvReplaceFailed,
    });
  }
}
