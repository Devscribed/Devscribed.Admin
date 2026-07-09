using Devscribed.Admin.Web.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Devscribed.Admin.Web.Pages.Members;

[Authorize]
public class IndexModel : PageModel
{
    private readonly AppDbContext _db;

    public IndexModel(AppDbContext db)
    {
        _db = db;
    }

    public List<MemberViewModel> Members { get; set; } = new();

    public async Task<IActionResult> OnGetAsync()
    {
        var orgIdClaim = User.FindFirstValue("OrganizationId");
        if (orgIdClaim == null || !Guid.TryParse(orgIdClaim, out var orgId))
            return RedirectToPage("/Login");

        Members = await _db.Memberships
            .Where(m => m.OrganizationId == orgId)
            .Include(m => m.Account)
            .Select(m => new MemberViewModel
            {
                Id = m.Id,
                FirstName = m.Account.FirstName,
                LastName = m.Account.LastName,
                Email = m.Account.Email,
                Role = m.Role,
                Status = m.Status,
            })
            .ToListAsync();

        return Page();
    }
}

public class MemberViewModel
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}
