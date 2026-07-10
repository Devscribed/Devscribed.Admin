using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class ChangePasswordValidatorTests
{
    private static ChangePasswordRequest Request(string? current = "Passw0rd", string? next = "NewPass1", string? confirm = "NewPass1")
        => new() { CurrentPassword = current, NewPassword = next, PasswordConfirmation = confirm };

    // TC-06-UNIT-11: Empty password fields
    [Fact]
    public void Empty_current_password_is_required()
    {
        Assert.Equal("Current password is required", ChangePasswordValidator.ValidateFields(Request(current: "")));
    }

    [Fact]
    public void Empty_new_password_reports_password_required()
    {
        Assert.Equal("Password is required", ChangePasswordValidator.ValidateFields(Request(next: "", confirm: "")));
    }

    [Fact]
    public void Fully_valid_fields_pass()
    {
        Assert.Null(ChangePasswordValidator.ValidateFields(Request()));
    }

    // TC-06-UNIT-02: Password confirmation & policy
    [Fact]
    public void Short_new_password_fails_policy()
    {
        Assert.Equal("Password must be at least 8 characters",
            ChangePasswordValidator.ValidateFields(Request(next: "short", confirm: "short")));
    }

    [Fact]
    public void Mismatched_confirmation_fails()
    {
        Assert.Equal("Passwords do not match",
            ChangePasswordValidator.ValidateFields(Request(next: "NewPass1", confirm: "NewPass2")));
    }

    [Fact]
    public void Matching_confirmation_passes()
    {
        Assert.Null(ChangePasswordValidator.ValidateFields(Request(next: "NewPass1", confirm: "NewPass1")));
    }

    [Fact]
    public void Over_128_chars_fails()
    {
        var longPw = new string('a', 128) + "1";
        Assert.Equal("Password must be at most 128 characters",
            ChangePasswordValidator.ValidateFields(Request(next: longPw, confirm: longPw)));
    }

    // TC-06-UNIT-07: Password confirmation mismatch variations
    [Fact]
    public void Empty_confirmation_reports_confirm_required()
    {
        Assert.Equal("Please confirm your new password",
            ChangePasswordValidator.ValidateFields(Request(next: "NewPass1", confirm: "")));
    }

    [Fact]
    public void Case_different_confirmation_mismatches()
    {
        Assert.Equal("Passwords do not match",
            ChangePasswordValidator.ValidateFields(Request(next: "NewPass1", confirm: "newpass1")));
    }

    [Fact]
    public void Exact_match_confirmation_valid()
    {
        Assert.Null(ChangePasswordValidator.ValidateFields(Request(next: "NewPass1", confirm: "NewPass1")));
    }
}
