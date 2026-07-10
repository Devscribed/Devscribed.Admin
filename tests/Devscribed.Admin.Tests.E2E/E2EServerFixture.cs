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

    public E2EServerFixture()
    {
        var port = GetFreePort();
        BaseUrl = $"http://localhost:{port}";
        var dbName = Guid.NewGuid().ToString();

        _factory = new KestrelWebApplicationFactory(BaseUrl, dbName);

        // Force the host to start by creating a client
        _factory.CreateClient();
    }

    public IServiceProvider Services => _factory.Services;

    public void SeedDuplicateUser()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Services.IPasswordHasher>();

        var account = new Devscribed.Admin.Web.Models.Account
        {
            Id = Guid.NewGuid(),
            Email = "owner@acme.com",
            PasswordHash = hasher.Hash("Password1"),
            FirstName = "Existing",
            LastName = "User",
            CreatedAt = DateTime.UtcNow,
        };
        var org = new Devscribed.Admin.Web.Models.Organization
        {
            Id = Guid.NewGuid(),
            Name = "Existing Org",
            CreatedAt = DateTime.UtcNow,
        };
        var membership = new Devscribed.Admin.Web.Models.Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = "admin",
            Status = "active",
            JoinedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Organizations.Add(org);
        db.Memberships.Add(membership);
        db.SaveChanges();
    }

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
    private IHost? _kestrelHost;

    public KestrelWebApplicationFactory(string baseUrl, string dbName)
    {
        _baseUrl = baseUrl;
        _dbName = dbName;
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
        });
    }

    protected override void Dispose(bool disposing)
    {
        _kestrelHost?.StopAsync().GetAwaiter().GetResult();
        _kestrelHost?.Dispose();
        base.Dispose(disposing);
    }
}
