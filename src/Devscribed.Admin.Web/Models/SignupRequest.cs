namespace Devscribed.Admin.Web.Models;

public class SignupRequest
{
    public string OrgName { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Timezone { get; set; }
}
