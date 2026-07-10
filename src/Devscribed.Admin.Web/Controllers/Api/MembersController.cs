using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Security;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Devscribed.Admin.Web.Controllers.Api;

[ApiController]
[Route("api/organizations/{orgId}/members")]
[Authorize]
public class MembersController : ControllerBase
{
    private readonly MembersService _membersService;

    public MembersController(MembersService membersService)
    {
        _membersService = membersService;
    }

    [HttpGet]
    public async Task<IActionResult> Get(Guid orgId, [FromQuery] string? search, [FromQuery] bool showRemoved = false)
    {
        if (!TryGetCallerContext(orgId, out var callerMembershipId, out var callerRole, out var errorResult))
            return errorResult!;

        var result = await _membersService.GetMembersAsync(orgId, callerMembershipId, callerRole, search, showRemoved);

        return Ok(new
        {
            members = result.Members.Select(m => new
            {
                id = m.Id,
                fullName = m.FullName,
                email = m.Email,
                role = m.Role,
                status = m.Status,
                joinedAt = m.JoinedAt,
                isLastAdmin = m.IsLastAdmin,
                isSelf = m.IsSelf,
            }),
            callerRole = result.CallerRole,
        });
    }

    [HttpGet("{memberId}")]
    public async Task<IActionResult> GetDetail(Guid orgId, Guid memberId)
    {
        if (!TryGetCallerContext(orgId, out _, out var callerRole, out var errorResult))
            return errorResult!;

        var result = await _membersService.GetDetailAsync(orgId, memberId, callerRole);
        if (result.Outcome == MemberDetailOutcome.NotFound)
            return NotFound(new { error = "not_found", message = "Member not found" });

        var dto = result.Dto!;
        return Ok(new
        {
            id = dto.Id,
            fullName = dto.FullName,
            email = dto.Email,
            role = dto.Role,
            status = dto.Status,
            joinedAt = dto.JoinedAt,
            jobTitle = dto.JobTitle,
            timezone = dto.Timezone,
            avatarInitials = dto.AvatarInitials,
            isLastAdmin = dto.IsLastAdmin,
            canEditRole = dto.CanEditRole,
            canEditJobTitle = dto.CanEditJobTitle,
            availableRoles = dto.AvailableRoles,
            callerRole = dto.CallerRole,
        });
    }

    [HttpDelete("{memberId}")]
    public async Task<IActionResult> Delete(Guid orgId, Guid memberId)
    {
        if (!TryGetCallerContext(orgId, out var callerMembershipId, out var callerRole, out var errorResult))
            return errorResult!;

        var result = await _membersService.DeleteAsync(orgId, memberId, callerMembershipId, callerRole);
        return MapResult(result);
    }

    [HttpPut("{memberId}")]
    public async Task<IActionResult> UpdateDetail(Guid orgId, Guid memberId, [FromBody] UpdateMemberRequest request)
    {
        if (!TryGetCallerContext(orgId, out _, out var callerRole, out var errorResult))
            return errorResult!;

        var result = await _membersService.UpdateDetailAsync(orgId, memberId, callerRole, request.Role, request.JobTitle);
        return MapResult(result);
    }

    [HttpPost("{memberId}/restore")]
    public async Task<IActionResult> Restore(Guid orgId, Guid memberId)
    {
        if (!TryGetCallerContext(orgId, out _, out var callerRole, out var errorResult))
            return errorResult!;

        var result = await _membersService.RestoreAsync(orgId, memberId, callerRole);
        return MapResult(result);
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

    private IActionResult MapResult(MemberActionResult result)
    {
        return result.Outcome switch
        {
            MemberActionOutcome.Success => Ok(new { success = true }),
            MemberActionOutcome.NotFound => NotFound(),
            MemberActionOutcome.Forbidden => StatusCode(403, new { error = result.ErrorCode ?? "forbidden", message = result.ErrorMessage }),
            MemberActionOutcome.Conflict => Conflict(new { error = result.ErrorCode, message = result.ErrorMessage }),
            MemberActionOutcome.BadRequest => BadRequest(new { error = result.ErrorCode, message = result.ErrorMessage }),
            MemberActionOutcome.FieldValidation => BadRequest(new { errors = result.FieldErrors }),
            _ => StatusCode(500),
        };
    }
}
