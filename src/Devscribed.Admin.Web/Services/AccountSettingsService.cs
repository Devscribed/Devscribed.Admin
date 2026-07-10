using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class AccountSettingsService
{
    private readonly AppDbContext _db;

    public AccountSettingsService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<AccountSettingsDto?> GetSettingsAsync(Guid accountId)
    {
        var account = await _db.Accounts.SingleOrDefaultAsync(a => a.Id == accountId);
        if (account == null) return null;

        return new AccountSettingsDto
        {
            Email = account.Email,
            FirstName = account.FirstName,
            LastName = account.LastName,
            PhoneCountryCode = account.PhoneCountryCode,
            PhoneNumber = account.PhoneNumber,
            Timezone = account.Timezone,
            FirstDayOfWeek = account.FirstDayOfWeek,
        };
    }

    public async Task<UpdateSettingsResult> UpdateSettingsAsync(Guid accountId, UpdateAccountSettingsRequest request)
    {
        var errors = AccountSettingsValidator.ValidateAll(request);
        if (errors.Count > 0)
            return UpdateSettingsResult.Failure(errors);

        var account = await _db.Accounts.SingleOrDefaultAsync(a => a.Id == accountId);
        if (account == null)
            return UpdateSettingsResult.Failure(new Dictionary<string, string> { ["general"] = "Account not found" });

        account.FirstName = request.FirstName!.Trim();
        account.LastName = request.LastName!.Trim();
        account.PhoneCountryCode = string.IsNullOrWhiteSpace(request.PhoneCountryCode) ? null : request.PhoneCountryCode;
        account.PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber;
        account.Timezone = request.Timezone;
        account.FirstDayOfWeek = request.FirstDayOfWeek!;

        await _db.SaveChangesAsync();

        return UpdateSettingsResult.Success();
    }
}

public class AccountSettingsDto
{
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? PhoneCountryCode { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Timezone { get; set; }
    public string FirstDayOfWeek { get; set; } = "Monday";
}

public class UpdateSettingsResult
{
    public bool Succeeded { get; init; }
    public Dictionary<string, string>? FieldErrors { get; init; }

    public static UpdateSettingsResult Success() => new() { Succeeded = true };
    public static UpdateSettingsResult Failure(Dictionary<string, string> errors) => new() { Succeeded = false, FieldErrors = errors };
}
