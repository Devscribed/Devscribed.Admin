namespace Devscribed.Admin.Domain.Entities;

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
    public string SecurityStamp { get; set; } = Guid.NewGuid().ToString();
    public DateTime CreatedAt { get; set; }
}
