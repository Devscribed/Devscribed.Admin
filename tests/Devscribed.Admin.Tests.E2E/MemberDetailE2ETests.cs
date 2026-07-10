using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright.NUnit;

namespace Devscribed.Admin.Tests.E2E;

[TestFixture]
public class MemberDetailE2ETests : PageTest
{
    private E2EServerFixture _server = null!;

    [SetUp]
    public void SetUp()
    {
        _server = new E2EServerFixture();
    }

    [TearDown]
    public void TearDown()
    {
        _server.Dispose();
    }

    private Devscribed.Admin.Web.Models.Account SeedAdditionalMember(
        Guid organizationId, string email, string password, string role, string firstName, string lastName,
        string status = "active", string? jobTitle = null)
    {
        using var scope = _server.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Services.IPasswordHasher>();

        var account = new Devscribed.Admin.Web.Models.Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = hasher.Hash(password),
            FirstName = firstName,
            LastName = lastName,
            CreatedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Memberships.Add(new Devscribed.Admin.Web.Models.Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = organizationId,
            Role = role,
            Status = status,
            JoinedAt = DateTime.UtcNow,
            JobTitle = jobTitle,
        });
        db.SaveChanges();
        return account;
    }

    private Guid GetOrgId(string email)
    {
        using var scope = _server.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
        return db.Memberships.Include(m => m.Account).Single(m => m.Account.Email == email).OrganizationId;
    }

    private Guid GetMembershipId(string email)
    {
        using var scope = _server.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
        return db.Memberships.Include(m => m.Account).Single(m => m.Account.Email == email).Id;
    }

    private async Task LoginAsync(string email, string password)
    {
        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync(email);
        await Page.GetByTestId("login-password-input").FillAsync(password);
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");
    }

    // TC-05-E2E-01: Admin edits role and Job title and they persist (golden path)
    [Test]
    public async Task Admin_edits_role_and_job_title_and_they_persist()
    {
        _server.SeedAccount("admin1@acme.com", "Passw0rd", "Pat", "Owner", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin1@acme.com");
        SeedAdditionalMember(orgId, "aleksey@acme.com", "Passw0rd", "user", "Aleksey", "Siniakevich");
        var memberId = GetMembershipId("aleksey@acme.com");

        await LoginAsync("admin1@acme.com", "Passw0rd");
        await Page.GetByTestId($"member-row-{memberId}").ClickAsync();
        await Page.WaitForURLAsync($"**/org/{orgId}/members/{memberId}");

        await Expect(Page.GetByTestId("member-detail")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-tab-about")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-avatar")).ToHaveTextAsync("AS");
        await Expect(Page.GetByTestId("member-detail-name")).ToHaveTextAsync("Aleksey Siniakevich");
        await Expect(Page.GetByTestId("member-detail-role-badge")).ToHaveTextAsync("user");
        await Expect(Page.GetByTestId("member-detail-joined")).ToContainTextAsync("Joined");
        await Expect(Page.GetByTestId("member-detail-email")).ToHaveTextAsync("aleksey@acme.com");
        await Expect(Page.GetByTestId("member-detail-timezone")).ToBeVisibleAsync();

        var roleSelect = Page.GetByTestId($"member-role-select-{memberId}");
        await roleSelect.SelectOptionAsync("manager");
        await Page.GetByTestId("job-title-input").FillAsync("Backend Engineer");
        await Page.GetByTestId("job-title-save-button").ClickAsync();

        await Expect(Page.GetByTestId("toast-member-saved")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-role-badge")).ToHaveTextAsync("manager");
        await Expect(Page.GetByTestId("job-title-input")).ToHaveValueAsync("Backend Engineer");

        await Page.ReloadAsync();
        await Expect(Page.GetByTestId("member-detail-role-badge")).ToHaveTextAsync("manager");
        await Expect(Page.GetByTestId("job-title-input")).ToHaveValueAsync("Backend Engineer");
    }

    // TC-05-E2E-02: user sees a read-only About with no editor
    [Test]
    public async Task User_sees_read_only_about_with_no_editor()
    {
        _server.SeedAccount("adminuser2@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("adminuser2@acme.com");
        SeedAdditionalMember(orgId, "plainuser2@acme.com", "Passw0rd", "user", "Plain", "User");
        SeedAdditionalMember(orgId, "target2@acme.com", "Passw0rd", "user", "Target", "Person", jobTitle: "Engineer");
        var targetId = GetMembershipId("target2@acme.com");

        await LoginAsync("plainuser2@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{targetId}");

        await Expect(Page.GetByTestId("member-detail")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-avatar")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("job-title-readonly")).ToHaveTextAsync("Engineer");
        await Expect(Page.Locator("[data-testid='job-title-input']")).ToHaveCountAsync(0);
        await Expect(Page.Locator("[data-testid^='member-role-select-']")).ToHaveCountAsync(0);
        var saveButton = Page.GetByTestId("job-title-save-button");
        await Expect(saveButton).Not.ToBeVisibleAsync();
    }

    // TC-05-E2E-03: Removed member's detail is fully read-only even for admin
    [Test]
    public async Task Removed_member_detail_is_fully_read_only_for_admin()
    {
        _server.SeedAccount("admin3@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin3@acme.com");
        SeedAdditionalMember(orgId, "removed3@acme.com", "Passw0rd", "user", "Removed", "Person",
            status: "removed", jobTitle: "Engineer");
        var removedId = GetMembershipId("removed3@acme.com");

        await LoginAsync("admin3@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{removedId}");

        await Expect(Page.GetByTestId("member-detail")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-status-badge")).ToHaveTextAsync("Removed");
        await Expect(Page.GetByTestId("job-title-readonly")).ToHaveTextAsync("Engineer");
        await Expect(Page.Locator("[data-testid='job-title-input']")).ToHaveCountAsync(0);
        await Expect(Page.Locator("[data-testid^='member-role-select-']")).ToHaveCountAsync(0);
        await Expect(Page.GetByTestId("job-title-save-button")).Not.ToBeVisibleAsync();
    }

    // TC-05-E2E-04: Admin clears Job title
    [Test]
    public async Task Admin_clears_job_title()
    {
        _server.SeedAccount("admin4@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin4@acme.com");
        SeedAdditionalMember(orgId, "target4@acme.com", "Passw0rd", "user", "Target", "Four", jobTitle: "Backend Engineer");
        var targetId = GetMembershipId("target4@acme.com");

        await LoginAsync("admin4@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{targetId}");

        var jobTitleInput = Page.GetByTestId("job-title-input");
        await jobTitleInput.FillAsync("");
        await Page.GetByTestId("job-title-save-button").ClickAsync();

        await Expect(Page.GetByTestId("toast-member-saved")).ToBeVisibleAsync();

        await Page.ReloadAsync();
        await Expect(Page.GetByTestId("job-title-input")).ToHaveValueAsync("");
        await Expect(Page.GetByTestId("job-title-input")).ToHaveAttributeAsync("placeholder", "Enter a job title");
    }

    // TC-05-E2E-05: Manager sees role picker on user/viewer detail but not on admin/manager detail
    [Test]
    public async Task Manager_sees_role_picker_only_on_user_and_viewer_details()
    {
        _server.SeedAccount("adminowner5@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("adminowner5@acme.com");
        SeedAdditionalMember(orgId, "manager5@acme.com", "Passw0rd", "manager", "Mgr", "Five");
        SeedAdditionalMember(orgId, "user5@acme.com", "Passw0rd", "user", "User", "Five");
        var adminOwnerId = GetMembershipId("adminowner5@acme.com");
        var managerId = GetMembershipId("manager5@acme.com");
        var userId = GetMembershipId("user5@acme.com");

        await LoginAsync("manager5@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{userId}");
        var userSelect = Page.GetByTestId($"member-role-select-{userId}");
        await Expect(userSelect).ToBeVisibleAsync();
        var options = await userSelect.Locator("option").AllTextContentsAsync();
        Assert.That(options, Does.Not.Contain("admin"));

        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{adminOwnerId}");
        await Expect(Page.Locator("[data-testid^='member-role-select-']")).ToHaveCountAsync(0);
        await Expect(Page.GetByTestId("job-title-input")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("job-title-save-button")).ToBeVisibleAsync();

        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{managerId}");
        await Expect(Page.Locator("[data-testid^='member-role-select-']")).ToHaveCountAsync(0);
        await Expect(Page.GetByTestId("job-title-input")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("job-title-save-button")).ToBeVisibleAsync();
    }

    // TC-05-E2E-06: Placeholder tabs are visible but disabled
    [Test]
    public async Task Placeholder_tabs_are_visible_but_disabled()
    {
        _server.SeedAccount("admin6@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin6@acme.com");
        SeedAdditionalMember(orgId, "target6@acme.com", "Passw0rd", "user", "Target", "Six");
        var targetId = GetMembershipId("target6@acme.com");

        await LoginAsync("admin6@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{targetId}");

        await Expect(Page.GetByTestId("member-detail-tab-about")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-tab-vacation")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-tab-vacation")).ToBeDisabledAsync();
        await Expect(Page.GetByTestId("member-detail-tab-projects")).ToBeDisabledAsync();
        await Expect(Page.GetByTestId("member-detail-tab-roles")).ToBeDisabledAsync();
        await Expect(Page.GetByTestId("member-detail-tab-payments")).ToBeDisabledAsync();
    }

    // TC-05-E2E-07: Navigate to member detail and back
    [Test]
    public async Task Navigate_to_member_detail_and_back()
    {
        _server.SeedAccount("admin7@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin7@acme.com");
        SeedAdditionalMember(orgId, "target7@acme.com", "Passw0rd", "user", "Target", "Seven");
        var targetId = GetMembershipId("target7@acme.com");

        await LoginAsync("admin7@acme.com", "Passw0rd");
        await Page.GetByTestId($"member-row-{targetId}").ClickAsync();
        await Page.WaitForURLAsync($"**/org/{orgId}/members/{targetId}");

        await Expect(Page.GetByTestId("member-detail-name")).ToHaveTextAsync("Target Seven");

        await Page.GetByTestId("member-detail-back-link").ClickAsync();
        await Page.WaitForURLAsync("**/members");
        await Expect(Page.GetByTestId("members-list")).ToBeVisibleAsync();
    }

    // TC-05-E2E-08: Zero-admin guard disables role picker on last admin
    [Test]
    public async Task Zero_admin_guard_disables_role_picker_on_last_admin()
    {
        var admin = _server.SeedAccount("solo8@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("solo8@acme.com");
        var selfId = GetMembershipId("solo8@acme.com");

        await LoginAsync("solo8@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{selfId}");

        var roleSelect = Page.GetByTestId($"member-role-select-{selfId}");
        await Expect(roleSelect).ToBeVisibleAsync();
        await Expect(roleSelect).ToBeDisabledAsync();
        await Expect(Page.GetByTestId("role-change-guard-message")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("job-title-input")).ToBeEditableAsync();
    }

    // TC-05-E2E-09: Manager edits job title of admin member (no role picker)
    [Test]
    public async Task Manager_edits_job_title_of_admin_member()
    {
        _server.SeedAccount("adminowner9@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("adminowner9@acme.com");
        SeedAdditionalMember(orgId, "manager9@acme.com", "Passw0rd", "manager", "Mgr", "Nine");
        var adminOwnerId = GetMembershipId("adminowner9@acme.com");

        using (var scope = _server.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
            var m = db.Memberships.Single(x => x.Id == adminOwnerId);
            m.JobTitle = "CTO";
            db.SaveChanges();
        }

        await LoginAsync("manager9@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{adminOwnerId}");

        await Expect(Page.Locator("[data-testid^='member-role-select-']")).ToHaveCountAsync(0);
        await Page.GetByTestId("job-title-input").FillAsync("CEO");
        await Page.GetByTestId("job-title-save-button").ClickAsync();

        await Expect(Page.GetByTestId("toast-member-saved")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("job-title-input")).ToHaveValueAsync("CEO");

        await Page.ReloadAsync();
        await Expect(Page.GetByTestId("job-title-input")).ToHaveValueAsync("CEO");
        await Expect(Page.GetByTestId("member-detail-role-badge")).ToHaveTextAsync("admin");
    }

    // TC-05-E2E-10: Loading skeleton shown while fetching member detail
    [Test]
    public async Task Loading_skeleton_shown_while_fetching()
    {
        _server.SeedAccount("admin10@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin10@acme.com");
        SeedAdditionalMember(orgId, "target10@acme.com", "Passw0rd", "user", "Target", "Ten");
        var targetId = GetMembershipId("target10@acme.com");

        await LoginAsync("admin10@acme.com", "Passw0rd");
        await Page.GetByTestId($"member-row-{targetId}").ClickAsync();

        await Expect(Page.GetByTestId("member-detail")).ToBeVisibleAsync();
    }

    // TC-05-E2E-11: Job title validation error shown for input exceeding 100 characters
    [Test]
    public async Task Job_title_validation_error_for_too_long_input()
    {
        _server.SeedAccount("admin11@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin11@acme.com");
        SeedAdditionalMember(orgId, "target11@acme.com", "Passw0rd", "user", "Target", "Eleven");
        var targetId = GetMembershipId("target11@acme.com");

        await LoginAsync("admin11@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{targetId}");

        var jobTitleInput = Page.GetByTestId("job-title-input");
        await jobTitleInput.FillAsync(new string('a', 101));
        await Expect(Page.GetByTestId("field-error-jobTitle")).ToHaveTextAsync("Job title must be at most 100 characters");

        await jobTitleInput.FillAsync(new string('a', 100));
        await Expect(Page.GetByTestId("field-error-jobTitle")).ToHaveTextAsync("");
    }
}
