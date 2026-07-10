namespace Devscribed.Admin.Web.Models;

public class MemberFinancials
{
    public Guid Id { get; set; }
    public Guid MembershipId { get; set; }
    public decimal MonthlySalary { get; set; }
    public decimal ClientHourlyRate { get; set; }
    public decimal VacationReservePercent { get; set; }
    public bool IsReservePercentManual { get; set; }
    public int VacationDaysPerYear { get; set; } = 20;
    public string Currency { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
    public Guid UpdatedByAccountId { get; set; }

    public Membership Membership { get; set; } = null!;
}
