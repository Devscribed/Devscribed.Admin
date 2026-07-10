using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class JobTitleValidatorTests
{
    // TC-05-UNIT-01: Job title validation (max length)
    [Fact]
    public void Job_title_at_100_chars_is_valid()
    {
        var value = new string('a', 100);

        Assert.Null(JobTitleValidator.Validate(value));
    }

    [Fact]
    public void Job_title_at_101_chars_is_invalid()
    {
        var value = new string('a', 101);

        Assert.Equal("Job title must be at most 100 characters", JobTitleValidator.Validate(value));
    }

    // TC-05-UNIT-02: Job title allows empty (clearing)
    [Fact]
    public void Job_title_empty_is_valid()
    {
        Assert.Null(JobTitleValidator.Validate(""));
        Assert.Null(JobTitleValidator.Validate(null));
    }
}
