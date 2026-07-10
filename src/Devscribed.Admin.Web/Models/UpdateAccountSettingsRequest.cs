namespace Devscribed.Admin.Web.Models;

public class UpdateAccountSettingsRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? PhoneCountryCode { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Timezone { get; set; }
    public string? FirstDayOfWeek { get; set; }
}
