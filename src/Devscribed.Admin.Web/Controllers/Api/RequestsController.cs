using Devscribed.Admin.Web.Security;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Devscribed.Admin.Web.Controllers.Api;

[ApiController]
[Route("api/organizations/{orgId}/requests")]
[Authorize]
public class RequestsController : ControllerBase
{
    private readonly RequestsService _requestsService;

    public RequestsController(RequestsService requestsService)
    {
        _requestsService = requestsService;
    }

    [HttpGet]
    public async Task<IActionResult> Get(Guid orgId, [FromQuery] string? status, [FromQuery] string? type)
    {
        if (!TryGetCallerContext(orgId, out var callerMembershipId, out var callerRole, out var errorResult))
            return errorResult!;

        var result = await _requestsService.GetRequestsAsync(orgId, callerMembershipId, callerRole, status, type);

        if (result.Outcome == RequestsFetchOutcome.Forbidden)
            return StatusCode(403, new { error = "forbidden", message = result.ErrorMessage });

        return Ok(new
        {
            requests = result.Requests.Select(r => new
            {
                id = r.Id,
                type = r.Type,
                member = new
                {
                    membershipId = r.MembershipId,
                    firstName = r.FirstName,
                    lastName = r.LastName,
                    initials = r.Initials,
                    avatarUrl = (string?)null,
                },
                startDate = r.StartDate,
                endDate = r.EndDate,
                workingDays = r.WorkingDays,
                deductionAmount = r.DeductionAmount,
                status = r.Status,
                requestedAt = r.RequestedAt,
                reviewedAt = r.ReviewedAt,
                reviewedBy = r.ReviewedBy,
                reviewerComment = r.ReviewerComment,
                cancelledAt = r.CancelledAt,
                cancelledBy = r.CancelledBy,
                isOwnRequest = r.IsOwnRequest,
                memberBalance = new
                {
                    availableDays = r.MemberBalance.AvailableDays,
                    usedDays = r.MemberBalance.UsedDays,
                    pendingDays = r.MemberBalance.PendingDays,
                    totalDaysPerYear = r.MemberBalance.TotalDaysPerYear,
                },
            }),
            pendingCount = result.PendingCount,
            totalCount = result.TotalCount,
        });
    }

    private bool TryGetCallerContext(Guid orgId, out Guid callerMembershipId, out string callerRole, out IActionResult? errorResult)
    {
        callerMembershipId = Guid.Empty;
        callerRole = string.Empty;
        errorResult = null;

        var orgIdClaim = User.FindFirstValue(AppClaimTypes.OrganizationId);
        var membershipIdClaim = User.FindFirstValue(AppClaimTypes.MembershipId);
        var role = User.FindFirstValue(ClaimTypes.Role);

        if (orgIdClaim == null || !Guid.TryParse(orgIdClaim, out var callerOrgId)
            || membershipIdClaim == null || !Guid.TryParse(membershipIdClaim, out var membershipId)
            || role == null)
        {
            errorResult = Unauthorized();
            return false;
        }

        if (callerOrgId != orgId)
        {
            errorResult = Forbid();
            return false;
        }

        callerMembershipId = membershipId;
        callerRole = role;
        return true;
    }
}
