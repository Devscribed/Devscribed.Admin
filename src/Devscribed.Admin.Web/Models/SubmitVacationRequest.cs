namespace Devscribed.Admin.Web.Models;

public class SubmitVacationRequest
{
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
}

public class ReviewVacationRequest
{
    public string? Decision { get; set; }
    public string? Comment { get; set; }
}
