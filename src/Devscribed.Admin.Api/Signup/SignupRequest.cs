namespace Devscribed.Admin.Api.Signup;

public record SignupRequest(
    string? OrgName,
    string? FirstName,
    string? LastName,
    string? Email,
    string? Password,
    string? Timezone);
