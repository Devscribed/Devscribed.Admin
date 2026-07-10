using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class AcceptInviteValidationTests
{
    [Fact]
    public void Empty_first_name_rejected()
    {
        Assert.Equal("First name is required", SignupValidator.ValidateFirstName(""));
    }

    [Fact]
    public void Empty_last_name_rejected()
    {
        Assert.Equal("Last name is required", SignupValidator.ValidateLastName(""));
    }

    [Fact]
    public void Empty_password_rejected()
    {
        Assert.Equal("Password is required", SignupValidator.ValidatePassword(""));
    }

    [Fact]
    public void First_name_with_digit_rejected()
    {
        Assert.Equal(
            "First name may contain only letters, hyphens, apostrophes, and spaces",
            SignupValidator.ValidateFirstName("New2"));
    }

    [Fact]
    public void Short_password_rejected()
    {
        Assert.Equal("Password must be at least 8 characters", SignupValidator.ValidatePassword("short1"));
    }

    [Fact]
    public void Password_without_digit_rejected()
    {
        Assert.Equal("Password must contain at least one digit", SignupValidator.ValidatePassword("abcdefgh"));
    }

    [Fact]
    public void Valid_name_and_password_accepted()
    {
        Assert.Null(SignupValidator.ValidateFirstName("New"));
        Assert.Null(SignupValidator.ValidateLastName("Hire"));
        Assert.Null(SignupValidator.ValidatePassword("Passw0rd"));
    }
}
