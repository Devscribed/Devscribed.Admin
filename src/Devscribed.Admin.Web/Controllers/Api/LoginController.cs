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
public class LoginController : ControllerBase
{
    private readonly LoginService _loginService;

    public LoginController(LoginService loginService)
    {
        _loginService = loginService;
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] LoginRequest request)
    {
        var result = await _loginService.LoginAsync(request);

        if (!result.Succeeded)
            return BadRequest(new { message = result.ErrorMessage });

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, result.AccountId.ToString()),
            new(AppClaimTypes.OrganizationId, result.OrganizationId.ToString()),
            new(ClaimTypes.Role, result.Role),
            new(AppClaimTypes.SecurityStamp, result.SecurityStamp.ToString()),
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity));

        return Ok(new { accountId = result.AccountId });
    }
}
