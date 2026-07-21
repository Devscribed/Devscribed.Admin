namespace Devscribed.Admin.Api.AccountSettings;

public record UpdateSettingsRequest(
    string? FirstName,
    string? LastName,
    string? PhoneCountryCode,
    string? PhoneNumber,
    string? Timezone,
    string? FirstDayOfWeek);

public record ChangeEmailRequest(string? NewEmail);

public record ConfirmEmailRequest(string? Token);

public record ChangePasswordRequest(
    string? CurrentPassword,
    string? NewPassword,
    string? PasswordConfirmation);
