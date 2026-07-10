using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Devscribed.Admin.Web.Controllers.Api;

[ApiController]
[Route("api/forgot-password")]
public class ForgotPasswordController : ControllerBase
{
    private readonly PasswordResetService _passwordResetService;

    public ForgotPasswordController(PasswordResetService passwordResetService)
    {
        _passwordResetService = passwordResetService;
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] ForgotPasswordRequest request)
    {
        var resetUrlBase = $"{Request.Scheme}://{Request.Host}";
        var result = await _passwordResetService.RequestResetAsync(request.Email, resetUrlBase);

        if (!result.Succeeded)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { message = "If an account exists, a reset link has been sent" });
    }
}
