using System.Collections.Concurrent;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class VacationRequestService
{
    // Serializes review/submit operations per membership so approvals cannot double-debit
    // the reserve when two reviewers act concurrently (TC-09-INT-12).
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> MembershipLocks = new();

    private readonly AppDbContext _db;
    private readonly VacationLedgerService _ledger;

    public VacationRequestService(AppDbContext db, VacationLedgerService ledger)
    {
        _db = db;
        _ledger = ledger;
    }

    private static SemaphoreSlim GetLock(Guid membershipId) =>
        MembershipLocks.GetOrAdd(membershipId, _ => new SemaphoreSlim(1, 1));

    public async Task<VacationRequestActionResult> SubmitRequestAsync(
        Guid organizationId, Guid targetMembershipId, Guid callerMembershipId, string callerRole,
        DateOnly startDate, DateOnly endDate)
    {
        if (targetMembershipId != callerMembershipId)
            return VacationRequestActionResult.Forbidden("You can only submit vacation requests for yourself");

        if (!MemberPermissions.CanSubmitVacationRequest(callerRole))
            return VacationRequestActionResult.Forbidden("You can only submit vacation requests for yourself");

        var target = await _db.Memberships
            .SingleOrDefaultAsync(m => m.Id == targetMembershipId && m.OrganizationId == organizationId);
        if (target == null)
            return VacationRequestActionResult.NotFound();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var startError = VacationRequestValidator.ValidateStartDate(startDate, today);
        if (startError != null)
            return VacationRequestActionResult.FieldValidationError(new Dictionary<string, string> { ["startDate"] = startError });

        var endError = VacationRequestValidator.ValidateEndDate(startDate, endDate);
        if (endError != null)
            return VacationRequestActionResult.FieldValidationError(new Dictionary<string, string> { ["endDate"] = endError });

        if (VacationRequestValidator.IsCrossYear(startDate, endDate))
            return VacationRequestActionResult.BadRequest("cross_year", "Start and end dates must be within the same calendar year");

        var financials = await _db.MemberFinancials.SingleOrDefaultAsync(f => f.MembershipId == targetMembershipId);
        if (financials == null)
            return VacationRequestActionResult.BadRequest("financials_not_configured", "Financial settings must be configured before requesting vacation");

        var orgLock = GetLock(targetMembershipId);
        await orgLock.WaitAsync();
        try
        {
            var overlapping = await _db.VacationRequests
                .Where(r => r.MembershipId == targetMembershipId && r.Status != VacationRequestStatuses.Cancelled && r.Status != VacationRequestStatuses.Rejected)
                .ToListAsync();

            var overlap = overlapping.FirstOrDefault(r => VacationRequestValidator.Overlaps(r.StartDate, r.EndDate, startDate, endDate));
            if (overlap != null)
                return VacationRequestActionResult.BadRequest("overlap",
                    $"This request overlaps with an existing vacation request ({overlap.StartDate:yyyy-MM-dd} - {overlap.EndDate:yyyy-MM-dd})");

            var workingDays = VacationAccrualCalculator.CountWeekdays(startDate, endDate);
            var snapshot = await ComputeBalanceSnapshotAsync(targetMembershipId, financials);

            if (workingDays > snapshot.AvailableDays)
                return VacationRequestActionResult.BadRequest("insufficient_balance",
                    $"Insufficient vacation balance. You have {snapshot.AvailableDays} day(s) available.");

            var deductionAmount = Math.Round(workingDays * snapshot.DailySalary, 2, MidpointRounding.AwayFromZero);

            var request = new VacationRequest
            {
                Id = Guid.NewGuid(),
                MembershipId = targetMembershipId,
                StartDate = startDate,
                EndDate = endDate,
                WorkingDays = workingDays,
                DeductionAmount = deductionAmount,
                Status = VacationRequestStatuses.Pending,
                RequestedAt = DateTime.UtcNow,
            };

            _db.VacationRequests.Add(request);
            await _db.SaveChangesAsync();

            return VacationRequestActionResult.Created(request);
        }
        finally
        {
            orgLock.Release();
        }
    }

    public async Task<VacationRequestActionResult> ReviewRequestAsync(
        Guid organizationId, Guid targetMembershipId, Guid requestId, Guid callerMembershipId, Guid callerAccountId, string callerRole,
        string decision, string? comment)
    {
        if (!MemberPermissions.CanReviewVacationRequests(callerRole))
            return VacationRequestActionResult.Forbidden("You do not have permission to review vacation requests");

        if (decision is not ("approved" or "rejected"))
            return VacationRequestActionResult.BadRequest("invalid_decision", "Decision must be 'approved' or 'rejected'");

        var commentError = VacationRequestValidator.ValidateReviewerComment(comment);
        if (commentError != null)
            return VacationRequestActionResult.FieldValidationError(new Dictionary<string, string> { ["reviewerComment"] = commentError });

        var target = await _db.Memberships
            .SingleOrDefaultAsync(m => m.Id == targetMembershipId && m.OrganizationId == organizationId);
        if (target == null)
            return VacationRequestActionResult.NotFound();

        var orgLock = GetLock(targetMembershipId);
        await orgLock.WaitAsync();
        try
        {
            var request = await _db.VacationRequests
                .SingleOrDefaultAsync(r => r.Id == requestId && r.MembershipId == targetMembershipId);
            if (request == null)
                return VacationRequestActionResult.NotFound();

            if (request.Status != VacationRequestStatuses.Pending)
                return VacationRequestActionResult.BadRequest("invalid_status", "Only pending requests can be reviewed");

            if (request.MembershipId == callerMembershipId)
                return VacationRequestActionResult.Forbidden("You cannot approve your own vacation request", "self_approval");

            if (decision == "approved")
            {
                var financials = await _db.MemberFinancials.SingleOrDefaultAsync(f => f.MembershipId == targetMembershipId);
                var snapshot = financials == null
                    ? new BalanceSnapshot(0m, 0m, 0)
                    : await ComputeBalanceSnapshotAsync(targetMembershipId, financials, includePendingHold: false);

                if (request.WorkingDays > snapshot.AvailableDays)
                    return VacationRequestActionResult.BadRequest("insufficient_balance",
                        $"Insufficient vacation balance. You have {snapshot.AvailableDays} day(s) available.");

                _ledger.PostTransaction(
                    targetMembershipId,
                    VacationTransactionTypes.Debit,
                    -request.DeductionAmount,
                    $"Vacation {request.StartDate:yyyy-MM-dd} - {request.EndDate:yyyy-MM-dd}",
                    isAutoGenerated: false,
                    createdByAccountId: callerAccountId,
                    vacationRequestId: request.Id);

                request.Status = VacationRequestStatuses.Approved;
            }
            else
            {
                request.Status = VacationRequestStatuses.Rejected;
                request.ReviewerComment = string.IsNullOrWhiteSpace(comment) ? null : comment;
            }

            request.ReviewedAt = DateTime.UtcNow;
            request.ReviewedByAccountId = callerAccountId;

            await _db.SaveChangesAsync();

            return VacationRequestActionResult.Reviewed(request.Status);
        }
        finally
        {
            orgLock.Release();
        }
    }

    public async Task<VacationRequestActionResult> CancelRequestAsync(
        Guid organizationId, Guid targetMembershipId, Guid requestId, Guid callerMembershipId, Guid callerAccountId, string callerRole)
    {
        var target = await _db.Memberships
            .SingleOrDefaultAsync(m => m.Id == targetMembershipId && m.OrganizationId == organizationId);
        if (target == null)
            return VacationRequestActionResult.NotFound();

        var orgLock = GetLock(targetMembershipId);
        await orgLock.WaitAsync();
        try
        {
            var request = await _db.VacationRequests
                .SingleOrDefaultAsync(r => r.Id == requestId && r.MembershipId == targetMembershipId);
            if (request == null)
                return VacationRequestActionResult.NotFound();

            var isOwnMembership = targetMembershipId == callerMembershipId;
            if (!MemberPermissions.CanCancelVacationRequest(callerRole, isOwnMembership, request.Status))
                return VacationRequestActionResult.Forbidden("You do not have permission to cancel this request");

            if (request.Status is not (VacationRequestStatuses.Pending or VacationRequestStatuses.Approved))
                return VacationRequestActionResult.BadRequest("invalid_status", "Only pending or approved requests can be cancelled");

            var wasApproved = request.Status == VacationRequestStatuses.Approved;

            if (wasApproved)
            {
                _ledger.PostTransaction(
                    targetMembershipId,
                    VacationTransactionTypes.Refund,
                    request.DeductionAmount,
                    $"Refund: cancelled vacation {request.StartDate:yyyy-MM-dd} - {request.EndDate:yyyy-MM-dd}",
                    isAutoGenerated: false,
                    createdByAccountId: callerAccountId,
                    vacationRequestId: request.Id);
            }

            request.Status = VacationRequestStatuses.Cancelled;
            request.CancelledAt = DateTime.UtcNow;
            request.CancelledByAccountId = callerAccountId;

            await _db.SaveChangesAsync();

            return VacationRequestActionResult.Cancelled(wasApproved, wasApproved ? request.DeductionAmount : 0m);
        }
        finally
        {
            orgLock.Release();
        }
    }

    private readonly record struct BalanceSnapshot(decimal DailySalary, decimal ReserveBalance, int AvailableDays);

    /// <summary>
    /// Computes availableDays including the pending hold from other pending requests and the annual usage cap
    /// from approved requests, per spec 09's updated availableDays formula.
    /// </summary>
    private async Task<BalanceSnapshot> ComputeBalanceSnapshotAsync(Guid membershipId, MemberFinancials financials, bool includePendingHold = true)
    {
        var currentYear = DateTime.UtcNow.Year;

        var reserveBalance = await _db.VacationReserveTransactions
            .Where(t => t.MembershipId == membershipId && t.CreatedAt.Year == currentYear)
            .SumAsync(t => (decimal?)t.Amount) ?? 0m;

        var pendingHold = 0m;
        if (includePendingHold)
        {
            pendingHold = await _db.VacationRequests
                .Where(r => r.MembershipId == membershipId && r.Status == VacationRequestStatuses.Pending && r.RequestedAt.Year == currentYear)
                .SumAsync(r => (decimal?)r.DeductionAmount) ?? 0m;
        }

        var usedDays = await _db.VacationRequests
            .Where(r => r.MembershipId == membershipId && r.Status == VacationRequestStatuses.Approved && r.StartDate.Year == currentYear)
            .SumAsync(r => (int?)r.WorkingDays) ?? 0;

        var dailySalary = VacationAccrualCalculator.CalculateDailySalary(financials.MonthlySalary);
        var availableDays = VacationAccrualCalculator.CalculateAvailableDays(
            reserveBalance, dailySalary, financials.VacationDaysPerYear, usedDays, pendingHold);

        return new BalanceSnapshot(dailySalary, reserveBalance, availableDays);
    }
}

public enum VacationRequestActionOutcome
{
    Created,
    Reviewed,
    Cancelled,
    NotFound,
    Forbidden,
    BadRequest,
    FieldValidation,
}

public class VacationRequestActionResult
{
    public VacationRequestActionOutcome Outcome { get; init; }
    public string? ErrorCode { get; init; }
    public string? ErrorMessage { get; init; }
    public Dictionary<string, string>? FieldErrors { get; init; }
    public VacationRequest? Request { get; init; }
    public string? Status { get; init; }
    public bool Refunded { get; init; }
    public decimal RefundAmount { get; init; }

    public static VacationRequestActionResult Created(VacationRequest request) => new()
    { Outcome = VacationRequestActionOutcome.Created, Request = request };

    public static VacationRequestActionResult Reviewed(string status) => new()
    { Outcome = VacationRequestActionOutcome.Reviewed, Status = status };

    public static VacationRequestActionResult Cancelled(bool refunded, decimal refundAmount) => new()
    { Outcome = VacationRequestActionOutcome.Cancelled, Refunded = refunded, RefundAmount = refundAmount };

    public static VacationRequestActionResult NotFound() => new() { Outcome = VacationRequestActionOutcome.NotFound };

    public static VacationRequestActionResult Forbidden(string message, string code = "forbidden") => new()
    { Outcome = VacationRequestActionOutcome.Forbidden, ErrorCode = code, ErrorMessage = message };

    public static VacationRequestActionResult BadRequest(string code, string message) => new()
    { Outcome = VacationRequestActionOutcome.BadRequest, ErrorCode = code, ErrorMessage = message };

    public static VacationRequestActionResult FieldValidationError(Dictionary<string, string> errors) => new()
    { Outcome = VacationRequestActionOutcome.FieldValidation, FieldErrors = errors };
}
