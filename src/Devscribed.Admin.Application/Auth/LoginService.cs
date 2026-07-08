using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Auth;

public class LoginService(AdminDbContext db, IPasswordHasher passwordHasher)
{
    private const string GenericError = "invalid email or password";

    public async Task<LoginResult> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var email = (request.Email ?? string.Empty).Trim();

        var account = await db.Accounts
            .FirstOrDefaultAsync(a => a.Email == email, ct);

        if (account is null || !passwordHasher.Verify(account.PasswordHash, request.Password ?? string.Empty))
        {
            return LoginResult.Failed(GenericError);
        }

        var membership = await db.Memberships
            .Include(m => m.Organization)
            .FirstOrDefaultAsync(m => m.AccountId == account.Id, ct);

        if (membership is null || membership.Status == MembershipStatus.Removed)
        {
            return LoginResult.Failed(GenericError);
        }

        return LoginResult.Ok(account, membership.Organization!, membership);
    }
}
