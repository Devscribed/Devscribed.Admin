namespace Devscribed.Admin.Web.Services;

public interface ITokenGenerator
{
    /// <summary>Generates a raw, URL-safe base64-encoded token from 32 cryptographically random bytes.</summary>
    string GenerateToken();

    /// <summary>Computes the hex-encoded SHA-256 hash of a raw token, for storage.</summary>
    string Hash(string rawToken);
}
