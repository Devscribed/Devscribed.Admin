using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class RequestsService
{
    private static readonly string[] ValidStatuses = { "pending", "approved", "rejected", "cancelled", "all" };

    private readonly AppDbContext _db;

    public RequestsService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<RequestsListResult> GetRequestsAsync(
        Guid organizationId, Guid callerMembershipId, string callerRole, string? status, string? type)
    {
        if (!MemberPermissions.CanViewRequests(callerRole))
            return RequestsListResult.Forbidden("You do not have permission to view requests");

        if (!string.IsNullOrWhiteSpace(type) && !string.Equals(type, "vacation", StringComparison.OrdinalIgnoreCase))
            return RequestsListResult.Ok(new List<OrgRequestDto>(), pendingCount: 0, totalCount: 0);

        var normalizedStatus = string.IsNullOrWhiteSpace(status) ? "pending" : status.Trim().ToLowerInvariant();
        if (!ValidStatuses.Contains(normalizedStatus))
            normalizedStatus = "pending";

        var allRequests = await _db.VacationRequests
            .Include(r => r.Membership).ThenInclude(m => m.Account)
            .Where(r => r.Membership.OrganizationId == organizationId && r.Membership.Status == "active")
            .ToListAsync();

        var totalCount = allRequests.Count;
        var pendingCount = allRequests.Count(r => r.Status == VacationRequestStatuses.Pending);

        var filtered = normalizedStatus == "all"
            ? allRequests
            : allRequests.Where(r => r.Status == normalizedStatus).ToList();

        filtered.Sort((a, b) =>
        {
            var aPending = a.Status == VacationRequestStatuses.Pending;
            var bPending = b.Status == VacationRequestStatuses.Pending;
            if (aPending != bPending)
                return aPending ? -1 : 1;

            return aPending
                ? a.RequestedAt.CompareTo(b.RequestedAt)
                : b.RequestedAt.CompareTo(a.RequestedAt);
        });

        var membershipIds = filtered.Select(r => r.MembershipId).Distinct().ToList();
        var balances = new Dictionary<Guid, VacationBalanceDto>();
        var currentYear = DateTime.UtcNow.Year;

        foreach (var membershipId in membershipIds)
        {
            var financials = await _db.MemberFinancials.SingleOrDefaultAsync(f => f.MembershipId == membershipId);
            if (financials == null)
            {
                balances[membershipId] = new VacationBalanceDto();
                continue;
            }

            var usedDays = await _db.VacationRequests
                .Where(r => r.MembershipId == membershipId && r.Status == VacationRequestStatuses.Approved && r.StartDate.Year == currentYear)
                .SumAsync(r => (int?)r.WorkingDays) ?? 0;

            var pendingDays = await _db.VacationRequests
                .Where(r => r.MembershipId == membershipId && r.Status == VacationRequestStatuses.Pending && r.RequestedAt.Year == currentYear)
                .SumAsync(r => (int?)r.WorkingDays) ?? 0;

            var pendingHold = await _db.VacationRequests
                .Where(r => r.MembershipId == membershipId && r.Status == VacationRequestStatuses.Pending && r.RequestedAt.Year == currentYear)
                .SumAsync(r => (decimal?)r.DeductionAmount) ?? 0m;

            var reserveBalance = await _db.VacationReserveTransactions
                .Where(t => t.MembershipId == membershipId && t.CreatedAt.Year == currentYear)
                .SumAsync(t => (decimal?)t.Amount) ?? 0m;

            var dailySalary = VacationAccrualCalculator.CalculateDailySalary(financials.MonthlySalary);
            var availableDays = VacationAccrualCalculator.CalculateAvailableDays(
                reserveBalance, dailySalary, financials.VacationDaysPerYear, usedDays, pendingHold);

            balances[membershipId] = new VacationBalanceDto
            {
                AvailableDays = availableDays,
                UsedDays = usedDays,
                PendingDays = pendingDays,
                TotalDaysPerYear = financials.VacationDaysPerYear,
            };
        }

        var reviewerIds = filtered.Where(r => r.ReviewedByAccountId.HasValue).Select(r => r.ReviewedByAccountId!.Value)
            .Concat(filtered.Where(r => r.CancelledByAccountId.HasValue).Select(r => r.CancelledByAccountId!.Value))
            .Distinct()
            .ToList();
        var accountNames = await _db.Accounts
            .Where(a => reviewerIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, a => $"{a.FirstName} {a.LastName}");

        var dtos = filtered.Select(r => new OrgRequestDto
        {
            Id = r.Id,
            Type = "vacation",
            MembershipId = r.MembershipId,
            FirstName = r.Membership.Account.FirstName,
            LastName = r.Membership.Account.LastName,
            Initials = AvatarInitials.Generate(r.Membership.Account.FirstName, r.Membership.Account.LastName),
            StartDate = r.StartDate,
            EndDate = r.EndDate,
            WorkingDays = r.WorkingDays,
            DeductionAmount = r.DeductionAmount,
            Status = r.Status,
            RequestedAt = r.RequestedAt,
            ReviewedAt = r.ReviewedAt,
            ReviewedBy = r.ReviewedByAccountId.HasValue && accountNames.TryGetValue(r.ReviewedByAccountId.Value, out var reviewerName) ? reviewerName : null,
            ReviewerComment = r.ReviewerComment,
            CancelledAt = r.CancelledAt,
            CancelledBy = r.CancelledByAccountId.HasValue && accountNames.TryGetValue(r.CancelledByAccountId.Value, out var cancellerName) ? cancellerName : null,
            IsOwnRequest = r.MembershipId == callerMembershipId,
            MemberBalance = balances.TryGetValue(r.MembershipId, out var balance) ? balance : new VacationBalanceDto(),
        }).ToList();

        return RequestsListResult.Ok(dtos, pendingCount, totalCount);
    }
}

public class OrgRequestDto
{
    public Guid Id { get; set; }
    public string Type { get; set; } = "vacation";
    public Guid MembershipId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Initials { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public int WorkingDays { get; set; }
    public decimal DeductionAmount { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime RequestedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewedBy { get; set; }
    public string? ReviewerComment { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancelledBy { get; set; }
    public bool IsOwnRequest { get; set; }
    public VacationBalanceDto MemberBalance { get; set; } = new();
}

public enum RequestsFetchOutcome
{
    Success,
    Forbidden,
}

public class RequestsListResult
{
    public RequestsFetchOutcome Outcome { get; init; }
    public List<OrgRequestDto> Requests { get; init; } = new();
    public int PendingCount { get; init; }
    public int TotalCount { get; init; }
    public string? ErrorMessage { get; init; }

    public static RequestsListResult Ok(List<OrgRequestDto> requests, int pendingCount, int totalCount) => new()
    { Outcome = RequestsFetchOutcome.Success, Requests = requests, PendingCount = pendingCount, TotalCount = totalCount };

    public static RequestsListResult Forbidden(string message) => new()
    { Outcome = RequestsFetchOutcome.Forbidden, ErrorMessage = message };
}
