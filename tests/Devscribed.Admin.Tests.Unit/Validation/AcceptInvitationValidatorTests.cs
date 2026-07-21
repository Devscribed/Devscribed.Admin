using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class AcceptInvitationValidatorTests
{
    // TC-03-UNIT-06: New-account accept name and password validation

    [Fact]
    public void Empty_first_name_is_rejected()
    {
        var errors = InvitationValidator.ValidateAcceptNewAccountPayload("", "Hire", "Passw0rd");
        Assert.Contains("firstName", errors.Keys);
        Assert.Equal("First name is required", errors["firstName"]);
    }

    [Fact]
    public void Empty_last_name_is_rejected()
    {
        var errors = InvitationValidator.ValidateAcceptNewAccountPayload("New", "", "Passw0rd");
        Assert.Contains("lastName", errors.Keys);
        Assert.Equal("Last name is required", errors["lastName"]);
    }

    [Fact]
    public void Empty_password_is_rejected()
    {
        var errors = InvitationValidator.ValidateAcceptNewAccountPayload("New", "Hire", "");
        Assert.Contains("password", errors.Keys);
        Assert.Equal("Password is required", errors["password"]);
    }

    [Fact]
    public void First_name_with_digits_is_rejected()
    {
        var errors = InvitationValidator.ValidateAcceptNewAccountPayload("New2", "Hire", "Passw0rd");
        Assert.Contains("firstName", errors.Keys);
        Assert.Equal("First name may contain only letters, hyphens, apostrophes, and spaces", errors["firstName"]);
    }

    [Fact]
    public void Short_password_is_rejected()
    {
        var errors = InvitationValidator.ValidateAcceptNewAccountPayload("New", "Hire", "short1");
        Assert.Contains("password", errors.Keys);
        Assert.Equal("Password must be at least 8 characters", errors["password"]);
    }

    [Fact]
    public void Password_without_digit_is_rejected()
    {
        var errors = InvitationValidator.ValidateAcceptNewAccountPayload("New", "Hire", "abcdefgh");
        Assert.Contains("password", errors.Keys);
        Assert.Equal("Password must contain at least one digit", errors["password"]);
    }

    [Fact]
    public void Valid_payload_returns_no_errors()
    {
        var errors = InvitationValidator.ValidateAcceptNewAccountPayload("New", "Hire", "Passw0rd");
        Assert.Empty(errors);
    }
}
