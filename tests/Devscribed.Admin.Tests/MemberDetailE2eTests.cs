using System.Net;
using System.Net.Http.Json;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests;

/// <summary>TC-06-E2E-01 and TC-06-E2E-02: Member detail page end-to-end.</summary>
public class MemberDetailE2eTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private WebApplicationFactory<Program> _factory = null!;

    private Guid _organizationId;
    private Account _adminAccount = null!;
    private Account _userAccount = null!;
    private Account _alekseyAccount = null!;
    private Membership _alekseyMembership = null!;

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
        _userAccount = new Account { Email = "user@acme.com", PasswordHash = "x", FirstName = "Uma", LastName = "User" };
        _alekseyAccount = new Account { Email = "aleksey@acme.com", PasswordHash = "x", FirstName = "Aleksey", LastName = "Siniakevich" };

        var adminMembership = new Membership
        {
            AccountId = _adminAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Admin, Status = MembershipStatus.Active
        };
        var userMembership = new Membership
        {
            AccountId = _userAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };
        _alekseyMembership = new Membership
        {
            AccountId = _alekseyAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };

        db.Organizations.Add(org);
        db.Accounts.AddRange(_adminAccount, _userAccount, _alekseyAccount);
        db.Memberships.AddRange(adminMembership, userMembership, _alekseyMembership);
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

    /// <summary>TC-06-E2E-01: Admin edits Job title and it persists.</summary>
    [Fact]
    public async Task Admin_edits_job_title_and_it_persists()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var page = await client.GetStringAsync($"/MemberDetail/{_alekseyMembership.Id}");

        Assert.Contains("data-testid=\"member-detail\"", page);
        Assert.Contains("data-testid=\"member-detail-tab-about\"", page);
        Assert.Contains("data-testid=\"member-detail-name\"", page);
        Assert.Contains("Aleksey Siniakevich", page);
        Assert.Contains("data-testid=\"member-detail-joined\"", page);
        Assert.Contains("data-testid=\"member-detail-email\"", page);
        Assert.Contains("data-testid=\"member-detail-timezone\"", page);
        Assert.Contains("data-testid=\"job-title-input\"", page);
        Assert.Contains("data-testid=\"job-title-save-button\"", page);

        var saveResponse = await client.PutAsJsonAsync(
            $"/api/members/{_alekseyMembership.Id}/job-title",
            new { jobTitle = "Backend Engineer" });
        Assert.Equal(HttpStatusCode.OK, saveResponse.StatusCode);

        var pageAfterSave = await client.GetStringAsync($"/MemberDetail/{_alekseyMembership.Id}");
        Assert.Contains("Backend Engineer", pageAfterSave);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var membership = await db.Memberships.FindAsync(_alekseyMembership.Id);
        Assert.Equal("Backend Engineer", membership!.JobTitle);
    }

    /// <summary>TC-06-E2E-02: user sees a read-only About with no editor.</summary>
    [Fact]
    public async Task User_sees_readonly_about_with_no_editor()
    {
        using var client = CreateClientAs(_userAccount, MembershipRole.User);

        var page = await client.GetStringAsync($"/MemberDetail/{_alekseyMembership.Id}");

        Assert.Contains("data-testid=\"member-detail\"", page);
        Assert.Contains("data-testid=\"member-detail-tab-about\"", page);
        Assert.Contains("data-testid=\"job-title-readonly\"", page);
        Assert.DoesNotContain("data-testid=\"job-title-input\"", page);
        Assert.DoesNotContain("data-testid=\"job-title-save-button\"", page);
    }

    /// <summary>Members list links to detail page.</summary>
    [Fact]
    public async Task Members_list_links_to_detail_page()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var page = await client.GetStringAsync("/Members");

        Assert.Contains($"/MemberDetail/{_alekseyMembership.Id}", page);
    }
}
