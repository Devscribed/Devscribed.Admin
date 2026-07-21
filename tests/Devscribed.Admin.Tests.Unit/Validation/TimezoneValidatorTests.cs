using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class TimezoneValidatorTests
{
    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("   ")]
    public void Empty_or_null_timezone_is_invalid(string? value)
    {
        var result = TimezoneValidator.Validate(value);

        Assert.False(result.IsValid);
        Assert.Equal("Timezone is required", result.ErrorMessage);
    }

    [Theory]
    [InlineData("America/New_York")]
    [InlineData("Europe/London")]
    [InlineData("Asia/Tokyo")]
    public void Valid_timezone_strings_are_accepted(string value)
    {
        var result = TimezoneValidator.Validate(value);

        Assert.True(result.IsValid);
        Assert.Equal(value, result.NormalizedValue);
    }
}
