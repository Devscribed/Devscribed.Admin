using Devscribed.Admin.Application.Validation;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.AccountSettings;

public class UpdateAccountInfoService(AdminDbContext db)
{
    public async Task<UpdateAccountInfoResult> UpdateAsync(
        Guid accountId,
        string? firstName,
        string? lastName,
        string? phoneCountryCode,
        string? phoneNumber,
        string? timezone,
        string? firstDayOfWeek,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(firstName))
            return UpdateAccountInfoResult.Failed("first name is required", "firstName");

        if (string.IsNullOrWhiteSpace(lastName))
            return UpdateAccountInfoResult.Failed("last name is required", "lastName");

        var (phoneValid, phoneError) = PhoneValidator.Validate(phoneCountryCode, phoneNumber);
        if (!phoneValid)
            return UpdateAccountInfoResult.Failed(phoneError!, "phoneNumber");

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == accountId, ct);
        if (account is null)
            return UpdateAccountInfoResult.Failed("account not found");

        account.FirstName = firstName.Trim();
        account.LastName = lastName.Trim();
        account.PhoneCountryCode = string.IsNullOrWhiteSpace(phoneCountryCode) ? null : phoneCountryCode.Trim();
        account.PhoneNumber = string.IsNullOrWhiteSpace(phoneNumber) ? null : phoneNumber.Trim();
        account.Timezone = string.IsNullOrWhiteSpace(timezone) ? null : timezone.Trim();
        account.FirstDayOfWeek = string.IsNullOrWhiteSpace(firstDayOfWeek) ? null : firstDayOfWeek.Trim();

        await db.SaveChangesAsync(ct);
        return UpdateAccountInfoResult.Ok();
    }
}
