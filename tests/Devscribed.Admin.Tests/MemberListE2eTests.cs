using System.Net;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests;

public class MemberListE2eTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private WebApplicationFactory<Program> _factory = null!;

    private Guid _organizationId;
    private Account _adminAccount = null!;
    private Account _managerAccount = null!;
    private Account _userAccount = null!;
    private Account _viewerAccount = null!;
    private Membership _adminMembership = null!;
    private Membership _managerMembership = null!;
    private Membership _userMembership = null!;
    private Membership _viewerMembership = null!;
    private Membership _alexMembership = null!;
    private Membership _removedMembership = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _organizationId = Guid.NewGuid();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<AdminDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<AdminDbContext>(options => options.UseSqlite(_connection));

                services.AddAuthentication("Test")
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });
            });
        });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        await db.Database.EnsureCreatedAsync();

        var org = new Organization { Id = _organizationId, Name = "Acme Inc" };

        _adminAccount = new Account { Email = "admin@acme.com", PasswordHash = "x", FirstName = "Pat", LastName = "Owner" };
        _managerAccount = new Account { Email = "manager@acme.com", PasswordHash = "x", FirstName = "Mary", LastName = "Manager" };
        _userAccount = new Account { Email = "user@acme.com", PasswordHash = "x", FirstName = "Uma", LastName = "User" };
        _viewerAccount = new Account { Email = "viewer@acme.com", PasswordHash = "x", FirstName = "Victor", LastName = "Viewer" };
        var alexAccount = new Account { Email = "alex.k@acme.com", PasswordHash = "x", FirstName = "Alex", LastName = "Kaminski" };
        var removedAccount = new Account { Email = "removed@acme.com", PasswordHash = "x", FirstName = "Alesia", LastName = "Varaniuk" };

        _adminMembership = new Membership
        {
            AccountId = _adminAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Admin, Status = MembershipStatus.Active
        };
        _managerMembership = new Membership
        {
            AccountId = _managerAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Manager, Status = MembershipStatus.Active
        };
        _userMembership = new Membership
        {
            AccountId = _userAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };
        _viewerMembership = new Membership
        {
            AccountId = _viewerAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Viewer, Status = MembershipStatus.Active
        };
        _alexMembership = new Membership
        {
            AccountId = alexAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };
        _removedMembership = new Membership
        {
            AccountId = removedAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Removed
        };

        db.Organizations.Add(org);
        db.Accounts.AddRange(_adminAccount, _managerAccount, _userAccount, _viewerAccount, alexAccount, removedAccount);
        db.Memberships.AddRange(_adminMembership, _managerMembership, _userMembership, _viewerMembership, _alexMembership, _removedMembership);
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _connection.DisposeAsync();
    }

    private HttpClient CreateClientAs(Account account, MembershipRole role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-Test-AccountId", account.Id.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Email", account.Email);
        client.DefaultRequestHeaders.Add("X-Test-Role", role.ToString());
        client.DefaultRequestHeaders.Add("X-Test-OrgId", _organizationId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-OrgName", "Acme Inc");
        client.DefaultRequestHeaders.Add("X-Test-FirstName", account.FirstName);
        client.DefaultRequestHeaders.Add("X-Test-LastName", account.LastName);
        return client;
    }

    /// <summary>TC-05-E2E-01: Search-as-you-type controls are present on the members list.</summary>
    [Fact]
    public async Task Members_page_renders_search_controls_and_active_rows()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var page = await client.GetStringAsync("/Members");

        Assert.Contains("data-testid=\"members-list\"", page);
        Assert.Contains("data-testid=\"members-search-input\"", page);
        Assert.Contains("data-testid=\"show-removed-checkbox\"", page);
        Assert.Contains($"data-testid=\"member-row-{_alexMembership.Id}\"", page);
        Assert.DoesNotContain($"data-testid=\"member-row-{_removedMembership.Id}\" hidden", page);
        Assert.Contains("Alex Kaminski", page);
        Assert.DoesNotContain("Removed</span>", page);
    }

    /// <summary>TC-05-E2E-02: Removed members are rendered with a distinct badge when revealed in the combined list.</summary>
    [Fact]
    public async Task Members_page_includes_removed_rows_with_badges_for_client_side_reveal()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var page = await client.GetStringAsync("/Members");

        Assert.Contains($"data-testid=\"member-row-{_removedMembership.Id}\"", page);
        Assert.Contains($"data-testid=\"member-status-badge-{_removedMembership.Id}\"", page);
        Assert.Contains("data-status=\"removed\"", page);
        Assert.Contains("Show removed members", page);
    }

    /// <summary>TC-05-E2E-03: Admin deletes an active member, then restores them.</summary>
    [Fact]
    public async Task Admin_removes_member_then_restores_them()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var remove = await client.PostAsync($"/api/members/{_alexMembership.Id}/remove", null);
        Assert.Equal(HttpStatusCode.OK, remove.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
            var membership = await db.Memberships.FindAsync(_alexMembership.Id);
            Assert.Equal(MembershipStatus.Removed, membership!.Status);
        }

        var pageAfterRemove = await client.GetStringAsync("/Members");
        Assert.Contains($"data-testid=\"member-row-{_alexMembership.Id}\"", pageAfterRemove);
        Assert.Contains("data-status=\"removed\"", pageAfterRemove);
        Assert.Contains($"data-testid=\"member-status-badge-{_alexMembership.Id}\"", pageAfterRemove);

        var restore = await client.PostAsync($"/api/members/{_alexMembership.Id}/restore", null);
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
            var membership = await db.Memberships.FindAsync(_alexMembership.Id);
            Assert.Equal(MembershipStatus.Active, membership!.Status);
        }

        var pageAfterRestore = await client.GetStringAsync("/Members");
        Assert.Contains($"data-testid=\"member-row-{_alexMembership.Id}\"", pageAfterRestore);
        Assert.Contains("Alex Kaminski", pageAfterRestore);
    }

    /// <summary>TC-05-E2E-04: user/viewer see the list but no actions menu.</summary>
    [Theory]
    [InlineData(MembershipRole.User)]
    [InlineData(MembershipRole.Viewer)]
    public async Task User_and_viewer_see_members_without_actions(MembershipRole role)
    {
        var account = role == MembershipRole.User ? _userAccount : _viewerAccount;
        using var client = CreateClientAs(account, role);

        var page = await client.GetStringAsync("/Members");

        Assert.Contains("data-testid=\"members-list\"", page);
        Assert.Contains("data-testid=\"members-search-input\"", page);
        Assert.Contains($"data-testid=\"member-row-{_alexMembership.Id}\"", page);
        Assert.DoesNotContain("member-row-actions-", page);
        Assert.DoesNotContain("member-action-delete", page);
        Assert.DoesNotContain("member-action-restore", page);
    }
}
