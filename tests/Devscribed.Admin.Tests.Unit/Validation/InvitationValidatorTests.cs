using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class InvitationValidatorTests
{
    // TC-03-UNIT-01: Invite payload validation

    [Fact]
    public void Invalid_email_format_is_rejected()
    {
        var result = InvitationValidator.ValidateInvitePayload("not-an-email", "user", "other@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("Enter a valid email address", result.ErrorMessage);
    }

    [Fact]
    public void Invalid_role_is_rejected()
    {
        var result = InvitationValidator.ValidateInvitePayload("new@acme.com", "superuser", "other@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("Invalid role", result.ErrorMessage);
    }

    [Fact]
    public void Valid_email_and_role_passes()
    {
        var result = InvitationValidator.ValidateInvitePayload("new@acme.com", "manager", "other@acme.com");
        Assert.True(result.IsValid);
    }

    // TC-03-UNIT-03: Self-invitation rejected

    [Fact]
    public void Self_invitation_is_rejected()
    {
        var result = InvitationValidator.ValidateInvitePayload("admin@acme.com", "user", "admin@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("You cannot invite yourself", result.ErrorMessage);
    }

    [Fact]
    public void Self_invitation_case_insensitive_is_rejected()
    {
        var result = InvitationValidator.ValidateInvitePayload("ADMIN@ACME.COM", "user", "admin@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("You cannot invite yourself", result.ErrorMessage);
    }

    // TC-03-UNIT-04: Email normalization

    [Fact]
    public void Email_is_normalized_to_lowercase()
    {
        var result = InvitationValidator.ValidateInvitePayload("NEW@ACME.COM", "user", "other@acme.com");
        Assert.True(result.IsValid);
        Assert.Equal("new@acme.com", result.NormalizedEmail);
    }

    [Fact]
    public void Email_with_mixed_case_is_normalized()
    {
        var result = InvitationValidator.ValidateInvitePayload("New.User@Acme.Com", "user", "other@acme.com");
        Assert.True(result.IsValid);
        Assert.Equal("new.user@acme.com", result.NormalizedEmail);
    }

    // TC-03-UNIT-05: Edge cases

    [Fact]
    public void Empty_email_is_rejected()
    {
        var result = InvitationValidator.ValidateInvitePayload("", "user", "other@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("Email is required", result.ErrorMessage);
    }

    [Fact]
    public void Whitespace_email_is_rejected()
    {
        var result = InvitationValidator.ValidateInvitePayload("   ", "user", "other@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("Email is required", result.ErrorMessage);
    }

    [Fact]
    public void Empty_role_is_rejected()
    {
        var result = InvitationValidator.ValidateInvitePayload("new@acme.com", "", "other@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("Role is required", result.ErrorMessage);
    }

    [Fact]
    public void Whitespace_role_is_rejected()
    {
        var result = InvitationValidator.ValidateInvitePayload("new@acme.com", "   ", "other@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("Role is required", result.ErrorMessage);
    }

    [Fact]
    public void Email_of_255_chars_is_rejected()
    {
        // Create a 255-char email: localpart@domain
        var local = new string('a', 245);
        var email = $"{local}@acme.com"; // 245 + 1 + 8 = 254... need 255
        var email255 = $"{new string('a', 246)}@acme.com"; // 246 + 1 + 8 = 255
        var result = InvitationValidator.ValidateInvitePayload(email255, "user", "other@acme.com");
        Assert.False(result.IsValid);
        Assert.Equal("Email must be at most 254 characters", result.ErrorMessage);
    }

    [Fact]
    public void Email_of_254_chars_is_valid()
    {
        // Create a 254-char email
        var local = new string('a', 245);
        var email254 = $"{local}@acme.com"; // 245 + 1 + 8 = 254
        var result = InvitationValidator.ValidateInvitePayload(email254, "user", "other@acme.com");
        Assert.True(result.IsValid);
    }

    // TC-03-UNIT-01 additional: all valid roles
    [Theory]
    [InlineData("admin")]
    [InlineData("manager")]
    [InlineData("user")]
    [InlineData("viewer")]
    public void Valid_roles_are_accepted(string role)
    {
        var result = InvitationValidator.ValidateInvitePayload("new@acme.com", role, "other@acme.com");
        Assert.True(result.IsValid);
    }
}
