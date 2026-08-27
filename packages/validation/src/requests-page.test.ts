import { describe, expect, it } from 'vitest';
import {
  can,
  parseRequestStatusFilter,
  parseRequestTypeFilter,
  REQUEST_STATUS_FILTERS,
  REQUESTS_PAGE_MESSAGES,
} from './index';

// Spec 10 capability — view the org-wide Requests page (admin/manager only)
describe('spec 10 view-requests capability', () => {
  it('admin and manager can view requests', () => {
    expect(can('admin', 'view-requests')).toBe(true);
    expect(can('manager', 'view-requests')).toBe(true);
  });

  it('user and viewer cannot view requests', () => {
    expect(can('user', 'view-requests')).toBe(false);
    expect(can('viewer', 'view-requests')).toBe(false);
  });
});

// Status filter parsing (GET .../requests?status=...) — default 'pending'
describe('parseRequestStatusFilter', () => {
  it('exposes the five valid filters', () => {
    expect(REQUEST_STATUS_FILTERS).toEqual([
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'all',
    ]);
  });

  it('returns each valid filter unchanged', () => {
    for (const filter of REQUEST_STATUS_FILTERS) {
      expect(parseRequestStatusFilter(filter)).toBe(filter);
    }
  });

  it('defaults to "pending" for undefined', () => {
    expect(parseRequestStatusFilter(undefined)).toBe('pending');
  });

  it('defaults to "pending" for an empty string', () => {
    expect(parseRequestStatusFilter('')).toBe('pending');
  });

  it('defaults to "pending" for an unknown value', () => {
    expect(parseRequestStatusFilter('bogus')).toBe('pending');
  });

  it('is case-sensitive — "PENDING" is not a valid filter', () => {
    expect(parseRequestStatusFilter('PENDING')).toBe('pending');
  });

  it('defaults to "pending" for non-string values', () => {
    expect(parseRequestStatusFilter(null)).toBe('pending');
    expect(parseRequestStatusFilter(42)).toBe('pending');
  });
});

// Request type parsing (reserved for future types) — always 'vacation'
describe('parseRequestTypeFilter', () => {
  it('returns "vacation" for "vacation"', () => {
    expect(parseRequestTypeFilter('vacation')).toBe('vacation');
  });

  it('defaults to "vacation" for anything else', () => {
    expect(parseRequestTypeFilter(undefined)).toBe('vacation');
    expect(parseRequestTypeFilter('')).toBe('vacation');
    expect(parseRequestTypeFilter('sick-leave')).toBe('vacation');
    expect(parseRequestTypeFilter(null)).toBe('vacation');
  });
});

// Requests-page copy — verbatim from the spec's Error Messages table
describe('REQUESTS_PAGE_MESSAGES', () => {
  it('viewForbidden matches the spec exactly', () => {
    expect(REQUESTS_PAGE_MESSAGES.viewForbidden).toBe(
      'You do not have permission to view requests',
    );
  });

  it('emptyPending matches the spec exactly', () => {
    expect(REQUESTS_PAGE_MESSAGES.emptyPending).toBe('No pending requests.');
  });

  it('emptyOther interpolates the lowercase status word', () => {
    expect(REQUESTS_PAGE_MESSAGES.emptyOther('approved')).toBe('No approved requests.');
    expect(REQUESTS_PAGE_MESSAGES.emptyOther('rejected')).toBe('No rejected requests.');
    expect(REQUESTS_PAGE_MESSAGES.emptyOther('cancelled')).toBe('No cancelled requests.');
  });
});
