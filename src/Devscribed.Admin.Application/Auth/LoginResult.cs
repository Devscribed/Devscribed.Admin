using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Application.Auth;

public class LoginResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }
    public Account? Account { get; private init; }
    public Organization? Organization { get; private init; }
    public Membership? Membership { get; private init; }

    public static LoginResult Ok(Account account, Organization organization, Membership membership) => new()
    {
        Success = true,
        Account = account,
        Organization = organization,
        Membership = membership
    };

    public static LoginResult Failed(string error) => new()
    {
        Success = false,
        Error = error
    };
}
