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
import { ToastProvider, useToast } from '@/documents/toast';

/**
 * `/api/organizations/{orgId}/members` — the subject picker's source (spec 03 autofill).
 *
 * `?forSubjectPicker=true` is the spec's documented flag: it returns active members plus
 * removed ones flagged `isRemoved`, so the picker can show a former member without
 * offering them by default (requirement 13). An API that does not know the flag yet
 * simply returns the plain list, and the picker degrades to actives only.
 */
interface MemberRow {
  id: string;
  name: string;
  status: string;
  isRemoved?: boolean;
}

export default function NewDocumentPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return (
    <ToastProvider>
      <NewDocumentScreen orgId={orgId} />
    </ToastProvider>
  );
}

function NewDocumentScreen({ orgId }: { orgId: string }) {
  const router = useRouter();
  const toast = useToast();
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
      const result = await apiRequest<MemberRow[]>(
        `/api/organizations/${orgId}/members?forSubjectPicker=true`,
      );
      if (cancelled || !result.ok) return;
      setMembers(
        result.data.map((member) => ({
          id: member.id,
          name: member.name,
          // Either signal is enough: the documented flag, or the status the list has
          // always carried. Requirement 13 wants them listed and marked, not filtered out.
          isRemoved: member.isRemoved === true || member.status === 'removed',
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
      toast.show({
        testId: 'toast-envelope-error',
        message:
          created.failure.error === 'template_not_published'
            ? ENVELOPE_MESSAGES.template.notPublished
            : created.failure.error === 'template_archived'
              ? ENVELOPE_MESSAGES.template.archived
              : created.failure.error === 'subject_not_found'
                ? PROFILE_MESSAGES.subject.missing
                : failureMessage(created.failure),
        tone: 'error',
      });
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
      toast.show({
        testId: 'toast-envelope-error',
        message: failureMessage(loaded.failure),
        tone: 'error',
      });
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
