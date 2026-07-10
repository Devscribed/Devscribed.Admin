namespace Devscribed.Admin.Web.Validation;

public static class JobTitleValidator
{
    public const int MaxLength = 100;

    /// <summary>
    /// Returns an error message if the job title is invalid, or null if valid.
    /// Job title is optional (may be empty/cleared).
    /// </summary>
    public static string? Validate(string? jobTitle)
    {
        if (string.IsNullOrEmpty(jobTitle))
            return null;

        return jobTitle.Length > MaxLength
            ? "Job title must be at most 100 characters"
            : null;
    }
}
