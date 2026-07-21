using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class FirstDayOfWeekValidatorTests
{
    [Fact]
    public void Monday_is_valid()
    {
        var result = FirstDayOfWeekValidator.Validate("Monday");

        Assert.True(result.IsValid);
        Assert.Equal("Monday", result.NormalizedValue);
    }

    [Fact]
    public void Sunday_is_valid()
    {
        var result = FirstDayOfWeekValidator.Validate("Sunday");

        Assert.True(result.IsValid);
        Assert.Equal("Sunday", result.NormalizedValue);
    }

    [Theory]
    [InlineData("Saturday")]
    [InlineData("Wednesday")]
    [InlineData("")]
    [InlineData(null)]
    public void Invalid_values_are_rejected(string? value)
    {
        var result = FirstDayOfWeekValidator.Validate(value);

        Assert.False(result.IsValid);
        Assert.Equal("Invalid first day of week", result.ErrorMessage);
    }
}
