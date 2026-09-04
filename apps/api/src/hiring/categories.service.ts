import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  LIBRARY_MESSAGES,
  duplicateNameMessage,
  findLibraryDuplicate,
  newLibraryNames,
  renameCollisionMessage,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { LibraryNames, validLibraryName } from './library-names';

export interface CategoryDto {
  name?: string;
}

/** The two ways a caller names categories on a vacancy write (01 §API). */
export interface CategorySelection {
  categoryIds?: unknown;
  newCategoryNames?: unknown;
}

export interface PresentedCategory {
  id: string;
  name: string;
  vacancyCount: number;
  /**
   * The titles behind the count, alphabetical. The settings screen prints the first two
   * and folds the rest into a `+N` — a truncated title names nothing, so the row shows
   * whole ones and the count stays in the accessible name (06 §UI Notes).
   */
  vacancies: string[];
}

/**
 * The category library: the org-wide labels a vacancy carries (hiring 06 §02).
 *
 * Two callers, one set of rules. The settings screen maintains the library directly,
 * and the vacancy dialog creates into it inline — `resolveForVacancy` is that second
 * path, and it goes through the same uniqueness check rather than a relaxed copy of it.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The whole library with its usage counts. The count is not decoration: it is what
   * makes the delete decision answerable, so it is part of the list rather than
   * something the screen has to ask for per row (06 §UI Notes).
   */
  async list(organizationId: string): Promise<PresentedCategory[]> {
    const categories = await this.prisma.category.findMany({
      where: { organizationId },
      include: { vacancies: { select: { vacancy: { select: { title: true } } } } },
    });

    // Sorted here rather than in the query: Postgres orders by the collation's rules,
    // which puts every capitalized name before every lowercase one — so `asp.net` would
    // sort below `Senior` in a list somebody is scanning alphabetically for a name.
    return categories
      .map((category) => this.present(category))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async create(organizationId: string, dto: CategoryDto): Promise<PresentedCategory> {
    const name = validLibraryName(dto.name);
    await this.scoped(organizationId).refuseDuplicate(name, duplicateNameMessage);

    const category = await this.insert(organizationId, name).catch((error) =>
      this.scoped(organizationId).recoverFromRace(error, name, duplicateNameMessage),
    );

    return { id: category.id, name: category.name, vacancyCount: 0, vacancies: [] };
  }

  /**
   * Renaming propagates everywhere by doing nothing at all to the assignments: they
   * reference the row, never the string (06 §01.4). This method writes one column.
   */
  async update(
    organizationId: string,
    categoryId: string,
    dto: CategoryDto,
  ): Promise<PresentedCategory> {
    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, organizationId },
      include: { vacancies: { select: { vacancy: { select: { title: true } } } } },
    });
    // 404 before validation, so a caller guessing ids learns nothing from the shape of
    // the error it gets back.
    if (!existing) throw new NotFoundException();

    const name = validLibraryName(dto.name);
    // The collision message differs from a create's: with no merge in this release, the
    // only way out is to reassign and delete, and the message says so (06 §01.5).
    const names = this.scoped(organizationId);
    await names.refuseDuplicate(name, renameCollisionMessage, categoryId);

    const category = await this.prisma.category
      .update({ where: { id: categoryId }, data: { name } })
      .catch((error) => names.recoverFromRace(error, name, renameCollisionMessage));

    return this.present({ id: category.id, name: category.name, vacancies: existing.vacancies });
  }

  /**
   * Deleting is allowed even in use, unlike a criterion: a category is a label, so
   * removing it loses a classification rather than a judgement (06 §02.11). It
   * unassigns from every vacancy and deletes nothing else — no vacancy, no application,
   * no note.
   */
  async remove(
    organizationId: string,
    categoryId: string,
  ): Promise<{ success: true; unassignedFrom: number }> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, organizationId },
      select: { id: true, _count: { select: { vacancies: true } } },
    });
    if (!category) throw new NotFoundException();

    // The assignment rows go with it through the join table's cascade; nothing else
    // references a category, which is what makes "deletes nothing else" a fact about
    // the schema rather than a promise about this method.
    await this.prisma.category.delete({ where: { id: categoryId } });

    return { success: true, unassignedFrom: category._count.vacancies };
  }

  /**
   * The ids a vacancy write should end up assigned to, creating whatever is genuinely
   * new along the way (01 §Validation.5).
   *
   * Returns `null` when the caller named neither key — absent means "leave the
   * assignments alone", which is not the same as an empty array clearing them.
   *
   * A `newCategoryNames` entry that already exists resolves to the existing category
   * rather than erroring, because the member typing `react` into the vacancy dialog is
   * asking for `React` and an error would be a dead end they cannot act on.
   */
  async resolveForVacancy(
    organizationId: string,
    selection: CategorySelection,
  ): Promise<string[] | null> {
    const ids = this.stringArray(selection.categoryIds);
    const names = this.stringArray(selection.newCategoryNames);
    if (ids === null && names === null) return null;

    const requestedIds = [...new Set(ids ?? [])];
    const library = await this.prisma.category.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    });

    // An id from another organization is refused, never quietly dropped: silently
    // saving a vacancy with one fewer category than was asked for is a worse answer
    // than saying no (06 §Validation.7).
    const known = new Set(library.map((category) => category.id));
    if (requestedIds.some((id) => !known.has(id))) {
      throw new UnprocessableEntityException({
        error: 'validation',
        fields: { categoryIds: LIBRARY_MESSAGES.category.unknown },
      });
    }

    // Validated before anything is written, so a blank name in the batch fails without
    // having created the two that preceded it.
    const requestedNames = (names ?? []).map((name) => validLibraryName(name));

    const resolved = [...requestedIds];

    for (const name of requestedNames) {
      const existing = findLibraryDuplicate(name, library);
      if (existing && !resolved.includes(existing.id)) resolved.push(existing.id);
    }

    // What is left after both the library and the rest of this batch have had their
    // say — two spellings of one new name would otherwise race each other into the
    // unique index inside a single submit.
    for (const name of newLibraryNames(requestedNames, library)) {
      const created = await this.insert(organizationId, name).catch((error) =>
        this.scoped(organizationId).recoverFromRace(error, name, duplicateNameMessage),
      );
      resolved.push(created.id);
    }

    return resolved;
  }

  /** Replaces a vacancy's assignments with exactly `categoryIds`, inside the caller's transaction. */
  async assign(
    tx: Prisma.TransactionClient,
    vacancyId: string,
    categoryIds: string[],
  ): Promise<void> {
    await tx.vacancyCategory.deleteMany({
      where: { vacancyId, ...(categoryIds.length ? { categoryId: { notIn: categoryIds } } : {}) },
    });
    await tx.vacancyCategory.createMany({
      data: categoryIds.map((categoryId) => ({ vacancyId, categoryId })),
      // The rows already there are the ones being kept; re-inserting them is the only
      // thing this could collide with.
      skipDuplicates: true,
    });
  }

  /** One shape for every endpoint, with the titles in the order the screen prints them. */
  private present(category: {
    id: string;
    name: string;
    vacancies: Array<{ vacancy: { title: string } }>;
  }): PresentedCategory {
    const titles = category.vacancies
      .map((assignment) => assignment.vacancy.title)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return { id: category.id, name: category.name, vacancyCount: titles.length, vacancies: titles };
  }

  /**
   * The shared name rules, bound to one organization's shelf of the library.
   *
   * `mode: 'insensitive'` is the query form of the same fold the unique index applies,
   * so what this finds is what that index would have refused.
   */
  private scoped(organizationId: string): LibraryNames {
    return new LibraryNames((name, excludeId) =>
      this.prisma.category.findFirst({
        where: {
          organizationId,
          name: { equals: name, mode: 'insensitive' },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true, name: true },
      }),
    );
  }

  private insert(organizationId: string, name: string) {
    return this.prisma.category.create({
      data: { organizationId, name },
      select: { id: true, name: true },
    });
  }

  /** A JSON body can carry anything; only an array of strings is a selection. */
  private stringArray(input: unknown): string[] | null {
    if (input === undefined || input === null) return null;
    if (!Array.isArray(input)) return null;
    return input.filter((entry): entry is string => typeof entry === 'string');
  }
}
