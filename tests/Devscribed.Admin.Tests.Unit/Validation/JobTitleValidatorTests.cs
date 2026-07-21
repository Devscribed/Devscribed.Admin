using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class JobTitleValidatorTests
{
    [Fact]
    public void Exactly_100_characters_is_valid()
    {
        var result = JobTitleValidator.Validate(new string('a', 100));

        Assert.True(result.IsValid);
        Assert.Equal(new string('a', 100), result.NormalizedValue);
    }

    [Fact]
    public void Over_100_characters_is_invalid()
    {
        var result = JobTitleValidator.Validate(new string('a', 101));

        Assert.False(result.IsValid);
        Assert.Equal("Job title must be at most 100 characters", result.ErrorMessage);
    }

    [Fact]
    public void Empty_string_is_valid()
    {
        var result = JobTitleValidator.Validate("");

        Assert.True(result.IsValid);
        Assert.Equal("", result.NormalizedValue);
    }

    [Fact]
    public void Null_is_valid_and_normalizes_to_empty()
    {
        var result = JobTitleValidator.Validate(null);

        Assert.True(result.IsValid);
        Assert.Equal("", result.NormalizedValue);
    }

    [Fact]
    public void Whitespace_only_is_valid_and_trims_to_empty()
    {
        var result = JobTitleValidator.Validate("   ");

        Assert.True(result.IsValid);
        Assert.Equal("", result.NormalizedValue);
    }

    [Fact]
    public void Valid_job_title_is_trimmed()
    {
        var result = JobTitleValidator.Validate("  Backend Engineer  ");

        Assert.True(result.IsValid);
        Assert.Equal("Backend Engineer", result.NormalizedValue);
    }
}
