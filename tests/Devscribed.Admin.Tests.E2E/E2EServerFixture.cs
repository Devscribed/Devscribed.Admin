using Devscribed.Admin.Web.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Net;
using System.Net.Sockets;

namespace Devscribed.Admin.Tests.E2E;

public class E2EServerFixture : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;

    public string BaseUrl { get; }

    private readonly InMemoryEmailSender _emailSender = new();

    public E2EServerFixture()
    {
        var port = GetFreePort();
        BaseUrl = $"http://localhost:{port}";
        var dbName = Guid.NewGuid().ToString();

        _factory = new KestrelWebApplicationFactory(BaseUrl, dbName, _emailSender);

        // Force the host to start by creating a client
        _factory.CreateClient();
    }

    public IServiceProvider Services => _factory.Services;

    public void SeedDuplicateUser()
    {
        SeedAccount("owner@acme.com", "Password1", "Existing", "User");
    }

    public Devscribed.Admin.Web.Models.Account SeedAccount(
        string email, string password, string firstName = "Pat", string lastName = "Owner", string status = "active",
        string orgName = "Existing Org", string role = "admin")
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
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
        var org = new Devscribed.Admin.Web.Models.Organization
        {
            Id = Guid.NewGuid(),
            Name = orgName,
            CreatedAt = DateTime.UtcNow,
        };
        var membership = new Devscribed.Admin.Web.Models.Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = role,
            Status = status,
            JoinedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Organizations.Add(org);
        db.Memberships.Add(membership);
        db.SaveChanges();
        return account;
    }

    public IReadOnlyCollection<InMemoryEmailSender.SentEmail> SentEmails => _emailSender.Sent;

    public void Dispose()
    {
        _factory.Dispose();
    }

    private static int GetFreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}

internal class KestrelWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _baseUrl;
    private readonly string _dbName;
    private readonly InMemoryEmailSender _emailSender;
    private IHost? _kestrelHost;

    public KestrelWebApplicationFactory(string baseUrl, string dbName, InMemoryEmailSender emailSender)
    {
        _baseUrl = baseUrl;
        _dbName = dbName;
        _emailSender = emailSender;
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var testHost = base.CreateHost(builder);

        builder.ConfigureWebHost(webHostBuilder =>
        {
            webHostBuilder.UseKestrel();
            webHostBuilder.UseUrls(_baseUrl);
        });

        _kestrelHost = builder.Build();
        _kestrelHost.Start();

        return testHost;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureServices(services =>
        {
            var descriptors = services
                .Where(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>)
                          || d.ServiceType.FullName?.Contains("EntityFrameworkCore") == true)
                .ToList();
            foreach (var d in descriptors) services.Remove(d);

            services.AddDbContext<AppDbContext>(options =>
                options.UseInMemoryDatabase(_dbName));

            var emailDescriptors = services
                .Where(d => d.ServiceType == typeof(Devscribed.Admin.Web.Services.IEmailSender))
                .ToList();
            foreach (var d in emailDescriptors) services.Remove(d);

            services.AddSingleton<Devscribed.Admin.Web.Services.IEmailSender>(_emailSender);
        });
    }

    protected override void Dispose(bool disposing)
    {
        _kestrelHost?.StopAsync().GetAwaiter().GetResult();
        _kestrelHost?.Dispose();
        base.Dispose(disposing);
    }
}
