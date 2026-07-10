using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Security;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Devscribed.Admin.Web.Controllers.Api;

[ApiController]
[Route("api/account")]
[Authorize]
public class AccountController : ControllerBase
{
    private readonly AccountSettingsService _accountSettingsService;
    private readonly EmailChangeService _emailChangeService;
    private readonly ChangePasswordService _changePasswordService;

    public AccountController(
        AccountSettingsService accountSettingsService,
        EmailChangeService emailChangeService,
        ChangePasswordService changePasswordService)
    {
        _accountSettingsService = accountSettingsService;
        _emailChangeService = emailChangeService;
        _changePasswordService = changePasswordService;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var accountId = GetAccountId();
        var settings = await _accountSettingsService.GetSettingsAsync(accountId);
        if (settings == null)
            return Unauthorized();

        return Ok(new
        {
            email = settings.Email,
            firstName = settings.FirstName,
            lastName = settings.LastName,
            phoneCountryCode = settings.PhoneCountryCode,
            phoneNumber = settings.PhoneNumber,
            timezone = settings.Timezone,
            firstDayOfWeek = settings.FirstDayOfWeek,
        });
    }

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateAccountSettingsRequest request)
    {
        var accountId = GetAccountId();
        var result = await _accountSettingsService.UpdateSettingsAsync(accountId, request);

        if (!result.Succeeded)
            return BadRequest(new { errors = result.FieldErrors });

        return Ok(new { message = "Settings saved" });
    }

    [HttpPost("change-email")]
    public async Task<IActionResult> ChangeEmail([FromBody] ChangeEmailRequest request)
    {
        var accountId = GetAccountId();
        var appBaseUrl = $"{Request.Scheme}://{Request.Host}";
        var result = await _emailChangeService.RequestChangeAsync(accountId, request.NewEmail, appBaseUrl);

        if (!result.Succeeded)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { message = "A confirmation link has been sent to your new email address" });
    }

    [HttpPost("confirm-email")]
    [AllowAnonymous]
    public async Task<IActionResult> ConfirmEmail([FromBody] ConfirmEmailRequest request)
    {
        var result = await _emailChangeService.ConfirmAsync(request.Token);

        if (!result.Succeeded)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { message = "Your email has been updated" });
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var accountId = GetAccountId();
        var result = await _changePasswordService.ChangeAsync(accountId, request);

        if (!result.Succeeded)
            return BadRequest(new { message = result.ErrorMessage });

        await ReissueCookieWithNewSecurityStampAsync(result.NewSecurityStamp);

        return Ok(new { message = "Your password has been changed" });
    }

    private Guid GetAccountId()
    {
        var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return idClaim != null && Guid.TryParse(idClaim, out var id) ? id : Guid.Empty;
    }

    private async Task ReissueCookieWithNewSecurityStampAsync(Guid newSecurityStamp)
    {
        var existingClaims = User.Claims.Where(c => c.Type != AppClaimTypes.SecurityStamp);
        var claims = new List<Claim>(existingClaims)
        {
            new(AppClaimTypes.SecurityStamp, newSecurityStamp.ToString()),
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity));
    }
}
