'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import {
  ENVELOPE_LIMITS,
  ENVELOPE_MESSAGES,
  PROFILE_MESSAGES,
  hasCapability,
} from '@devscribed/validation';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import {
  apiRequest,
  failureMessage,
  templatesUrl,
  type TemplateListResponse,
} from '@/documents/api';
import {
  envelopeUrl,
  envelopesUrl,
  type AutofillGap,
  type CreateEnvelopeResponse,
  type EnvelopeDetail,
} from '@/documents/envelopes';
import { FillForm, type MemberChoice, type TemplateChoice } from '@/documents/FillForm';
import { useToast } from '@/toast';

/**
 * `/api/organizations/{orgId}/members` — the subject picker's source (spec 03 autofill).
 *
 * It used to ask for `?forSubjectPicker=true`, a flag this screen invented because the
 * members list of the day returned actives only. Spec 04 brought a real one with
 * `?showRemoved=true`, which answers the same question for the Members screen, so the
 * flag is gone and this reads the product's list like everything else. Requirement 13
 * wants a former member listed and marked, not filtered out — hence `showRemoved`.
 */
/** One row of that list, as spec 04's `MemberListItem` shapes it. */
interface MemberRow {
  id: string;
  fullName: string;
  status: string;
}

interface MemberListResponse {
  members: MemberRow[];
}

export default function NewDocumentPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return <NewDocumentScreen orgId={orgId} />;
}

function NewDocumentScreen({ orgId }: { orgId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { role } = useSession();

  const [templates, setTemplates] = useState<TemplateChoice[]>([]);
  const [members, setMembers] = useState<MemberChoice[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [detail, setDetail] = useState<EnvelopeDetail | null>(null);
  const [creating, setCreating] = useState(false);
  /**
   * The autofill report from the create response. It is held here rather than merged into
   * `detail` because it describes what happened *at creation* (requirement 8's snapshot),
   * and a later reload of the envelope must not resurrect or invent it.
   */
  const [autofill, setAutofill] = useState<{
    filled: string[];
    gaps: AutofillGap[];
    truncated: string[];
  }>({ filled: [], gaps: [], truncated: [] });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiRequest<TemplateListResponse>(templatesUrl(orgId));
      if (cancelled || !result.ok) return;
      // Only a published template may back an envelope (requirement 1), so an archived
      // or draft one is never offered — an option that always errors is a dead control.
      setTemplates(
        result.data.templates
          .filter((template) => template.status === 'published')
          .map((template) => ({
            id: template.id,
            name: template.name,
            currentVersionNumber: template.currentVersionNumber,
          })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // `showRemoved=true` rather than a picker-specific flag: requirement 13 wants
      // removed members listed and marked, not filtered out, and spec 04's own list
      // already answers exactly that question for the Members screen.
      const result = await apiRequest<MemberListResponse>(
        `/api/organizations/${orgId}/members?showRemoved=true`,
      );
      if (cancelled || !result.ok) return;
      setMembers(
        result.data.members.map((member) => ({
          id: member.id,
          name: member.fullName,
          isRemoved: member.status === 'removed',
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!hasCapability(role, 'ManageEnvelopes')) notFound();

  /**
   * Picking the template is what brings the envelope into existence (flow step 3): the
   * version has to be pinned and autofill has to run before there is anything to fill in.
   */
  async function chooseTemplate(nextTemplateId: string): Promise<void> {
    if (creating || detail) return;
    setTemplateId(nextTemplateId);
    setCreating(true);

    const created = await apiRequest<CreateEnvelopeResponse>(envelopesUrl(orgId), {
      method: 'POST',
      body: JSON.stringify({
        templateId: nextTemplateId,
        subjectMembershipId: subjectId.length > 0 ? subjectId : null,
        title: null,
        expiresInDays: ENVELOPE_LIMITS.expiryDaysDefault,
      }),
    });

    if (!created.ok) {
      setCreating(false);
      setTemplateId('');
      showToast(
        'toast-envelope-error',
        created.failure.error === 'template_not_published'
          ? ENVELOPE_MESSAGES.template.notPublished
          : created.failure.error === 'template_archived'
            ? ENVELOPE_MESSAGES.template.archived
            : created.failure.error === 'subject_not_found'
              ? PROFILE_MESSAGES.subject.missing
              : failureMessage(created.failure),
        'error',
      );
      return;
    }

    // Requirements 10-11. Empty arrays where the API has not grown the field yet, which
    // reads as "nothing to report" — the correct default for an envelope with no subject.
    setAutofill({
      filled: created.data.autofilled ?? [],
      gaps: created.data.autofillGaps ?? [],
      truncated: created.data.autofillTruncated ?? [],
    });

    // The create response carries values and signers but not the field *definitions*
    // (label, type, required, maxLength), which is what the form has to render — so the
    // detail read is not a redundant round trip.
    const loaded = await apiRequest<EnvelopeDetail>(envelopeUrl(orgId, created.data.id));
    setCreating(false);
    if (!loaded.ok) {
      showToast('toast-envelope-error', failureMessage(loaded.failure), 'error');
      return;
    }
    setDetail(loaded.data);
  }

  return (
    <div>
      <PageHeader
        title="New document"
        subtitle="Pick a published template, fill your part, and send it for signature."
      />

      <FillForm
        orgId={orgId}
        detail={detail}
        templates={templates}
        members={members}
        templateId={templateId}
        subjectId={subjectId}
        onTemplateChange={(id) => void chooseTemplate(id)}
        onSubjectChange={setSubjectId}
        creating={creating}
        readOnly={false}
        autofilled={autofill.filled}
        autofillGaps={autofill.gaps}
        autofillTruncated={autofill.truncated}
        onSaved={setDetail}
        onSent={() => {
          // The sent envelope's home is its detail page, and a toast cannot survive the
          // navigation — so the flag travels in the URL and the detail page raises it.
          // That also keeps one owner for "Sent for signature", wherever send was pressed.
          if (detail) router.replace(`/org/${orgId}/documents/${detail.id}?sent=1`);
        }}
      />
    </div>
  );
}
