using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Pages;

public class AcceptInvitationModel(AdminDbContext db, TimeProvider timeProvider) : PageModel
{
    public string Token { get; private set; } = string.Empty;
    public string OrganizationName { get; private set; } = string.Empty;
    public string? Error { get; private set; }
    public bool RequiresAccountDetails { get; private set; }

    public async Task OnGetAsync(string token)
    {
        Token = token ?? string.Empty;

        var invitation = await db.Invitations
            .Include(i => i.Organization)
            .FirstOrDefaultAsync(i => i.Token == Token);

        if (invitation is null)
        {
            Error = "invalid invitation";
            return;
        }

        OrganizationName = invitation.Organization?.Name ?? string.Empty;
        var now = timeProvider.GetUtcNow();

        if (invitation.Status != InvitationStatus.Pending)
        {
            Error = "invitation no longer valid";
            return;
        }

        if (invitation.IsExpired(now))
        {
            Error = "this invitation has expired";
            return;
        }

        RequiresAccountDetails = !await db.Accounts.AnyAsync(a => a.Email == invitation.Email);
    }
}
