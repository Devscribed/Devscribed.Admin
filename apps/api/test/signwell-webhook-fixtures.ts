/**
 * Three real SignWell webhook deliveries, captured on 28 Aug 2026 against a test-mode
 * document through a tunnel. They are fixtures so the reconciler is tested against what
 * SignWell actually sends rather than against what its documentation describes.
 *
 * **The `type`, `time` and `hash` of each event are unmodified.** That is the point of
 * `WEBHOOK_ID`: it is the id of the (since deleted) webhook these were delivered to, so a
 * test can recompute HMAC-SHA256 over `${type}@${time}` and check our implementation
 * against a hash SignWell produced rather than one we produced ourselves.
 *
 * Everything identifying is replaced — addresses, names, account and document ids, and
 * every `embedded_signing_url`, which in a live delivery is a working link that signs *as*
 * its recipient and is the first thing spec 04 requirement 35 redacts before storage.
 *
 * Two details in `documentSent` are load-bearing and must not be "corrected" if they look
 * wrong:
 *
 *   - `data.object.status` is "Sending", a transient the API had already left by the time
 *     the delivery arrived;
 *   - every `recipients[].status` is null, while a GET moments later returned
 *     created / sent / waiting correctly.
 *
 * Both exist to prove spec 04 requirement 21. A handler that writes state from the payload
 * records a status that was never true for more than a second, and no signer statuses at
 * all — which is why nothing but the fact of arrival is ever taken from a body.
 *
 * `documentCanceled` is what our own DELETE sends back during a void — requirement 41.
 */

/** The webhook these were delivered to. Deleted; kept so the hashes stay verifiable. */
export const WEBHOOK_ID = '2ecc3f5c-3a2d-4e60-967b-4bf67e059ca0';

/** The document exists but its file has not been parsed yet: no fields, and pages_number is 0. */
export const documentCreated = {
  "event": {
    "hash": "0dd47e4c8507a28d502d6841766235d2a7faa19b82aef1026e0e9a96d570b7cb",
    "time": 1787922477,
    "type": "document_created"
  },
  "data": {
    "object": {
      "id": "00000000-0000-4000-8000-0000000000d0",
      "archived": false,
      "copied_contacts": [],
      "created_at": "2026-08-28T13:07:56Z",
      "custom_requester_email": null,
      "custom_requester_name": null,
      "decline_redirect_url": null,
      "embedded_edit_url": "https://www.signwell.com/app/edit/document/d1e5e579-7dd4-406f-93af-dcf9079d4860/",
      "embedded_preview_url": null,
      "error_message": null,
      "fields": [],
      "labels": [],
      "language": "en",
      "metadata": {
        "envelope_id": "envelope-under-test",
        "organization_id": "organization-under-test"
      },
      "name": "Spec 04 webhook verification",
      "recipients": [
        {
          "id": "1",
          "attachment_requests": [],
          "email": "pat.owner@example.com",
          "message": null,
          "name": "Pat Owner",
          "passcode": null,
          "send_email_delay": 0,
          "signing_order": 1,
          "status": "created",
          "subject": null,
          "embedded_signing_url": "https://www.signwell.com/docs/REDACTED/",
          "send_email": false,
          "delivery_method": "email"
        },
        {
          "id": "2",
          "attachment_requests": [],
          "email": "spec04-signer@example.com",
          "message": null,
          "name": "Alex Kaminski",
          "passcode": null,
          "send_email_delay": 0,
          "signing_order": 2,
          "status": "created",
          "subject": null,
          "embedded_signing_url": "https://www.signwell.com/docs/REDACTED/",
          "send_email": false,
          "delivery_method": "email"
        }
      ],
      "subject": "Consulting Agreement",
      "test_mode": true,
      "updated_at": "2026-08-28T13:07:56Z",
      "decline_message": null,
      "cfr_part11": false,
      "cfr_part11_signing_mode": null,
      "allow_decline": true,
      "allow_reassign": false,
      "apply_signing_order": true,
      "embedded_signing": true,
      "embedded_signing_notifications": false,
      "expires_in": 7,
      "message": "Sent by Teammerly while verifying the SignWell integration.",
      "reminders": false,
      "requester_email_address": "pat.owner@example.com",
      "redirect_url": "",
      "status": "Created",
      "files": [
        {
          "name": "agreement.pdf",
          "pages_number": 0
        }
      ],
      "conditional_rules": []
    },
    "account_id": "00000000-0000-4000-8000-00000000acct",
    "workspace_id": "00000000-0000-4000-8000-00000000acct"
  }
} as const;

/** The text tags have materialized into three fields. See the note above about the status and the null recipient statuses. */
export const documentSent = {
  "event": {
    "hash": "d6590ac1be7589ae0cf735a305df70388cda16c1ca2616983e83754bde996bb7",
    "time": 1787922482,
    "type": "document_sent"
  },
  "data": {
    "object": {
      "id": "00000000-0000-4000-8000-0000000000d0",
      "archived": false,
      "copied_contacts": [],
      "created_at": "2026-08-28T13:07:56Z",
      "custom_requester_email": null,
      "custom_requester_name": null,
      "decline_redirect_url": null,
      "embedded_edit_url": null,
      "embedded_preview_url": null,
      "error_message": null,
      "fields": [
        [
          {
            "api_id": "TextField_1",
            "height": "21.04395561047052",
            "required": false,
            "type": "text",
            "value": "",
            "width": "72.41548212430304",
            "x": 169.410759658718,
            "y": 183.9040048513293,
            "fixed_width": null,
            "label": "",
            "page": 1,
            "recipient_id": "2",
            "validation": "no_text_validation"
          },
          {
            "api_id": "Signature_1",
            "height": "24.55128154554894",
            "required": true,
            "type": "signature",
            "value": null,
            "width": "92.45343936718312",
            "x": 155.0705911949751,
            "y": 263.1300885096338,
            "page": 1,
            "recipient_id": "1"
          },
          {
            "api_id": "Signature_2",
            "height": "24.55128154554894",
            "required": true,
            "type": "signature",
            "value": null,
            "width": "94.25767562013165",
            "x": 138.6215801616006,
            "y": 300.1208369683525,
            "page": 1,
            "recipient_id": "2"
          }
        ]
      ],
      "labels": [],
      "language": "en",
      "metadata": {
        "envelope_id": "envelope-under-test",
        "organization_id": "organization-under-test"
      },
      "name": "Spec 04 webhook verification",
      "recipients": [
        {
          "id": "1",
          "attachment_requests": [],
          "email": "pat.owner@example.com",
          "message": null,
          "name": "Pat Owner",
          "passcode": null,
          "send_email_delay": 0,
          "signing_order": 1,
          "status": null,
          "subject": null,
          "embedded_signing_url": "https://www.signwell.com/docs/REDACTED/",
          "send_email": false,
          "delivery_method": "email"
        },
        {
          "id": "2",
          "attachment_requests": [],
          "email": "spec04-signer@example.com",
          "message": null,
          "name": "Alex Kaminski",
          "passcode": null,
          "send_email_delay": 0,
          "signing_order": 2,
          "status": null,
          "subject": null,
          "embedded_signing_url": "https://www.signwell.com/docs/REDACTED/",
          "send_email": false,
          "delivery_method": "email"
        }
      ],
      "subject": "Consulting Agreement",
      "test_mode": true,
      "updated_at": "2026-08-28T13:07:58Z",
      "decline_message": null,
      "cfr_part11": false,
      "cfr_part11_signing_mode": null,
      "allow_decline": true,
      "allow_reassign": false,
      "apply_signing_order": true,
      "embedded_signing": true,
      "embedded_signing_notifications": false,
      "expires_in": 7,
      "message": "Sent by Teammerly while verifying the SignWell integration.",
      "reminders": false,
      "requester_email_address": "pat.owner@example.com",
      "redirect_url": "",
      "status": "Sending",
      "files": [
        {
          "name": "agreement.pdf",
          "pages_number": 1
        }
      ],
      "conditional_rules": []
    },
    "account_id": "00000000-0000-4000-8000-00000000acct",
    "workspace_id": "00000000-0000-4000-8000-00000000acct"
  }
} as const;

/** Fired by our own DELETE while voiding an envelope. */
export const documentCanceled = {
  "event": {
    "hash": "bb0f0a3bf3ff70fa6be201fc362e5146b140e00a326f60b586488dbad5a05375",
    "time": 1787922561,
    "type": "document_canceled"
  },
  "data": {
    "object": {
      "id": "00000000-0000-4000-8000-0000000000d0",
      "archived": true,
      "copied_contacts": [],
      "created_at": "2026-08-28T13:07:56Z",
      "custom_requester_email": null,
      "custom_requester_name": null,
      "decline_redirect_url": null,
      "embedded_edit_url": null,
      "embedded_preview_url": null,
      "error_message": null,
      "fields": [
        [
          {
            "api_id": "TextField_1",
            "height": "21.04395561047052",
            "required": false,
            "type": "text",
            "value": "",
            "width": "72.41548212430304",
            "x": 169.410759658718,
            "y": 183.9040048513293,
            "fixed_width": null,
            "label": "",
            "page": 1,
            "recipient_id": "2",
            "validation": "no_text_validation"
          },
          {
            "api_id": "Signature_1",
            "height": "24.55128154554894",
            "required": true,
            "type": "signature",
            "value": null,
            "width": "92.45343936718312",
            "x": 155.0705911949751,
            "y": 263.1300885096338,
            "page": 1,
            "recipient_id": "1"
          },
          {
            "api_id": "Signature_2",
            "height": "24.55128154554894",
            "required": true,
            "type": "signature",
            "value": null,
            "width": "94.25767562013165",
            "x": 138.6215801616006,
            "y": 300.1208369683525,
            "page": 1,
            "recipient_id": "2"
          }
        ]
      ],
      "labels": [],
      "language": "en",
      "metadata": {
        "envelope_id": "envelope-under-test",
        "organization_id": "organization-under-test"
      },
      "name": "Spec 04 webhook verification",
      "recipients": [
        {
          "id": "1",
          "attachment_requests": [],
          "email": "pat.owner@example.com",
          "message": null,
          "name": "Pat Owner",
          "passcode": null,
          "send_email_delay": 0,
          "signing_order": 1,
          "status": "sent",
          "subject": null,
          "embedded_signing_url": "https://www.signwell.com/docs/REDACTED/",
          "send_email": false,
          "delivery_method": "email"
        },
        {
          "id": "2",
          "attachment_requests": [],
          "email": "spec04-signer@example.com",
          "message": null,
          "name": "Alex Kaminski",
          "passcode": null,
          "send_email_delay": 0,
          "signing_order": 2,
          "status": null,
          "subject": null,
          "embedded_signing_url": "https://www.signwell.com/docs/REDACTED/",
          "send_email": false,
          "delivery_method": "email"
        }
      ],
      "subject": "Consulting Agreement",
      "test_mode": true,
      "updated_at": "2026-08-28T13:09:21Z",
      "decline_message": null,
      "cfr_part11": false,
      "cfr_part11_signing_mode": null,
      "allow_decline": true,
      "allow_reassign": false,
      "apply_signing_order": true,
      "embedded_signing": true,
      "embedded_signing_notifications": false,
      "expires_in": 7,
      "message": "Sent by Teammerly while verifying the SignWell integration.",
      "reminders": false,
      "requester_email_address": "pat.owner@example.com",
      "redirect_url": "",
      "status": "Canceled",
      "files": [
        {
          "name": "agreement.pdf",
          "pages_number": 1
        }
      ],
      "conditional_rules": []
    },
    "account_id": "00000000-0000-4000-8000-00000000acct",
    "workspace_id": "00000000-0000-4000-8000-00000000acct"
  }
} as const;
