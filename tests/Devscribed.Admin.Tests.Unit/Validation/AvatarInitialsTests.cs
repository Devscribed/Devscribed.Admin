using Devscribed.Admin.Domain.Services;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class AvatarInitialsTests
{
    [Theory]
    [InlineData("Alex", "Kaminski", "AK")]
    [InlineData("pat", "owner", "PO")]
    public void Generates_uppercase_initials_from_first_and_last_name(string firstName, string lastName, string expected)
    {
        Assert.Equal(expected, AvatarInitials.Generate(firstName, lastName));
    }

    [Fact]
    public void Handles_unicode_names()
    {
        Assert.Equal("MG", AvatarInitials.Generate("María", "García"));
    }

    [Fact]
    public void Handles_single_character_names()
    {
        Assert.Equal("AB", AvatarInitials.Generate("a", "b"));
    }
}
