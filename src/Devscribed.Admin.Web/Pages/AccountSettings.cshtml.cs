using Devscribed.Admin.Infrastructure;
using Devscribed.Admin.Web.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Pages;

[Authorize]
public class AccountSettingsModel(AdminDbContext db) : PageModel
{
    public string FirstName { get; private set; } = string.Empty;
    public string LastName { get; private set; } = string.Empty;
    public string Email { get; private set; } = string.Empty;
    public string? PhoneCountryCode { get; private set; }
    public string? PhoneNumber { get; private set; }
    public string? Timezone { get; private set; }
    public string? FirstDayOfWeek { get; private set; }

    public async Task<IActionResult> OnGetAsync()
    {
        var accountId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == accountId);
        if (account is null)
            return RedirectToPage("Members");

        FirstName = account.FirstName;
        LastName = account.LastName;
        Email = account.Email;
        PhoneCountryCode = account.PhoneCountryCode;
        PhoneNumber = account.PhoneNumber;
        Timezone = account.Timezone;
        FirstDayOfWeek = account.FirstDayOfWeek;

        return Page();
    }
}
