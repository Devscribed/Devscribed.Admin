namespace Devscribed.Admin.Web.Models;

public class ChangePasswordRequest
{
    public string? CurrentPassword { get; set; }
    public string? NewPassword { get; set; }
    public string? PasswordConfirmation { get; set; }
}
