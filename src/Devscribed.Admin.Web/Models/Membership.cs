namespace Devscribed.Admin.Web.Models;

public class Membership
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public Guid OrganizationId { get; set; }
    public string Role { get; set; } = "admin";
    public string Status { get; set; } = "active";
    public DateTime JoinedAt { get; set; }

    public Account Account { get; set; } = null!;
    public Organization Organization { get; set; } = null!;
}
