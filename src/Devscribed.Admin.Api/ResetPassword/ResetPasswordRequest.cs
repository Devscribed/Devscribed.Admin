namespace Devscribed.Admin.Api.ResetPassword;

public record ResetPasswordRequest(string? Token, string? Password, string? PasswordConfirmation);
