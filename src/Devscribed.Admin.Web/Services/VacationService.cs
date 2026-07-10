using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class VacationService
{
    private readonly AppDbContext _db;

    public VacationService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<VacationFetchResult> GetVacationAsync(
        Guid organizationId, Guid targetMembershipId, Guid callerMembershipId, string callerRole)
    {
        var target = await _db.Memberships
            .SingleOrDefaultAsync(m => m.Id == targetMembershipId && m.OrganizationId == organizationId);

        if (target == null)
            return VacationFetchResult.NotFound();

        var isOwnMembership = target.Id == callerMembershipId;
        if (!MemberPermissions.CanViewVacation(callerRole, isOwnMembership))
            return VacationFetchResult.Forbidden("You do not have permission to view this member's vacation data");

        var isFullView = callerRole is "admin" or "manager";
        var financials = await _db.MemberFinancials.SingleOrDefaultAsync(f => f.MembershipId == targetMembershipId);

        var dto = new VacationDto
        {
            Financials = (financials != null && isFullView)
                ? new VacationFinancialsDto
                {
                    MonthlySalary = financials.MonthlySalary,
                    ClientHourlyRate = financials.ClientHourlyRate,
                    VacationReservePercent = financials.VacationReservePercent,
                    IsReservePercentManual = financials.IsReservePercentManual,
                    VacationDaysPerYear = financials.VacationDaysPerYear,
                    Currency = financials.Currency,
                }
                : null,
            Balance = financials == null
                ? null
                : new VacationBalanceDto
                {
                    ReserveBalance = isFullView ? 0m : null,
                    AvailableDays = 0,
                    UsedDays = 0,
                    PendingDays = 0,
                    TotalDaysPerYear = financials.VacationDaysPerYear,
                },
            CanEdit = MemberPermissions.CanEditMemberFinancials(callerRole),
            CanReviewRequests = false,
            CanSubmitRequest = false,
        };

        return VacationFetchResult.Ok(dto);
    }

    public async Task<MemberFinancialsActionResult> UpdateFinancialsAsync(
        Guid organizationId, Guid targetMembershipId, Guid callerAccountId, string callerRole, UpdateMemberFinancialsRequest request)
    {
        if (!MemberPermissions.CanEditMemberFinancials(callerRole))
            return MemberFinancialsActionResult.Forbidden("You do not have permission to edit financial settings");

        var errors = MemberFinancialsValidator.ValidateAll(request);
        if (errors.Count > 0)
            return MemberFinancialsActionResult.FieldValidationError(errors);

        var target = await _db.Memberships
            .SingleOrDefaultAsync(m => m.Id == targetMembershipId && m.OrganizationId == organizationId);

        if (target == null)
            return MemberFinancialsActionResult.NotFound();

        if (target.Status == "removed")
            return MemberFinancialsActionResult.BadRequest("member_removed", "Cannot configure vacation for a removed member");

        var financials = await _db.MemberFinancials.SingleOrDefaultAsync(f => f.MembershipId == targetMembershipId);
        if (financials == null)
        {
            financials = new MemberFinancials { Id = Guid.NewGuid(), MembershipId = targetMembershipId };
            _db.MemberFinancials.Add(financials);
        }

        var effectivePercent = request.IsReservePercentManual
            ? request.VacationReservePercent!.Value
            : VacationReserveCalculator.CalculateReservePercent(
                request.MonthlySalary!.Value, request.ClientHourlyRate!.Value, request.VacationDaysPerYear!.Value);

        financials.MonthlySalary = request.MonthlySalary!.Value;
        financials.ClientHourlyRate = request.ClientHourlyRate!.Value;
        financials.VacationDaysPerYear = request.VacationDaysPerYear!.Value;
        financials.Currency = request.Currency!;
        financials.IsReservePercentManual = request.IsReservePercentManual;
        financials.VacationReservePercent = effectivePercent;
        financials.UpdatedAt = DateTime.UtcNow;
        financials.UpdatedByAccountId = callerAccountId;

        _db.MemberFinancialsSnapshots.Add(new MemberFinancialsSnapshot
        {
            Id = Guid.NewGuid(),
            MembershipId = targetMembershipId,
            MonthlySalary = financials.MonthlySalary,
            ClientHourlyRate = financials.ClientHourlyRate,
            VacationReservePercent = financials.VacationReservePercent,
            IsReservePercentManual = financials.IsReservePercentManual,
            VacationDaysPerYear = financials.VacationDaysPerYear,
            Currency = financials.Currency,
            EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow),
            CreatedAt = DateTime.UtcNow,
        });

        await _db.SaveChangesAsync();

        return MemberFinancialsActionResult.Ok(effectivePercent);
    }
}

public class VacationFinancialsDto
{
    public decimal MonthlySalary { get; set; }
    public decimal ClientHourlyRate { get; set; }
    public decimal VacationReservePercent { get; set; }
    public bool IsReservePercentManual { get; set; }
    public int VacationDaysPerYear { get; set; }
    public string Currency { get; set; } = string.Empty;
}

public class VacationBalanceDto
{
    public decimal? ReserveBalance { get; set; }
    public int AvailableDays { get; set; }
    public int UsedDays { get; set; }
    public int PendingDays { get; set; }
    public int TotalDaysPerYear { get; set; }
}

public class VacationDto
{
    public VacationFinancialsDto? Financials { get; set; }
    public VacationBalanceDto? Balance { get; set; }
    public bool CanEdit { get; set; }
    public bool CanReviewRequests { get; set; }
    public bool CanSubmitRequest { get; set; }
}

public enum VacationFetchOutcome
{
    Success,
    NotFound,
    Forbidden,
}

public class VacationFetchResult
{
    public VacationFetchOutcome Outcome { get; init; }
    public VacationDto? Dto { get; init; }
    public string? ErrorMessage { get; init; }

    public static VacationFetchResult Ok(VacationDto dto) => new() { Outcome = VacationFetchOutcome.Success, Dto = dto };
    public static VacationFetchResult NotFound() => new() { Outcome = VacationFetchOutcome.NotFound };
    public static VacationFetchResult Forbidden(string message) => new()
    { Outcome = VacationFetchOutcome.Forbidden, ErrorMessage = message };
}

public enum MemberFinancialsActionOutcome
{
    Success,
    NotFound,
    Forbidden,
    BadRequest,
    FieldValidation,
}

public class MemberFinancialsActionResult
{
    public MemberFinancialsActionOutcome Outcome { get; init; }
    public string? ErrorCode { get; init; }
    public string? ErrorMessage { get; init; }
    public Dictionary<string, string>? FieldErrors { get; init; }
    public decimal VacationReservePercent { get; init; }

    public static MemberFinancialsActionResult Ok(decimal vacationReservePercent) => new()
    { Outcome = MemberFinancialsActionOutcome.Success, VacationReservePercent = vacationReservePercent };
    public static MemberFinancialsActionResult NotFound() => new() { Outcome = MemberFinancialsActionOutcome.NotFound };
    public static MemberFinancialsActionResult Forbidden(string message, string code = "forbidden") => new()
    { Outcome = MemberFinancialsActionOutcome.Forbidden, ErrorCode = code, ErrorMessage = message };
    public static MemberFinancialsActionResult BadRequest(string code, string message) => new()
    { Outcome = MemberFinancialsActionOutcome.BadRequest, ErrorCode = code, ErrorMessage = message };
    public static MemberFinancialsActionResult FieldValidationError(Dictionary<string, string> errors) => new()
    { Outcome = MemberFinancialsActionOutcome.FieldValidation, FieldErrors = errors };
}
