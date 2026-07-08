using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Application.Signup;

public class SignupResult
{
    public bool Success { get; private init; }
    public Account? Account { get; private init; }
    public Organization? Organization { get; private init; }
    public Membership? Membership { get; private init; }

    /// <summary>Field name (matching field-error-{fieldName} test ids) to error message.</summary>
    public IReadOnlyDictionary<string, string> FieldErrors { get; private init; } = new Dictionary<string, string>();

    public static SignupResult Ok(Account account, Organization organization, Membership membership) => new()
    {
        Success = true,
        Account = account,
        Organization = organization,
        Membership = membership
    };

    public static SignupResult Failed(IReadOnlyDictionary<string, string> fieldErrors) => new()
    {
        Success = false,
        FieldErrors = fieldErrors
    };
}
