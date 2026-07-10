namespace Devscribed.Admin.Web.Models;

public class AcceptInviteRequest
{
    public string Token { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string Password { get; set; } = string.Empty;
    public string? Timezone { get; set; }
    public bool OrgSwitchConfirmed { get; set; }
}
