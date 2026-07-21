using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class PhoneValidatorTests
{
    [Fact]
    public void Valid_US_phone_number_is_accepted()
    {
        var errors = PhoneValidator.Validate("US", "+1 (555) 123-4567");

        Assert.Empty(errors);
    }

    [Fact]
    public void Too_short_US_phone_number_is_rejected()
    {
        var errors = PhoneValidator.Validate("US", "12345");

        Assert.Single(errors);
        Assert.Equal("Enter a valid phone number", errors["phoneNumber"]);
    }

    [Fact]
    public void Empty_phone_is_valid_optional()
    {
        var errors = PhoneValidator.Validate(null, null);

        Assert.Empty(errors);
    }

    [Fact]
    public void Both_empty_strings_is_valid()
    {
        var errors = PhoneValidator.Validate("", "");

        Assert.Empty(errors);
    }

    [Fact]
    public void Phone_number_without_country_code_is_rejected()
    {
        var errors = PhoneValidator.Validate(null, "(555) 123-4567");

        Assert.Single(errors);
        Assert.Equal("Select a country code", errors["phoneCountryCode"]);
    }

    [Fact]
    public void Phone_number_with_empty_country_code_is_rejected()
    {
        var errors = PhoneValidator.Validate("", "(555) 123-4567");

        Assert.Single(errors);
        Assert.Equal("Select a country code", errors["phoneCountryCode"]);
    }

    [Fact]
    public void Country_code_without_phone_number_is_valid()
    {
        // Country code provided but no number — treat as clearing
        var errors = PhoneValidator.Validate("US", "");

        Assert.Empty(errors);
    }
}
