using Devscribed.Admin.Application.Security;

namespace Devscribed.Admin.Tests;

/// <summary>TC-02-UNIT-01: Password hashing and verification.</summary>
public class PasswordHasherTests
{
    private readonly PasswordHasher _hasher = new();

    [Fact]
    public void Hash_is_not_equal_to_plaintext()
    {
        var hash = _hasher.Hash("Passw0rd");

        Assert.NotEqual("Passw0rd", hash);
    }

    [Fact]
    public void Correct_password_verifies()
    {
        var hash = _hasher.Hash("Passw0rd");

        Assert.True(_hasher.Verify(hash, "Passw0rd"));
    }

    [Fact]
    public void Wrong_password_does_not_verify()
    {
        var hash = _hasher.Hash("Passw0rd");

        Assert.False(_hasher.Verify(hash, "wrongpass"));
    }

    [Fact]
    public void Second_hash_differs_from_first_due_to_per_hash_salt()
    {
        var hash1 = _hasher.Hash("Passw0rd");
        var hash2 = _hasher.Hash("Passw0rd");

        Assert.NotEqual(hash1, hash2);
    }
}
