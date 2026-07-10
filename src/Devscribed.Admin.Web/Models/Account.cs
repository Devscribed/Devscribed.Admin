namespace Devscribed.Admin.Web.Models;

public class Account
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Timezone { get; set; }
    public string? PhoneCountryCode { get; set; }
    public string? PhoneNumber { get; set; }
    public string FirstDayOfWeek { get; set; } = "Monday";
    public DateTime CreatedAt { get; set; }
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();

    public Membership? Membership { get; set; }
}
