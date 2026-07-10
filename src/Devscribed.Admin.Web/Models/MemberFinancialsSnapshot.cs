namespace Devscribed.Admin.Web.Models;

public class MemberFinancialsSnapshot
{
    public Guid Id { get; set; }
    public Guid MembershipId { get; set; }
    public decimal MonthlySalary { get; set; }
    public decimal ClientHourlyRate { get; set; }
    public decimal VacationReservePercent { get; set; }
    public bool IsReservePercentManual { get; set; }
    public int VacationDaysPerYear { get; set; }
    public string Currency { get; set; } = string.Empty;
    public DateOnly EffectiveFrom { get; set; }
    public DateTime CreatedAt { get; set; }
}
