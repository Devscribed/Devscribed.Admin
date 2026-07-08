using System.Security.Claims;
using Devscribed.Admin.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Devscribed.Admin.Web.Auth;

public static class OrganizationAuth
{
    public const string OrganizationIdClaim = "org_id";
    public const string OrganizationNameClaim = "org_name";

    public static Task SignInAsync(HttpContext http, Account account, Organization organization, Membership membership)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, account.Id.ToString()),
            new(ClaimTypes.Email, account.Email),
            new(ClaimTypes.GivenName, account.FirstName),
            new(ClaimTypes.Surname, account.LastName),
            new(ClaimTypes.Role, membership.Role.ToString()),
            new(OrganizationIdClaim, organization.Id.ToString()),
            new(OrganizationNameClaim, organization.Name)
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        return http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
    }

    public static Guid GetOrganizationId(ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(OrganizationIdClaim)!);

    public static string? GetOrganizationName(ClaimsPrincipal user) =>
        user.FindFirstValue(OrganizationNameClaim);
}
