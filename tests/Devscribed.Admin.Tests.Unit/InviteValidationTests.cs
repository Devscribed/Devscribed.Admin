using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class InviteValidationTests
{
    [Fact]
    public void Invalid_email_format_rejected()
    {
        Assert.Equal("Enter a valid email address", InviteValidator.ValidateEmail("not-an-email"));
    }

    [Fact]
    public void Invalid_role_rejected()
    {
        Assert.Equal("Invalid role", InviteValidator.ValidateRole("superuser"));
    }

    [Fact]
    public void Valid_email_and_role_accepted()
    {
        Assert.Null(InviteValidator.ValidateEmail("new@acme.com"));
        Assert.Null(InviteValidator.ValidateRole("manager"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Empty_email_rejected(string email)
    {
        Assert.Equal("Email is required", InviteValidator.ValidateEmail(email));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Empty_role_rejected(string role)
    {
        Assert.Equal("Role is required", InviteValidator.ValidateRole(role));
    }

    [Fact]
    public void Email_over_254_chars_rejected()
    {
        var local = new string('a', 244);
        var email = $"{local}@test.co.uk";
        Assert.True(email.Length == 255);
        Assert.Equal("Email must be at most 254 characters", InviteValidator.ValidateEmail(email));
    }

    [Fact]
    public void Email_exactly_254_chars_is_valid()
    {
        var local = new string('a', 243);
        var email = $"{local}@test.co.uk";
        Assert.True(email.Length == 254);
        Assert.Null(InviteValidator.ValidateEmail(email));
    }

    [Theory]
    [InlineData("admin@acme.com", "admin@acme.com")]
    [InlineData("admin@acme.com", "ADMIN@ACME.COM")]
    public void Self_invitation_rejected(string inviterEmail, string inviteeEmail)
    {
        Assert.Equal("You cannot invite yourself", InviteValidator.ValidateNotSelfInvite(inviterEmail, inviteeEmail));
    }

    [Fact]
    public void Different_email_is_not_self_invitation()
    {
        Assert.Null(InviteValidator.ValidateNotSelfInvite("admin@acme.com", "new@acme.com"));
    }
}
