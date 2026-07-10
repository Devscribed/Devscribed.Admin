namespace Devscribed.Admin.Web.Models;

public static class VacationRequestStatuses
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
    public const string Cancelled = "cancelled";
}

public class VacationRequest
{
    public Guid Id { get; set; }
    public Guid MembershipId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public int WorkingDays { get; set; }
    public decimal DeductionAmount { get; set; }
    public string Status { get; set; } = VacationRequestStatuses.Pending;
    public DateTime RequestedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public Guid? ReviewedByAccountId { get; set; }
    public string? ReviewerComment { get; set; }
    public DateTime? CancelledAt { get; set; }
    public Guid? CancelledByAccountId { get; set; }
    public Membership Membership { get; set; } = null!;
}
