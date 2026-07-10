namespace Devscribed.Admin.Web.Validation;

public static class VacationRequestValidator
{
    public static string? ValidateStartDate(DateOnly? startDate, DateOnly today)
    {
        if (startDate is null) return "Start date must be today or later";
        return startDate.Value >= today ? null : "Start date must be today or later";
    }

    public static string? ValidateEndDate(DateOnly? startDate, DateOnly? endDate)
    {
        if (endDate is null) return "End date must be on or after start date";
        if (startDate is null) return null;
        return endDate.Value >= startDate.Value ? null : "End date must be on or after start date";
    }

    public static bool IsCrossYear(DateOnly startDate, DateOnly endDate) =>
        startDate.Year != endDate.Year;

    public static bool Overlaps(DateOnly aStart, DateOnly aEnd, DateOnly bStart, DateOnly bEnd) =>
        aStart <= bEnd && bStart <= aEnd;

    public static string? ValidateReviewerComment(string? comment)
    {
        if (comment != null && comment.Length > 500)
            return "Comment must be at most 500 characters";
        return null;
    }
}
