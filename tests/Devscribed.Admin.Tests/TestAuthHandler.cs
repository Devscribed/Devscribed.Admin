using System.Security.Claims;
using System.Text.Encodings.Web;
using Devscribed.Admin.Web.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Devscribed.Admin.Tests;

public class TestAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("X-Test-AccountId", out var accountId))
            return Task.FromResult(AuthenticateResult.NoResult());

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, accountId.ToString()),
            new(ClaimTypes.Email, Request.Headers["X-Test-Email"].ToString()),
            new(ClaimTypes.Role, Request.Headers["X-Test-Role"].ToString()),
            new(OrganizationAuth.OrganizationIdClaim, Request.Headers["X-Test-OrgId"].ToString()),
            new(OrganizationAuth.OrganizationNameClaim, Request.Headers["X-Test-OrgName"].ToString()),
            new(ClaimTypes.GivenName, Request.Headers["X-Test-FirstName"].ToString()),
            new(ClaimTypes.Surname, Request.Headers["X-Test-LastName"].ToString()),
        };

        var identity = new ClaimsIdentity(claims, "Test");
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, "Test");

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
