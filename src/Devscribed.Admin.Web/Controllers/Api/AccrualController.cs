using Devscribed.Admin.Web.Security;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Globalization;
using System.Security.Claims;

namespace Devscribed.Admin.Web.Controllers.Api;

public class AccrualRunRequest
{
    public int Month { get; set; }
    public int Year { get; set; }
}

[ApiController]
[Route("api/admin/accrual")]
[Authorize]
public class AccrualController : ControllerBase
{
    private readonly VacationAccrualService _accrualService;

    public AccrualController(VacationAccrualService accrualService)
    {
        _accrualService = accrualService;
    }

    [HttpPost("run")]
    public async Task<IActionResult> Run([FromBody] AccrualRunRequest request)
    {
        var orgIdClaim = User.FindFirstValue(AppClaimTypes.OrganizationId);
        var role = User.FindFirstValue(ClaimTypes.Role);

        if (orgIdClaim == null || !Guid.TryParse(orgIdClaim, out var orgId) || role == null)
            return Unauthorized();

        if (role != "admin")
            return StatusCode(403, new { error = "forbidden", message = "Only admins can trigger manual accrual" });

        if (request.Month < 1 || request.Month > 12)
            return BadRequest(new { error = "invalid_month", message = "Month must be between 1 and 12" });

        var now = DateTime.UtcNow;
        if (request.Year > now.Year || (request.Year == now.Year && request.Month > now.Month))
            return BadRequest(new { error = "future_period", message = "Cannot run accrual for a future billing period" });

        var result = await _accrualService.RunAsync(orgId, request.Month, request.Year);

        var monthName = CultureInfo.InvariantCulture.DateTimeFormat.GetMonthName(request.Month);

        return Ok(new
        {
            success = true,
            billingPeriod = $"{monthName} {request.Year}",
            processed = result.Processed,
            creditsCreated = result.CreditsCreated,
            skipped = result.Skipped,
        });
    }
}
