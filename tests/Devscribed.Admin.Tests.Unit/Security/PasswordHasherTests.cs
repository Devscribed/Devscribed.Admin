using Devscribed.Admin.Infrastructure.Security;

namespace Devscribed.Admin.Tests.Unit.Security;

public class PasswordHasherTests
{
    [Fact]
    public void Hash_is_not_equal_to_plaintext()
    {
        var hash = PasswordHasher.Hash("Passw0rd");

        Assert.NotEqual("Passw0rd", hash);
    }

    [Fact]
    public void Correct_password_verifies_against_hash()
    {
        var hash = PasswordHasher.Hash("Passw0rd");

        Assert.True(PasswordHasher.Verify("Passw0rd", hash));
    }

    [Fact]
    public void Wrong_password_does_not_verify_against_hash()
    {
        var hash = PasswordHasher.Hash("Passw0rd");

        Assert.False(PasswordHasher.Verify("wrongpass", hash));
    }

    [Fact]
    public void Two_hashes_of_same_password_differ_due_to_per_hash_salt()
    {
        var hash1 = PasswordHasher.Hash("Passw0rd");
        var hash2 = PasswordHasher.Hash("Passw0rd");

        Assert.NotEqual(hash1, hash2);
    }
}
