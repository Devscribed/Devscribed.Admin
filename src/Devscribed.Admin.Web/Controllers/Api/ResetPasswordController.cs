using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Devscribed.Admin.Web.Controllers.Api;

[ApiController]
[Route("api/reset-password")]
public class ResetPasswordController : ControllerBase
{
    private readonly PasswordResetService _passwordResetService;

    public ResetPasswordController(PasswordResetService passwordResetService)
    {
        _passwordResetService = passwordResetService;
    }

    [HttpGet("validate")]
    public async Task<IActionResult> Validate([FromQuery] string? token)
    {
        var valid = await _passwordResetService.IsTokenValidAsync(token);
        return Ok(new { valid });
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] ResetPasswordRequest request)
    {
        var result = await _passwordResetService.ResetPasswordAsync(request);

        if (!result.Succeeded)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { message = "Your password has been reset" });
    }
}
