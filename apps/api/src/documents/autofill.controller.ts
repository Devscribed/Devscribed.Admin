import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AUTOFILL_SOURCES, sourcesForFieldType } from '@devscribed/validation';
import type { AutofillSource, TemplateFieldType } from '@devscribed/validation';
import { CapabilityGuard } from '../auth/capability.guard';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import { RequireCapability } from '../auth/require-capability.decorator';
import { SessionGuard } from '../auth/session.guard';

/**
 * `GET .../autofill-sources` — requirement 3: the template editor's autofill picker is
 * driven by the server, never by a hardcoded client list.
 *
 * It has no service of its own because it has no state and no query: the catalogue is a
 * frozen constant in `@devscribed/validation`, shared verbatim with the web app, and a
 * service layer here would only be a second place for the list to be wrong.
 *
 * Gated on `ViewDocumentTemplates` rather than on anything profile-shaped. The catalogue
 * is a list of *bindable field names* — it says that `member.taxId` is a source a
 * template may use, not what any member's tax id is — so it belongs to whoever may look
 * at a template. Requirement 21 is untouched by it: no value of any kind passes through
 * this route.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard, CapabilityGuard)
export class AutofillController {
  @Get('autofill-sources')
  @RequireCapability('ViewDocumentTemplates')
  list(@Query('fieldType') fieldType?: string) {
    // Requirement 4: the picker offers only type-compatible sources. Filtering here as
    // well as in the client means a picker that forgot to filter still cannot offer a
    // `date` source for a `text` field. An absent or unrecognized `fieldType` returns
    // the whole catalogue — the editor asks that way while a field's type is still
    // being chosen, and it is not an error.
    const requested = (fieldType ?? '').trim() as TemplateFieldType;
    const sources: readonly AutofillSource[] = requested
      ? sourcesForFieldType(requested)
      : AUTOFILL_SOURCES;

    return {
      sources: sources.map((source) => ({
        key: source.key,
        // The wire uses the spec's capitalized group names; the catalogue stores the
        // lowercase discriminator so client code can switch on it safely.
        group: GROUP_LABELS[source.group],
        label: source.label,
        valueType: source.type,
        sensitive: source.sensitive,
      })),
    };
  }
}

const GROUP_LABELS: Record<AutofillSource['group'], string> = {
  member: 'Member',
  org: 'Organization',
  system: 'System',
};
