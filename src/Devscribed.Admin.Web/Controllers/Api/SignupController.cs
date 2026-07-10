using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Security;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Devscribed.Admin.Web.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
public class SignupController : ControllerBase
{
    private readonly SignupService _signupService;

    public SignupController(SignupService signupService)
    {
        _signupService = signupService;
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] SignupRequest request)
    {
        var result = await _signupService.SignupAsync(request);

        if (!result.Succeeded)
        {
            if (result.Errors != null)
                return BadRequest(new { errors = result.Errors });

            return BadRequest(new { message = result.ErrorMessage });
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, result.AccountId!.Value.ToString()),
            new(AppClaimTypes.OrganizationId, result.OrganizationId!.Value.ToString()),
            new(AppClaimTypes.MembershipId, result.MembershipId!.Value.ToString()),
            new(ClaimTypes.Role, "admin"),
            new(ClaimTypes.Email, result.Email),
            new(AppClaimTypes.SecurityStamp, result.SecurityStamp.ToString()),
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity));

        return Ok(new { accountId = result.AccountId, organizationId = result.OrganizationId });
    }
}
