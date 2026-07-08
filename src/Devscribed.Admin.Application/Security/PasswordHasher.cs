using Microsoft.AspNetCore.Identity;

namespace Devscribed.Admin.Application.Security;

/// <summary>
/// Wraps ASP.NET Core Identity's PBKDF2-based hasher (per-hash random salt, one-way).
/// </summary>
public class PasswordHasher : IPasswordHasher
{
    private readonly Microsoft.AspNetCore.Identity.PasswordHasher<object> _inner = new();

    public string Hash(string password) => _inner.HashPassword(new object(), password);

    public bool Verify(string hash, string password) =>
        _inner.VerifyHashedPassword(new object(), hash, password) != PasswordVerificationResult.Failed;
}
