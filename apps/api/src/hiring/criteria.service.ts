import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CRITERION_MESSAGES,
  criterionDeleteBlockedMessage,
  duplicateNameMessage,
  isCriterionType,
  renameCollisionMessage,
  validateCriterionValues,
  valueInUseMessage,
  type CriterionType,
  type CriterionValueInput,
} from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { LibraryNames, validLibraryName } from './library-names';

export interface CriterionDto {
  name?: unknown;
  type?: unknown;
  /** `["A1","A2"]` on a create; `[{ id, label } | { label }]` on an edit. */
  values?: unknown;
  isArchived?: unknown;
}

export interface PresentedCriterionValue {
  id: string;
  label: string;
  position: number;
  assessmentCount: number;
}

export interface PresentedCriterion {
  id: string;
  name: string;
  type: CriterionType;
  isArchived: boolean;
  assessmentCount: number;
  values: PresentedCriterionValue[];
}

/**
 * The criteria library: the things a candidate is assessed on (hiring 06 §03).
 *
 * It differs from the category library in the two ways that matter. A criterion has a
 * **type**, fixed at creation, because every assessment is stored in the column that type
 * names — and a `scale` owns an ordered list of values whose **positions**, never their
 * labels, are what any comparison reads. And it is **archived, never deleted, once
 * assessed**: deleting one would destroy exactly the judgements the candidate database
 * exists to filter on, and nothing here can bring them back.
 *
 * Both callers — the settings screen and the candidate card's inline creation — arrive
 * through the same endpoints, so there is no relaxed copy of any of this.
 */
@Injectable()
export class CriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The library with its usage counts, per criterion and per scale value.
   *
   * Both counts are part of the list rather than something the screen asks for per row:
   * the first decides between archiving and deleting, and the second decides whether a
   * value's remove control is even offered (06 §UI Notes).
   *
   * Archived criteria are absent by default, which is what removes them from the card's
   * add-autocomplete; `includeArchived` is how the settings screen and the candidate
   * database ask for the rest (06 §03.18).
   */
  async list(organizationId: string, includeArchived: boolean): Promise<PresentedCriterion[]> {
    const criteria = await this.prisma.criterion.findMany({
      where: { organizationId, ...(includeArchived ? {} : { isArchived: false }) },
      include: this.shape,
    });

    return criteria
      .map((criterion) => this.present(criterion))
      // Archived last, then alphabetically regardless of case — Postgres's own collation
      // would put every capitalized name ahead of every lowercase one, which is not how
      // anyone scans a list (06 §UI Notes).
      .sort(
        (a, b) =>
          Number(a.isArchived) - Number(b.isArchived) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
  }

  async create(organizationId: string, dto: CriterionDto): Promise<PresentedCriterion> {
    const name = validLibraryName(dto.name);
    const type = this.validType(dto.type);
    const values = this.validValues(type, dto.values);

    const names = this.names(organizationId);
    await names.refuseDuplicate(name, duplicateNameMessage);

    const criterion = await this.prisma.criterion
      .create({
        data: {
          organizationId,
          name,
          type,
          // Written with the criterion rather than after it: a scale that briefly exists
          // with no values is one the card could offer and nobody could answer.
          values: { create: values.map(({ label, position }) => ({ label, position })) },
        },
        include: this.shape,
      })
      .catch((error) => names.recoverFromRace(error, name, duplicateNameMessage));

    return this.present(criterion);
  }

  /**
   * Rename, archive, restore, and edit a scale — any subset, in one write.
   *
   * The type is not among them and never will be (06 §03.14).
   */
  async update(
    organizationId: string,
    criterionId: string,
    dto: CriterionDto,
  ): Promise<PresentedCriterion> {
    const existing = await this.prisma.criterion.findFirst({
      where: { id: criterionId, organizationId },
      include: this.shape,
    });
    // 404 before validation, so a caller guessing ids learns nothing from the shape of
    // the error it gets back.
    if (!existing) throw new NotFoundException();

    const type = existing.type as CriterionType;

    // Refused before anything else is read: a request that asks for a type change is not
    // a request to be partially honoured (06 §03.14).
    if (dto.type !== undefined && dto.type !== type) {
      throw new UnprocessableEntityException({
        error: 'type_immutable',
        message: CRITERION_MESSAGES.type.immutable,
      });
    }

    const name = dto.name !== undefined ? validLibraryName(dto.name) : null;
    const names = this.names(organizationId);
    if (name !== null) {
      // The collision message differs from a create's: with no merge in this release the
      // only way out is to reassign and delete, and the message says so (06 §01.5).
      await names.refuseDuplicate(name, renameCollisionMessage, criterionId);
    }

    const values = dto.values !== undefined ? this.validValues(type, dto.values) : null;
    const removed = values === null ? [] : this.removedValues(existing.values, values);

    // A value with assessments may not be removed at all (06 §03.16) — the message names
    // which one and how many, because "something is in use" is not actionable.
    const inUse = removed.find((value) => value._count.assessments > 0);
    if (inUse) {
      throw new ConflictException({
        error: 'value_in_use',
        message: valueInUseMessage(inUse.label, inUse._count.assessments),
      });
    }

    const criterion = await this.prisma
      .$transaction(async (tx) => {
        // Deletions first: a value is removed and a later one takes its position in the
        // same write, and doing it the other way round would collide on nothing at all
        // but would leave a moment where the scale had two values at one position.
        if (removed.length > 0) {
          await tx.criterionValue.deleteMany({ where: { id: { in: removed.map((v) => v.id) } } });
        }

        for (const value of values ?? []) {
          if (value.id) {
            await tx.criterionValue.update({
              where: { id: value.id },
              data: { label: value.label, position: value.position },
            });
          } else {
            await tx.criterionValue.create({
              data: { criterionId, label: value.label, position: value.position },
            });
          }
        }

        return tx.criterion.update({
          where: { id: criterionId },
          data: {
            ...(name !== null ? { name } : {}),
            ...(dto.isArchived !== undefined ? { isArchived: Boolean(dto.isArchived) } : {}),
          },
          include: this.shape,
        });
      })
      .catch((error) => {
        // The only unique index this write can trip is the name's: a scale's own
        // uniqueness is enforced in `validateCriterionValues` rather than by an index,
        // for the reason the migration records.
        if (name === null) throw error;
        return names.recoverFromRace(error, name, renameCollisionMessage);
      });

    return this.present(criterion);
  }

  /**
   * Deleting is for a criterion nobody has used (06 §03.17).
   *
   * Once one has been assessed, deleting it would destroy every judgement recorded
   * against it — precisely the data the candidate database filters on, and not
   * recoverable. So the answer names archive rather than merely refusing.
   */
  async remove(organizationId: string, criterionId: string): Promise<{ success: true }> {
    const criterion = await this.prisma.criterion.findFirst({
      where: { id: criterionId, organizationId },
      select: { id: true, _count: { select: { assessments: true } } },
    });
    if (!criterion) throw new NotFoundException();

    const assessmentCount = criterion._count.assessments;
    if (assessmentCount > 0) {
      throw new ConflictException({
        error: 'has_assessments',
        message: criterionDeleteBlockedMessage(assessmentCount),
        assessmentCount,
      });
    }

    // The scale's values go with it through their cascade; with no assessments there is
    // nothing else that references either.
    await this.prisma.criterion.delete({ where: { id: criterionId } });

    return { success: true };
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /** Everything both the list and every write answer with, in one place. */
  private readonly shape = {
    values: {
      orderBy: { position: 'asc' },
      include: { _count: { select: { assessments: true } } },
    },
    _count: { select: { assessments: true } },
  } as const;

  private present(criterion: {
    id: string;
    name: string;
    type: string;
    isArchived: boolean;
    values: Array<{ id: string; label: string; position: number; _count: { assessments: number } }>;
    _count: { assessments: number };
  }): PresentedCriterion {
    return {
      id: criterion.id,
      name: criterion.name,
      type: criterion.type as CriterionType,
      isArchived: criterion.isArchived,
      assessmentCount: criterion._count.assessments,
      values: criterion.values.map((value) => ({
        id: value.id,
        label: value.label,
        position: value.position,
        assessmentCount: value._count.assessments,
      })),
    };
  }

  private names(organizationId: string): LibraryNames {
    return new LibraryNames((name, excludeId) =>
      this.prisma.criterion.findFirst({
        where: {
          organizationId,
          name: { equals: name, mode: 'insensitive' },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true, name: true },
      }),
    );
  }

  private validType(input: unknown): CriterionType {
    if (!isCriterionType(input)) {
      throw new UnprocessableEntityException({
        error: 'validation',
        fields: { type: CRITERION_MESSAGES.type.required },
      });
    }
    return input;
  }

  /**
   * A scale's whole ordered list, numbered from zero.
   *
   * `values` is always the complete list rather than a diff, which is what lets the
   * positions be reassigned contiguously on every write — two values can never share a
   * position, and a comparison that reads positions would have nothing to resolve them by
   * if they could.
   *
   * A create sends bare strings and an edit sends rows; both mean the same thing, so both
   * are accepted rather than making the card and the settings screen send different
   * shapes for one list of labels.
   */
  private validValues(type: CriterionType, input: unknown): Array<{ id?: string; label: string; position: number }> {
    const supplied: CriterionValueInput[] = Array.isArray(input)
      ? input.map((entry) =>
          typeof entry === 'string'
            ? { label: entry }
            : {
                ...(typeof entry?.id === 'string' ? { id: entry.id } : {}),
                label: typeof entry?.label === 'string' ? entry.label : '',
              },
        )
      : [];

    const result = validateCriterionValues(type, input === undefined ? [] : supplied);
    if (!result.valid) {
      throw new UnprocessableEntityException({ error: result.error, message: result.message });
    }
    return result.values;
  }

  /**
   * The values this edit drops — and the check that every id it named was one of this
   * criterion's to begin with.
   *
   * An id from another criterion is refused rather than quietly ignored: saving a scale
   * with one fewer value than was asked for is the worse answer, for the same reason a
   * vacancy is not saved with one fewer category (06 §Validation.7).
   */
  private removedValues(
    existing: Array<{ id: string; label: string; _count: { assessments: number } }>,
    values: Array<{ id?: string; label: string; position: number }>,
  ): Array<{ id: string; label: string; _count: { assessments: number } }> {
    const known = new Set(existing.map((value) => value.id));
    const named = values.map((value) => value.id).filter((id): id is string => id !== undefined);

    if (named.some((id) => !known.has(id))) {
      throw new UnprocessableEntityException({
        error: 'unknown_value',
        message: CRITERION_MESSAGES.values.unknown,
      });
    }

    const kept = new Set(named);
    return existing.filter((value) => !kept.has(value.id));
  }
}
