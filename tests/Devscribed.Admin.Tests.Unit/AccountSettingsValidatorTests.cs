using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class AccountSettingsValidatorTests
{
    // TC-06-UNIT-06: First day of week validation
    [Theory]
    [InlineData("Monday", true)]
    [InlineData("Sunday", true)]
    [InlineData("Saturday", false)]
    [InlineData("Wednesday", false)]
    public void First_day_of_week_validation(string value, bool valid)
    {
        var error = AccountSettingsValidator.ValidateFirstDayOfWeek(value);
        if (valid)
            Assert.Null(error);
        else
            Assert.Equal("Invalid first day of week", error);
    }

    // TC-06-UNIT-12: Timezone validation
    [Fact]
    public void Empty_timezone_is_required()
    {
        Assert.Equal("Timezone is required", AccountSettingsValidator.ValidateTimezone(""));
    }

    [Theory]
    [InlineData("America/New_York")]
    [InlineData("Europe/London")]
    public void Valid_timezone(string value)
    {
        Assert.Null(AccountSettingsValidator.ValidateTimezone(value));
    }

    // TC-06-UNIT-10: Phone number with missing country code
    [Fact]
    public void Phone_number_without_country_code_is_invalid()
    {
        Assert.Equal("Select a country code",
            AccountSettingsValidator.ValidatePhoneCountryCode("(555) 123-4567", null));
    }

    [Fact]
    public void Both_empty_is_valid()
    {
        Assert.Null(AccountSettingsValidator.ValidatePhoneCountryCode("", null));
        Assert.Null(AccountSettingsValidator.ValidatePhoneNumber("", null));
    }

    [Fact]
    public void Phone_number_with_country_code_is_valid()
    {
        Assert.Null(AccountSettingsValidator.ValidatePhoneCountryCode("(555) 123-4567", "US"));
        Assert.Null(AccountSettingsValidator.ValidatePhoneNumber("(555) 123-4567", "US"));
    }

    // TC-06-UNIT-03: Phone format per country code
    [Fact]
    public void Full_international_us_number_is_valid()
    {
        Assert.Null(AccountSettingsValidator.ValidatePhoneNumber("+1 (555) 123-4567", "US"));
    }

    [Fact]
    public void Too_short_us_number_is_invalid()
    {
        Assert.Equal("Enter a valid phone number", AccountSettingsValidator.ValidatePhoneNumber("12345", "US"));
    }

    [Fact]
    public void Empty_phone_is_optional_and_valid()
    {
        Assert.Null(AccountSettingsValidator.ValidatePhoneNumber("", null));
    }

    // TC-06-UNIT-04 covered via SignupValidator (shared rule) but exercised through ValidateAll below.

    private static UpdateAccountSettingsRequest ValidRequest() => new()
    {
        FirstName = "Pat",
        LastName = "Owner",
        Timezone = "America/New_York",
        FirstDayOfWeek = "Monday",
    };

    [Fact]
    public void ValidateAll_returns_no_errors_for_fully_valid_request()
    {
        var errors = AccountSettingsValidator.ValidateAll(ValidRequest());
        Assert.Empty(errors);
    }

    [Fact]
    public void ValidateAll_reports_firstName_error()
    {
        var request = ValidRequest();
        request.FirstName = "";
        var errors = AccountSettingsValidator.ValidateAll(request);
        Assert.Equal("First name is required", errors["firstName"]);
    }

    [Fact]
    public void ValidateAll_reports_lastName_error()
    {
        var request = ValidRequest();
        request.LastName = "";
        var errors = AccountSettingsValidator.ValidateAll(request);
        Assert.Equal("Last name is required", errors["lastName"]);
    }

    [Fact]
    public void ValidateAll_reports_timezone_error()
    {
        var request = ValidRequest();
        request.Timezone = "";
        var errors = AccountSettingsValidator.ValidateAll(request);
        Assert.Equal("Timezone is required", errors["timezone"]);
    }

    [Fact]
    public void ValidateAll_reports_firstDayOfWeek_error()
    {
        var request = ValidRequest();
        request.FirstDayOfWeek = "Saturday";
        var errors = AccountSettingsValidator.ValidateAll(request);
        Assert.Equal("Invalid first day of week", errors["firstDayOfWeek"]);
    }

    [Fact]
    public void ValidateAll_reports_phoneNumber_error_when_invalid_for_country()
    {
        var request = ValidRequest();
        request.PhoneCountryCode = "US";
        request.PhoneNumber = "12345";
        var errors = AccountSettingsValidator.ValidateAll(request);
        Assert.Equal("Enter a valid phone number", errors["phoneNumber"]);
    }

    [Fact]
    public void ValidateAll_clears_phone_when_both_null()
    {
        var request = ValidRequest();
        request.PhoneCountryCode = null;
        request.PhoneNumber = null;
        var errors = AccountSettingsValidator.ValidateAll(request);
        Assert.Empty(errors);
    }
}
