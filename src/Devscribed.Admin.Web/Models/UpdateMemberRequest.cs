namespace Devscribed.Admin.Web.Models;

public class UpdateMemberRequest
{
    public string Role { get; set; } = string.Empty;
    public string? JobTitle { get; set; }
}
