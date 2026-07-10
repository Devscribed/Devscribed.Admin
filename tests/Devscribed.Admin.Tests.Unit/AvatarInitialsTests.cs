using Devscribed.Admin.Web.Services;

namespace Devscribed.Admin.Tests.Unit;

public class AvatarInitialsTests
{
    // TC-05-UNIT-04: Avatar initials generation
    [Theory]
    [InlineData("Alex", "Kaminski", "AK")]
    [InlineData("pat", "owner", "PO")]
    [InlineData("María", "García", "MG")]
    public void Generate_returns_uppercase_first_letters(string firstName, string lastName, string expected)
    {
        var result = AvatarInitials.Generate(firstName, lastName);

        Assert.Equal(expected, result);
    }
}
