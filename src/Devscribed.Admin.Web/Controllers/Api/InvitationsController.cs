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
[Route("api/invitations")]
public class InvitationsController : ControllerBase
{
    private readonly InvitationService _invitationService;

    public InvitationsController(InvitationService invitationService)
    {
        _invitationService = invitationService;
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Post([FromBody] InviteRequest request)
    {
        var inviterEmail = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("Email");
        var inviterRole = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        var orgIdClaim = User.FindFirstValue(AppClaimTypes.OrganizationId);
        var membershipIdClaim = User.FindFirstValue(AppClaimTypes.MembershipId);

        if (orgIdClaim == null || !Guid.TryParse(orgIdClaim, out var organizationId)
            || membershipIdClaim == null || !Guid.TryParse(membershipIdClaim, out var membershipId)
            || inviterEmail == null)
        {
            return Unauthorized();
        }

        var inviteUrlBase = $"{Request.Scheme}://{Request.Host}";
        var result = await _invitationService.CreateInvitationAsync(
            inviterEmail, inviterRole, membershipId, organizationId, request, inviteUrlBase);

        if (!result.Succeeded)
        {
            if (result.Forbidden)
                return StatusCode(403, new { message = result.ErrorMessage });
            return BadRequest(new { message = result.ErrorMessage });
        }

        return Ok(new { message = "Invitation sent" });
    }

    [HttpGet("{token}/validate")]
    public async Task<IActionResult> Validate(string token)
    {
        var result = await _invitationService.ValidateTokenAsync(token);

        if (!result.Succeeded)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new
        {
            organizationName = result.OrganizationName,
            email = result.Email,
            role = result.Role,
            accountExists = result.AccountExists,
            orgSwitch = result.OrgSwitch,
            oldOrganizationName = result.OldOrganizationName,
            lastAdmin = result.LastAdmin,
        });
    }

    [HttpPost("accept")]
    public async Task<IActionResult> Accept([FromBody] AcceptInviteRequest request)
    {
        var result = await _invitationService.AcceptAsync(request);

        if (!result.Succeeded)
        {
            if (result.OrgSwitchConfirmationRequired)
            {
                return Conflict(new
                {
                    message = "org_switch_confirmation_required",
                    oldOrganizationName = result.OldOrganizationName,
                    lastAdmin = result.LastAdmin,
                });
            }

            if (result.FieldErrors != null)
                return BadRequest(new { errors = result.FieldErrors });

            return BadRequest(new { message = result.ErrorMessage });
        }

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

        return Ok(new { accountId = result.AccountId, redirectTo = "/members" });
    }
}
