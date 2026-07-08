namespace Devscribed.Admin.Application.Signup;

public record SignupRequest(
    string OrganizationName,
    string FirstName,
    string LastName,
    string Email,
    string Password);
